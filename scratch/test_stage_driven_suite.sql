-- Test Suite for Stage-Driven Middle Sequence Arrangement (Tests 1 - 10)
CREATE OR REPLACE FUNCTION public.test_stage_driven_suite()
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
    v_req_c UUID;
    v_order_a UUID;
    v_order_b UUID;
    v_order_c UUID;
    v_res JSONB;
    v_seq_a TEXT[];
    v_seq_b TEXT[];
    v_stage_order TEXT;
BEGIN
    -- Auth as admin
    SELECT id INTO v_admin_id FROM public.profiles WHERE role = 'evenvibe_admin' LIMIT 1;
    PERFORM set_config('request.jwt.claim.sub', v_admin_id::text, true);

    SELECT id INTO v_school_id FROM public.schools LIMIT 1;

    -- Setup Order A
    INSERT INTO public.requirements (school_id, requirement_number, status, total_students, regular_uniform_students, tshirt_uniform_students)
    VALUES (v_school_id, 'REQ-SD-A-' || gen_random_uuid(), 'confirmed', 10, 10, 0)
    RETURNING id INTO v_req_a;
    INSERT INTO public.requirement_items (requirement_id, item_name, size, quantity)
    VALUES (v_req_a, 'Shirt', 'M', 10);
    INSERT INTO public.orders (order_number, school_id, requirement_id, status)
    VALUES ('ORD-SD-A-' || substr(gen_random_uuid()::text, 1, 6), v_school_id, v_req_a, 'confirmed')
    RETURNING id INTO v_order_a;

    -- Setup Order B
    INSERT INTO public.requirements (school_id, requirement_number, status, total_students, regular_uniform_students, tshirt_uniform_students)
    VALUES (v_school_id, 'REQ-SD-B-' || gen_random_uuid(), 'confirmed', 10, 10, 0)
    RETURNING id INTO v_req_b;
    INSERT INTO public.requirement_items (requirement_id, item_name, size, quantity)
    VALUES (v_req_b, 'Shirt', 'M', 10);
    INSERT INTO public.orders (order_number, school_id, requirement_id, status)
    VALUES ('ORD-SD-B-' || substr(gen_random_uuid()::text, 1, 6), v_school_id, v_req_b, 'confirmed')
    RETURNING id INTO v_order_b;

    -- Setup Order C (for negative test cases)
    INSERT INTO public.requirements (school_id, requirement_number, status, total_students, regular_uniform_students, tshirt_uniform_students)
    VALUES (v_school_id, 'REQ-SD-C-' || gen_random_uuid(), 'confirmed', 10, 10, 0)
    RETURNING id INTO v_req_c;
    INSERT INTO public.requirement_items (requirement_id, item_name, size, quantity)
    VALUES (v_req_c, 'Shirt', 'M', 10);
    INSERT INTO public.orders (order_number, school_id, requirement_id, status)
    VALUES ('ORD-SD-C-' || substr(gen_random_uuid()::text, 1, 6), v_school_id, v_req_c, 'confirmed')
    RETURNING id INTO v_order_c;

    -- Initialize production workflow for all three orders
    PERFORM public.start_production(v_order_a, 'Start prod A');
    PERFORM public.start_production(v_order_b, 'Start prod B');
    PERFORM public.start_production(v_order_c, 'Start prod C');

    -- =========================================================================
    -- TEST 1: Before initial stages complete (Order C: stock_sizes in progress, inventory pending, cutting pending)
    -- Verify save is rejected
    -- =========================================================================
    v_res := public.save_order_production_workflow(
        v_order_c,
        ARRAY['stock_sizes', 'inventory', 'cutting', 'printing', 'stitching', 'embroidering', 'checking', 'ironing_packing']
    );
    IF (v_res->>'success')::boolean IS FALSE AND (v_res->>'error') ILIKE '%Stock Sizes, Inventory, and Cutting must all be completed first%' THEN
        test_num := 'TEST 1';
        test_name := 'Save Rejected When Initial Stages Pending/In Progress';
        result := 'PASS';
        detail := 'Correctly rejected with: ' || (v_res->>'error');
        RETURN NEXT;
    ELSE
        test_num := 'TEST 1';
        test_name := 'Save Rejected When Initial Stages Pending/In Progress';
        result := 'FAIL';
        detail := 'Expected failure, got: ' || coalesce(v_res::text, 'NULL');
        RETURN NEXT;
    END IF;

    -- =========================================================================
    -- TEST 2: Complete Stock Sizes and Inventory only on Order C (Cutting still pending)
    -- Verify save is still rejected
    -- =========================================================================
    PERFORM public.advance_production_stage(v_order_c, 'inventory'); -- stock_sizes completed, inventory in progress
    PERFORM public.advance_production_stage(v_order_c, 'cutting');   -- inventory completed, cutting in progress
    v_res := public.save_order_production_workflow(
        v_order_c,
        ARRAY['stock_sizes', 'inventory', 'cutting', 'printing', 'stitching', 'embroidering', 'checking', 'ironing_packing']
    );
    IF (v_res->>'success')::boolean IS FALSE AND (v_res->>'error') ILIKE '%Stock Sizes, Inventory, and Cutting must all be completed first%' THEN
        test_num := 'TEST 2';
        test_name := 'Save Rejected When Cutting Is Still In Progress';
        result := 'PASS';
        detail := 'Correctly rejected with: ' || (v_res->>'error');
        RETURN NEXT;
    ELSE
        test_num := 'TEST 2';
        test_name := 'Save Rejected When Cutting Is Still In Progress';
        result := 'FAIL';
        detail := 'Expected failure while cutting pending, got: ' || coalesce(v_res::text, 'NULL');
        RETURN NEXT;
    END IF;

    -- =========================================================================
    -- TEST 3: Complete all 3 initial stages on Order A
    -- =========================================================================
    PERFORM public.advance_production_stage(v_order_a, 'inventory');
    PERFORM public.advance_production_stage(v_order_a, 'cutting');
    PERFORM public.advance_production_stage(v_order_a, 'stitching'); -- Advances beyond cutting, completing cutting

    IF (SELECT count(*) FROM public.order_production_workflows WHERE order_id = v_order_a AND stage_key IN ('stock_sizes', 'inventory', 'cutting') AND status = 'completed') = 3 THEN
        test_num := 'TEST 3';
        test_name := 'Complete All 3 Initial Stages';
        result := 'PASS';
        detail := 'Stock Sizes, Inventory, and Cutting are all completed.';
        RETURN NEXT;
    ELSE
        test_num := 'TEST 3';
        test_name := 'Complete All 3 Initial Stages';
        result := 'FAIL';
        detail := 'Initial 3 stages not completed as expected.';
        RETURN NEXT;
    END IF;

    -- =========================================================================
    -- TEST 4: Save custom sequence (Printing -> Stitching -> Embroidering) on Order A
    -- =========================================================================
    v_res := public.save_order_production_workflow(
        v_order_a,
        ARRAY['stock_sizes', 'inventory', 'cutting', 'printing', 'stitching', 'embroidering', 'checking', 'ironing_packing']
    );
    IF (v_res->>'success')::boolean IS TRUE THEN
        SELECT array_agg(stage_key ORDER BY sequence_order) INTO v_seq_a
        FROM public.order_production_workflows WHERE order_id = v_order_a;

        IF v_seq_a = ARRAY['stock_sizes', 'inventory', 'cutting', 'printing', 'stitching', 'embroidering', 'checking', 'ironing_packing'] THEN
            test_num := 'TEST 4';
            test_name := 'Save Custom Sequence (Printing -> Stitching -> Embroidering)';
            result := 'PASS';
            detail := 'Workflow updated to: ' || array_to_string(v_seq_a, ' -> ');
            RETURN NEXT;
        ELSE
            test_num := 'TEST 4';
            test_name := 'Save Custom Sequence';
            result := 'FAIL';
            detail := 'Unexpected sequence: ' || array_to_string(v_seq_a, ' -> ');
            RETURN NEXT;
        END IF;
    ELSE
        test_num := 'TEST 4';
        test_name := 'Save Custom Sequence';
        result := 'FAIL';
        detail := 'Failed to save: ' || (v_res->>'error');
        RETURN NEXT;
    END IF;

    -- =========================================================================
    -- TEST 5: Execute saved sequence on Order A
    -- After Cutting completed -> Printing
    -- After Printing completed -> Stitching
    -- After Stitching completed -> Embroidering
    -- After Embroidering completed -> Checking
    -- After Checking completed -> Ironing and Packing
    -- =========================================================================
    SELECT stage INTO v_stage_order FROM public.production_records WHERE order_id = v_order_a;
    IF v_stage_order != 'printing' THEN
        test_num := 'TEST 5';
        test_name := 'Execute Saved Sequence Step 1';
        result := 'FAIL';
        detail := 'Expected printing after cutting, got: ' || coalesce(v_stage_order, 'NULL');
        RETURN NEXT;
    END IF;

    -- Printing -> Stitching
    PERFORM public.advance_production_stage(v_order_a, 'stitching');
    SELECT stage INTO v_stage_order FROM public.production_records WHERE order_id = v_order_a;
    IF v_stage_order != 'stitching' THEN
        test_num := 'TEST 5';
        test_name := 'Execute Saved Sequence Step 2';
        result := 'FAIL';
        detail := 'Expected stitching after printing, got: ' || coalesce(v_stage_order, 'NULL');
        RETURN NEXT;
    END IF;

    -- Stitching -> Embroidering
    PERFORM public.advance_production_stage(v_order_a, 'embroidering');
    SELECT stage INTO v_stage_order FROM public.production_records WHERE order_id = v_order_a;
    IF v_stage_order != 'embroidering' THEN
        test_num := 'TEST 5';
        test_name := 'Execute Saved Sequence Step 3';
        result := 'FAIL';
        detail := 'Expected embroidering after stitching, got: ' || coalesce(v_stage_order, 'NULL');
        RETURN NEXT;
    END IF;

    -- Embroidering -> Checking
    PERFORM public.advance_production_stage(v_order_a, 'checking');
    SELECT stage INTO v_stage_order FROM public.production_records WHERE order_id = v_order_a;
    IF v_stage_order != 'checking' THEN
        test_num := 'TEST 5';
        test_name := 'Execute Saved Sequence Step 4';
        result := 'FAIL';
        detail := 'Expected checking after embroidering, got: ' || coalesce(v_stage_order, 'NULL');
        RETURN NEXT;
    END IF;

    -- Checking -> Ironing and Packing
    PERFORM public.advance_production_stage(v_order_a, 'ironing_packing');
    SELECT stage INTO v_stage_order FROM public.production_records WHERE order_id = v_order_a;
    IF v_stage_order = 'ironing_packing' THEN
        test_num := 'TEST 5';
        test_name := 'Execute Saved Sequence (Cutting -> Printing -> Stitching -> Embroidering -> Checking -> Ironing and Packing)';
        result := 'PASS';
        detail := 'All stage transitions executed exactly along saved custom sequence.';
        RETURN NEXT;
    ELSE
        test_num := 'TEST 5';
        test_name := 'Execute Saved Sequence Step 5';
        result := 'FAIL';
        detail := 'Expected ironing_packing after checking, got: ' || coalesce(v_stage_order, 'NULL');
        RETURN NEXT;
    END IF;

    -- =========================================================================
    -- TEST 6: Different Order (Order B saves Embroidering -> Printing -> Stitching)
    -- Complete cutting on Order B first
    -- =========================================================================
    PERFORM public.advance_production_stage(v_order_b, 'inventory');
    PERFORM public.advance_production_stage(v_order_b, 'cutting');
    PERFORM public.advance_production_stage(v_order_b, 'stitching'); -- Completes cutting

    v_res := public.save_order_production_workflow(
        v_order_b,
        ARRAY['stock_sizes', 'inventory', 'cutting', 'embroidering', 'printing', 'stitching', 'checking', 'ironing_packing']
    );
    SELECT stage INTO v_stage_order FROM public.production_records WHERE order_id = v_order_b;
    IF (v_res->>'success')::boolean IS TRUE AND v_stage_order = 'embroidering' THEN
        test_num := 'TEST 6';
        test_name := 'Different Order Saves Custom Sequence (Embroidering First)';
        result := 'PASS';
        detail := 'Order B saved sequence starting with Embroidering, current stage is Embroidering.';
        RETURN NEXT;
    ELSE
        test_num := 'TEST 6';
        test_name := 'Different Order Saves Custom Sequence';
        result := 'FAIL';
        detail := 'Failed to save or stage mismatch: ' || coalesce(v_res::text, 'NULL');
        RETURN NEXT;
    END IF;

    -- =========================================================================
    -- TEST 7: Order Independence
    -- Order A has Printing -> Stitching -> Embroidering
    -- Order B has Embroidering -> Printing -> Stitching
    -- Verify both remain independent
    -- =========================================================================
    SELECT array_agg(stage_key ORDER BY sequence_order) INTO v_seq_a
    FROM public.order_production_workflows WHERE order_id = v_order_a;
    SELECT array_agg(stage_key ORDER BY sequence_order) INTO v_seq_b
    FROM public.order_production_workflows WHERE order_id = v_order_b;

    IF v_seq_a[4] = 'printing' AND v_seq_b[4] = 'embroidering' THEN
        test_num := 'TEST 7';
        test_name := 'Order Independence';
        result := 'PASS';
        detail := 'Order A (Printing first) and Order B (Embroidering first) remain independent.';
        RETURN NEXT;
    ELSE
        test_num := 'TEST 7';
        test_name := 'Order Independence';
        result := 'FAIL';
        detail := 'Sequences collided.';
        RETURN NEXT;
    END IF;

    -- =========================================================================
    -- TEST 8: Fixed first stages (Attempt to swap Cutting and Stock Sizes on Order B)
    -- Must FAIL
    -- =========================================================================
    v_res := public.save_order_production_workflow(
        v_order_b,
        ARRAY['cutting', 'inventory', 'stock_sizes', 'embroidering', 'printing', 'stitching', 'checking', 'ironing_packing']
    );
    IF (v_res->>'success')::boolean IS FALSE THEN
        test_num := 'TEST 8';
        test_name := 'Fixed First Stages Cannot Be Modified';
        result := 'PASS';
        detail := 'Attempt to modify fixed initial stages rejected: ' || (v_res->>'error');
        RETURN NEXT;
    ELSE
        test_num := 'TEST 8';
        test_name := 'Fixed First Stages Cannot Be Modified';
        result := 'FAIL';
        detail := 'Expected failure when altering initial stages.';
        RETURN NEXT;
    END IF;

    -- =========================================================================
    -- TEST 9: Fixed final stages (Attempt to swap Checking and Ironing and Packing)
    -- Must FAIL
    -- =========================================================================
    v_res := public.save_order_production_workflow(
        v_order_b,
        ARRAY['stock_sizes', 'inventory', 'cutting', 'embroidering', 'printing', 'stitching', 'ironing_packing', 'checking']
    );
    IF (v_res->>'success')::boolean IS FALSE THEN
        test_num := 'TEST 9';
        test_name := 'Fixed Final Stages Cannot Be Modified';
        result := 'PASS';
        detail := 'Attempt to swap Checking and Ironing and Packing rejected: ' || (v_res->>'error');
        RETURN NEXT;
    ELSE
        test_num := 'TEST 9';
        test_name := 'Fixed Final Stages Cannot Be Modified';
        result := 'FAIL';
        detail := 'Expected failure when altering final stages.';
        RETURN NEXT;
    END IF;

    -- =========================================================================
    -- TEST 10: Invalid save before Cutting
    -- Setup a fresh order (Order D) with Cutting not completed, attempt to save
    -- Must FAIL
    -- =========================================================================
    -- Order C only had Cutting in progress. Let's attempt to save again on Order C
    v_res := public.save_order_production_workflow(
        v_order_c,
        ARRAY['stock_sizes', 'inventory', 'cutting', 'printing', 'stitching', 'embroidering', 'checking', 'ironing_packing']
    );
    IF (v_res->>'success')::boolean IS FALSE AND (v_res->>'error') ILIKE '%Stock Sizes, Inventory, and Cutting must all be completed first%' THEN
        test_num := 'TEST 10';
        test_name := 'Invalid Save Before Cutting Completed';
        result := 'PASS';
        detail := 'Correctly rejected saving before Cutting completed: ' || (v_res->>'error');
        RETURN NEXT;
    ELSE
        test_num := 'TEST 10';
        test_name := 'Invalid Save Before Cutting Completed';
        result := 'FAIL';
        detail := 'Unexpectedly permitted save before cutting: ' || coalesce(v_res::text, 'NULL');
        RETURN NEXT;
    END IF;

    -- Cleanup
    DELETE FROM public.production_stage_history WHERE order_id IN (v_order_a, v_order_b, v_order_c);
    DELETE FROM public.production_records WHERE order_id IN (v_order_a, v_order_b, v_order_c);
    DELETE FROM public.order_status_history WHERE order_id IN (v_order_a, v_order_b, v_order_c);
    DELETE FROM public.order_production_workflows WHERE order_id IN (v_order_a, v_order_b, v_order_c);
    DELETE FROM public.orders WHERE id IN (v_order_a, v_order_b, v_order_c);
    DELETE FROM public.requirement_items WHERE requirement_id IN (v_req_a, v_req_b, v_req_c);
    DELETE FROM public.requirements WHERE id IN (v_req_a, v_req_b, v_req_c);
END;
$$;

SELECT * FROM public.test_stage_driven_suite();
DROP FUNCTION IF EXISTS public.test_stage_driven_suite();
