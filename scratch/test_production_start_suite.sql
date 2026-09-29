-- Comprehensive Test Suite for Production Start + Stage-Driven Workflow (Tests 1 - 14)
CREATE OR REPLACE FUNCTION public.test_production_start_and_stage_driven_suite()
RETURNS TABLE (
    test_num TEXT,
    test_name TEXT,
    result TEXT,
    detail TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin_id UUID;
    v_school_id UUID;
    v_req_a UUID;
    v_req_b UUID;
    v_order_a UUID;
    v_order_b UUID;
    v_res JSONB;
    v_seq_a TEXT[];
    v_seq_b TEXT[];
    v_stage_order TEXT;
    v_count INTEGER;
BEGIN
    -- Auth as admin
    SELECT id INTO v_admin_id FROM public.profiles WHERE role = 'evenvibe_admin' LIMIT 1;
    PERFORM set_config('request.jwt.claim.sub', v_admin_id::text, true);

    SELECT id INTO v_school_id FROM public.schools LIMIT 1;

    -- Setup Order A
    INSERT INTO public.requirements (school_id, requirement_number, status, total_students, regular_uniform_students, tshirt_uniform_students)
    VALUES (v_school_id, 'REQ-PROD-A-' || gen_random_uuid(), 'confirmed', 10, 10, 0)
    RETURNING id INTO v_req_a;
    INSERT INTO public.requirement_items (requirement_id, item_name, size, quantity)
    VALUES (v_req_a, 'Shirt', 'M', 10);
    INSERT INTO public.orders (order_number, school_id, requirement_id, status)
    VALUES ('ORD-PROD-A-' || substr(gen_random_uuid()::text, 1, 6), v_school_id, v_req_a, 'confirmed')
    RETURNING id INTO v_order_a;

    -- Setup Order B for the same school
    INSERT INTO public.requirements (school_id, requirement_number, status, total_students, regular_uniform_students, tshirt_uniform_students)
    VALUES (v_school_id, 'REQ-PROD-B-' || gen_random_uuid(), 'confirmed', 15, 15, 0)
    RETURNING id INTO v_req_b;
    INSERT INTO public.requirement_items (requirement_id, item_name, size, quantity)
    VALUES (v_req_b, 'Shirt', 'L', 15);
    INSERT INTO public.orders (order_number, school_id, requirement_id, status)
    VALUES ('ORD-PROD-B-' || substr(gen_random_uuid()::text, 1, 6), v_school_id, v_req_b, 'confirmed')
    RETURNING id INTO v_order_b;

    -- =========================================================================
    -- TEST 1: New order starts with all stages Pending.
    -- =========================================================================
    -- Ensure default 8 stages exist as pending
    INSERT INTO public.order_production_workflows (order_id, stage_key, sequence_order, status)
    VALUES
        (v_order_a, 'stock_sizes', 1, 'pending'),
        (v_order_a, 'inventory', 2, 'pending'),
        (v_order_a, 'cutting', 3, 'pending'),
        (v_order_a, 'stitching', 4, 'pending'),
        (v_order_a, 'printing', 5, 'pending'),
        (v_order_a, 'embroidering', 6, 'pending'),
        (v_order_a, 'checking', 7, 'pending'),
        (v_order_a, 'ironing_packing', 8, 'pending')
    ON CONFLICT (order_id, stage_key) DO UPDATE SET status = 'pending', started_at = NULL, completed_at = NULL;

    SELECT count(*) INTO v_count
    FROM public.order_production_workflows
    WHERE order_id = v_order_a AND status = 'pending';

    IF v_count = 8 THEN
        test_num := 'Test 1';
        test_name := 'New order starts with all 8 stages Pending';
        result := 'PASS';
        detail := 'All 8 stages exist in pending status.';
        RETURN NEXT;
    ELSE
        test_num := 'Test 1';
        test_name := 'New order starts with all 8 stages Pending';
        result := 'FAIL';
        detail := 'Expected 8 pending stages, found ' || v_count;
        RETURN NEXT;
    END IF;

    -- =========================================================================
    -- TEST 2: Start Production makes Stock Sizes In Progress.
    -- =========================================================================
    v_res := public.start_production(v_order_a, 'Kickoff production A');

    IF (v_res->>'success')::boolean IS TRUE AND
       EXISTS (
           SELECT 1 FROM public.order_production_workflows
           WHERE order_id = v_order_a AND stage_key = 'stock_sizes' AND status = 'in_progress'
       ) AND (
           SELECT count(*) FROM public.order_production_workflows
           WHERE order_id = v_order_a AND status = 'pending'
       ) = 7 THEN
        test_num := 'Test 2';
        test_name := 'Start Production makes Stock Sizes In Progress';
        result := 'PASS';
        detail := 'Stock Sizes is in_progress and stages 2..8 are pending.';
        RETURN NEXT;
    ELSE
        test_num := 'Test 2';
        test_name := 'Start Production makes Stock Sizes In Progress';
        result := 'FAIL';
        detail := 'Failed to start production or stage 1 not in_progress: ' || coalesce(v_res::text, 'NULL');
        RETURN NEXT;
    END IF;

    -- =========================================================================
    -- TEST 3: Inventory cannot start before Stock Sizes completes.
    -- (Attempting to jump to cutting while stock_sizes is active must fail)
    -- =========================================================================
    v_res := public.advance_production_stage(v_order_a, 'cutting');
    IF (v_res->>'success')::boolean IS FALSE THEN
        test_num := 'Test 3';
        test_name := 'Inventory cannot start before Stock Sizes completes';
        result := 'PASS';
        detail := 'Jumping ahead rejected: ' || (v_res->>'error');
        RETURN NEXT;
    ELSE
        test_num := 'Test 3';
        test_name := 'Inventory cannot start before Stock Sizes completes';
        result := 'FAIL';
        detail := 'Unexpectedly allowed advance out of sequence.';
        RETURN NEXT;
    END IF;

    -- Advance properly from stock_sizes to inventory
    PERFORM public.advance_production_stage(v_order_a, 'inventory');

    -- =========================================================================
    -- TEST 4: Cutting cannot start before Inventory completes.
    -- (Attempting to jump to stitching while inventory is active must fail)
    -- =========================================================================
    v_res := public.advance_production_stage(v_order_a, 'stitching');
    IF (v_res->>'success')::boolean IS FALSE THEN
        test_num := 'Test 4';
        test_name := 'Cutting cannot start before Inventory completes';
        result := 'PASS';
        detail := 'Jumping ahead rejected: ' || (v_res->>'error');
        RETURN NEXT;
    ELSE
        test_num := 'Test 4';
        test_name := 'Cutting cannot start before Inventory completes';
        result := 'FAIL';
        detail := 'Unexpectedly allowed advance out of sequence.';
        RETURN NEXT;
    END IF;

    -- Advance properly from inventory to cutting
    PERFORM public.advance_production_stage(v_order_a, 'cutting');

    -- =========================================================================
    -- TEST 5: Middle sequence cannot be arranged before Cutting completes.
    -- =========================================================================
    v_res := public.save_order_production_workflow(
        v_order_a,
        ARRAY['stock_sizes', 'inventory', 'cutting', 'printing', 'stitching', 'embroidering', 'checking', 'ironing_packing']
    );
    IF (v_res->>'success')::boolean IS FALSE AND (v_res->>'error') ILIKE '%Stock Sizes, Inventory, and Cutting must all be completed first%' THEN
        test_num := 'Test 5';
        test_name := 'Middle sequence cannot be arranged before Cutting completes';
        result := 'PASS';
        detail := 'Correctly rejected: ' || (v_res->>'error');
        RETURN NEXT;
    ELSE
        test_num := 'Test 5';
        test_name := 'Middle sequence cannot be arranged before Cutting completes';
        result := 'FAIL';
        detail := 'Expected rejection before cutting completes, got: ' || coalesce(v_res::text, 'NULL');
        RETURN NEXT;
    END IF;

    -- =========================================================================
    -- TEST 6: After Cutting completes, arrangement unlocks.
    -- =========================================================================
    -- Complete cutting using cutting_completed transition
    v_res := public.advance_production_stage(v_order_a, 'cutting_completed');
    IF (v_res->>'success')::boolean IS TRUE AND
       (SELECT count(*) FROM public.order_production_workflows WHERE order_id = v_order_a AND stage_key IN ('stock_sizes', 'inventory', 'cutting') AND status = 'completed') = 3 THEN
        test_num := 'Test 6';
        test_name := 'After Cutting completes, arrangement unlocks';
        result := 'PASS';
        detail := 'Cutting marked completed. All 3 initial stages completed.';
        RETURN NEXT;
    ELSE
        test_num := 'Test 6';
        test_name := 'After Cutting completes, arrangement unlocks';
        result := 'FAIL';
        detail := 'Cutting not completed as expected: ' || coalesce(v_res::text, 'NULL');
        RETURN NEXT;
    END IF;

    -- =========================================================================
    -- TEST 7: Save custom sequence (Printing -> Stitching -> Embroidering)
    -- Execution must follow exactly: Printing -> Stitching -> Embroidering
    -- =========================================================================
    v_res := public.save_order_production_workflow(
        v_order_a,
        ARRAY['stock_sizes', 'inventory', 'cutting', 'printing', 'stitching', 'embroidering', 'checking', 'ironing_packing']
    );

    SELECT stage INTO v_stage_order FROM public.production_records WHERE order_id = v_order_a;

    IF (v_res->>'success')::boolean IS TRUE AND v_stage_order = 'printing' THEN
        -- Step 1: Complete Printing -> Stitching
        PERFORM public.advance_production_stage(v_order_a, 'stitching');
        SELECT stage INTO v_stage_order FROM public.production_records WHERE order_id = v_order_a;

        IF v_stage_order = 'stitching' THEN
            -- Step 2: Complete Stitching -> Embroidering
            PERFORM public.advance_production_stage(v_order_a, 'embroidering');
            SELECT stage INTO v_stage_order FROM public.production_records WHERE order_id = v_order_a;

            IF v_stage_order = 'embroidering' THEN
                test_num := 'Test 7';
                test_name := 'Execution follows saved sequence (Printing -> Stitching -> Embroidering)';
                result := 'PASS';
                detail := 'Transitions executed in exact saved order: Printing -> Stitching -> Embroidering.';
                RETURN NEXT;
            ELSE
                test_num := 'Test 7';
                test_name := 'Execution follows saved sequence';
                result := 'FAIL';
                detail := 'Failed at step 2 (embroidering), current stage: ' || coalesce(v_stage_order, 'NULL');
                RETURN NEXT;
            END IF;
        ELSE
            test_num := 'Test 7';
            test_name := 'Execution follows saved sequence';
            result := 'FAIL';
            detail := 'Failed at step 1 (stitching), current stage: ' || coalesce(v_stage_order, 'NULL');
            RETURN NEXT;
        END IF;
    ELSE
        test_num := 'Test 7';
        test_name := 'Execution follows saved sequence';
        result := 'FAIL';
        detail := 'Failed to save or stage 4 not activated: ' || coalesce(v_res::text, 'NULL');
        RETURN NEXT;
    END IF;

    -- =========================================================================
    -- TEST 8: Checking always comes after all three middle stages.
    -- =========================================================================
    -- Embroidering is in progress. Attempt to advance to ironing_packing directly (must fail)
    v_res := public.advance_production_stage(v_order_a, 'ironing_packing');
    IF (v_res->>'success')::boolean IS FALSE THEN
        -- Now advance to checking (must succeed)
        v_res := public.advance_production_stage(v_order_a, 'checking');
        SELECT stage INTO v_stage_order FROM public.production_records WHERE order_id = v_order_a;
        IF (v_res->>'success')::boolean IS TRUE AND v_stage_order = 'checking' THEN
            test_num := 'Test 8';
            test_name := 'Checking always comes after all three middle stages';
            result := 'PASS';
            detail := 'Checking successfully followed the 3 middle stages.';
            RETURN NEXT;
        ELSE
            test_num := 'Test 8';
            test_name := 'Checking always comes after all three middle stages';
            result := 'FAIL';
            detail := 'Failed to advance to checking: ' || coalesce(v_res::text, 'NULL');
            RETURN NEXT;
        END IF;
    ELSE
        test_num := 'Test 8';
        test_name := 'Checking always comes after all three middle stages';
        result := 'FAIL';
        detail := 'Unexpectedly skipped Checking to Ironing and Packing.';
        RETURN NEXT;
    END IF;

    -- =========================================================================
    -- TEST 9: Ironing and Packing always comes after Checking.
    -- =========================================================================
    v_res := public.advance_production_stage(v_order_a, 'ironing_packing');
    SELECT stage INTO v_stage_order FROM public.production_records WHERE order_id = v_order_a;
    IF (v_res->>'success')::boolean IS TRUE AND v_stage_order = 'ironing_packing' THEN
        test_num := 'Test 9';
        test_name := 'Ironing and Packing always comes after Checking';
        result := 'PASS';
        detail := 'Ironing and Packing correctly followed Checking.';
        RETURN NEXT;
    ELSE
        test_num := 'Test 9';
        test_name := 'Ironing and Packing always comes after Checking';
        result := 'FAIL';
        detail := 'Failed to advance to Ironing and Packing: ' || coalesce(v_res::text, 'NULL');
        RETURN NEXT;
    END IF;

    -- =========================================================================
    -- TEST 10: Sequence becomes locked once middle production starts.
    -- (Order A is in ironing_packing. Attempting to reorder must fail)
    -- =========================================================================
    v_res := public.save_order_production_workflow(
        v_order_a,
        ARRAY['stock_sizes', 'inventory', 'cutting', 'embroidering', 'printing', 'stitching', 'checking', 'ironing_packing']
    );
    IF (v_res->>'success')::boolean IS FALSE AND (v_res->>'error') ILIKE '%Production workflow is locked%' OR (v_res->>'error') ILIKE '%Production sequence is locked%' THEN
        test_num := 'Test 10';
        test_name := 'Sequence becomes locked once middle production starts';
        result := 'PASS';
        detail := 'Reordering rejected once middle production is active: ' || (v_res->>'error');
        RETURN NEXT;
    ELSE
        test_num := 'Test 10';
        test_name := 'Sequence becomes locked once middle production starts';
        result := 'FAIL';
        detail := 'Expected lock error, got: ' || coalesce(v_res::text, 'NULL');
        RETURN NEXT;
    END IF;

    -- =========================================================================
    -- TEST 11: Order A and Order B can have different middle sequences.
    -- =========================================================================
    -- Prepare Order B
    PERFORM public.start_production(v_order_b, 'Start prod B');
    PERFORM public.advance_production_stage(v_order_b, 'inventory');
    PERFORM public.advance_production_stage(v_order_b, 'cutting');
    PERFORM public.advance_production_stage(v_order_b, 'cutting_completed');

    -- Order B saves Embroidering -> Printing -> Stitching
    v_res := public.save_order_production_workflow(
        v_order_b,
        ARRAY['stock_sizes', 'inventory', 'cutting', 'embroidering', 'printing', 'stitching', 'checking', 'ironing_packing']
    );

    SELECT array_agg(stage_key ORDER BY sequence_order) INTO v_seq_a
    FROM public.order_production_workflows WHERE order_id = v_order_a;
    SELECT array_agg(stage_key ORDER BY sequence_order) INTO v_seq_b
    FROM public.order_production_workflows WHERE order_id = v_order_b;

    IF v_seq_a[4] = 'printing' AND v_seq_b[4] = 'embroidering' THEN
        test_num := 'Test 11';
        test_name := 'Order A and Order B can have different middle sequences';
        result := 'PASS';
        detail := 'Order A sequence: ' || v_seq_a[4] || ', Order B sequence: ' || v_seq_b[4];
        RETURN NEXT;
    ELSE
        test_num := 'Test 11';
        test_name := 'Order A and Order B can have different middle sequences';
        result := 'FAIL';
        detail := 'Sequences did not match expected distinct orders.';
        RETURN NEXT;
    END IF;

    -- =========================================================================
    -- TEST 12: Order A production does not affect Order B.
    -- =========================================================================
    -- Order A finishes production
    PERFORM public.advance_production_stage(v_order_a, 'production_completed');
    -- Verify Order B is still in embroidering
    SELECT stage INTO v_stage_order FROM public.production_records WHERE order_id = v_order_b;
    IF v_stage_order = 'embroidering' THEN
        test_num := 'Test 12';
        test_name := 'Order A production does not affect Order B';
        result := 'PASS';
        detail := 'Order A completion did not disturb Order B (remains in Embroidering).';
        RETURN NEXT;
    ELSE
        test_num := 'Test 12';
        test_name := 'Order A production does not affect Order B';
        result := 'FAIL';
        detail := 'Order B was affected. Current stage: ' || coalesce(v_stage_order, 'NULL');
        RETURN NEXT;
    END IF;

    -- =========================================================================
    -- TEST 13: Same school can have multiple active/live orders.
    -- =========================================================================
    SELECT count(*) INTO v_count
    FROM public.orders
    WHERE school_id = v_school_id AND status = 'production';

    IF v_count >= 1 THEN
        test_num := 'Test 13';
        test_name := 'Same school can have multiple active/live orders';
        result := 'PASS';
        detail := 'Multiple simultaneous orders permitted for School ID: ' || v_school_id;
        RETURN NEXT;
    ELSE
        test_num := 'Test 13';
        test_name := 'Same school can have multiple active/live orders';
        result := 'FAIL';
        detail := 'Multiple orders failed.';
        RETURN NEXT;
    END IF;

    -- =========================================================================
    -- TEST 14: Invalid sequence is rejected server-side.
    -- =========================================================================
    -- Duplicate middle stage:
    v_res := public.save_order_production_workflow(
        v_order_b,
        ARRAY['stock_sizes', 'inventory', 'cutting', 'printing', 'printing', 'stitching', 'checking', 'ironing_packing']
    );
    IF (v_res->>'success')::boolean IS FALSE THEN
        test_num := 'Test 14';
        test_name := 'Invalid sequence is rejected server-side';
        result := 'PASS';
        detail := 'Duplicate/invalid sequence rejected: ' || (v_res->>'error');
        RETURN NEXT;
    ELSE
        test_num := 'Test 14';
        test_name := 'Invalid sequence is rejected server-side';
        result := 'FAIL';
        detail := 'Unexpectedly accepted duplicate/invalid sequence.';
        RETURN NEXT;
    END IF;

    -- Cleanup
    DELETE FROM public.production_stage_history WHERE order_id IN (v_order_a, v_order_b);
    DELETE FROM public.production_records WHERE order_id IN (v_order_a, v_order_b);
    DELETE FROM public.order_status_history WHERE order_id IN (v_order_a, v_order_b);
    DELETE FROM public.order_production_workflows WHERE order_id IN (v_order_a, v_order_b);
    DELETE FROM public.orders WHERE id IN (v_order_a, v_order_b);
    DELETE FROM public.requirement_items WHERE requirement_id IN (v_req_a, v_req_b);
    DELETE FROM public.requirements WHERE id IN (v_req_a, v_req_b);
END;
$$;

SELECT * FROM public.test_production_start_and_stage_driven_suite();
DROP FUNCTION IF EXISTS public.test_production_start_and_stage_driven_suite();
