-- Comprehensive Test Suite for Final Order-Wise Sequence Behavior
CREATE OR REPLACE FUNCTION public.test_run_order_wise_suite()
RETURNS TABLE (
    test_id TEXT,
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
BEGIN
    -- Auth as admin
    SELECT id INTO v_admin_id FROM public.profiles WHERE role = 'evenvibe_admin' LIMIT 1;
    PERFORM set_config('request.jwt.claim.sub', v_admin_id::text, true);

    SELECT id INTO v_school_id FROM public.schools LIMIT 1;

    -- Setup Order A
    INSERT INTO public.requirements (school_id, requirement_number, status, total_students, regular_uniform_students, tshirt_uniform_students)
    VALUES (v_school_id, 'REQ-OW-A-' || gen_random_uuid(), 'confirmed', 10, 10, 0)
    RETURNING id INTO v_req_a;

    INSERT INTO public.requirement_items (requirement_id, item_name, size, quantity)
    VALUES (v_req_a, 'Uniform Shirt', 'M', 10);

    INSERT INTO public.orders (order_number, school_id, requirement_id, status)
    VALUES ('ORD-OW-A-' || substr(gen_random_uuid()::text, 1, 6), v_school_id, v_req_a, 'confirmed')
    RETURNING id INTO v_order_a;

    -- Setup Order B
    INSERT INTO public.requirements (school_id, requirement_number, status, total_students, regular_uniform_students, tshirt_uniform_students)
    VALUES (v_school_id, 'REQ-OW-B-' || gen_random_uuid(), 'confirmed', 10, 10, 0)
    RETURNING id INTO v_req_b;

    INSERT INTO public.requirement_items (requirement_id, item_name, size, quantity)
    VALUES (v_req_b, 'Uniform Shirt', 'M', 10);

    INSERT INTO public.orders (order_number, school_id, requirement_id, status)
    VALUES ('ORD-OW-B-' || substr(gen_random_uuid()::text, 1, 6), v_school_id, v_req_b, 'confirmed')
    RETURNING id INTO v_order_b;

    -- ----------------------------------------------------
    -- TEST 1: Complete Stock Sizes, Inventory, Cutting on Order A
    -- ----------------------------------------------------
    PERFORM public.start_production(v_order_a, 'Start prod A');
    PERFORM public.advance_production_stage(v_order_a, 'inventory');
    PERFORM public.advance_production_stage(v_order_a, 'cutting');
    PERFORM public.advance_production_stage(v_order_a, 'stitching'); -- Completes cutting

    -- Check that stock_sizes, inventory, cutting are all completed
    IF (SELECT count(*) FROM public.order_production_workflows WHERE order_id = v_order_a AND stage_key IN ('stock_sizes', 'inventory', 'cutting') AND status = 'completed') = 3 THEN
        test_id := 'TEST 1';
        test_name := 'Initial 3 Stages Completed';
        result := 'PASS';
        detail := 'Stock Sizes, Inventory, and Cutting are all completed.';
        RETURN NEXT;
    ELSE
        test_id := 'TEST 1';
        test_name := 'Initial 3 Stages Completed';
        result := 'FAIL';
        detail := 'Initial 3 stages not completed as expected.';
        RETURN NEXT;
    END IF;

    -- ----------------------------------------------------
    -- TEST 2: Admin selects Printing -> Stitching -> Embroidering on Order A
    -- ----------------------------------------------------
    v_res := public.save_order_production_workflow(
        v_order_a,
        ARRAY['stock_sizes', 'inventory', 'cutting', 'printing', 'stitching', 'embroidering', 'checking', 'ironing_packing']
    );

    IF (v_res->>'success')::boolean IS TRUE THEN
        SELECT array_agg(stage_key ORDER BY sequence_order) INTO v_seq_a
        FROM public.order_production_workflows WHERE order_id = v_order_a;

        IF v_seq_a = ARRAY['stock_sizes', 'inventory', 'cutting', 'printing', 'stitching', 'embroidering', 'checking', 'ironing_packing'] THEN
            test_id := 'TEST 2';
            test_name := 'Save Sequence (Printing -> Stitching -> Embroidering)';
            result := 'PASS';
            detail := 'Workflow updated to: ' || array_to_string(v_seq_a, ' -> ');
            RETURN NEXT;
        ELSE
            test_id := 'TEST 2';
            test_name := 'Save Sequence';
            result := 'FAIL';
            detail := 'Unexpected sequence: ' || array_to_string(v_seq_a, ' -> ');
            RETURN NEXT;
        END IF;
    ELSE
        test_id := 'TEST 2';
        test_name := 'Save Sequence';
        result := 'FAIL';
        detail := 'Failed to save: ' || (v_res->>'error');
        RETURN NEXT;
    END IF;

    -- ----------------------------------------------------
    -- TEST 3: Admin selects Embroidering -> Printing -> Stitching on Order B
    -- ----------------------------------------------------
    v_res := public.save_order_production_workflow(
        v_order_b,
        ARRAY['stock_sizes', 'inventory', 'cutting', 'embroidering', 'printing', 'stitching', 'checking', 'ironing_packing']
    );

    IF (v_res->>'success')::boolean IS TRUE THEN
        SELECT array_agg(stage_key ORDER BY sequence_order) INTO v_seq_b
        FROM public.order_production_workflows WHERE order_id = v_order_b;

        IF v_seq_b = ARRAY['stock_sizes', 'inventory', 'cutting', 'embroidering', 'printing', 'stitching', 'checking', 'ironing_packing'] THEN
            test_id := 'TEST 3';
            test_name := 'Save Sequence B (Embroidering -> Printing -> Stitching)';
            result := 'PASS';
            detail := 'Workflow updated to: ' || array_to_string(v_seq_b, ' -> ');
            RETURN NEXT;
        ELSE
            test_id := 'TEST 3';
            test_name := 'Save Sequence B';
            result := 'FAIL';
            detail := 'Unexpected sequence: ' || array_to_string(v_seq_b, ' -> ');
            RETURN NEXT;
        END IF;
    ELSE
        test_id := 'TEST 3';
        test_name := 'Save Sequence B';
        result := 'FAIL';
        detail := 'Failed to save: ' || (v_res->>'error');
        RETURN NEXT;
    END IF;

    -- ----------------------------------------------------
    -- TEST 4: Order Independence
    -- ----------------------------------------------------
    IF v_seq_a[4] = 'printing' AND v_seq_b[4] = 'embroidering' THEN
        test_id := 'TEST 4';
        test_name := 'Order Independence';
        result := 'PASS';
        detail := 'Order A (Printing first) and Order B (Embroidering first) remain independent.';
        RETURN NEXT;
    ELSE
        test_id := 'TEST 4';
        test_name := 'Order Independence';
        result := 'FAIL';
        detail := 'Sequences collided.';
        RETURN NEXT;
    END IF;

    -- ----------------------------------------------------
    -- TEST 5: Attempt to change Stock Sizes, Inventory, Cutting (Must Fail)
    -- ----------------------------------------------------
    v_res := public.save_order_production_workflow(
        v_order_b,
        ARRAY['cutting', 'inventory', 'stock_sizes', 'embroidering', 'printing', 'stitching', 'checking', 'ironing_packing']
    );
    IF (v_res->>'success')::boolean IS FALSE THEN
        test_id := 'TEST 5';
        test_name := 'Reject Change to Fixed Initial Stages';
        result := 'PASS';
        detail := 'Correctly rejected with: ' || (v_res->>'error');
        RETURN NEXT;
    ELSE
        test_id := 'TEST 5';
        test_name := 'Reject Change to Fixed Initial Stages';
        result := 'FAIL';
        detail := 'Unexpectedly succeeded.';
        RETURN NEXT;
    END IF;

    -- ----------------------------------------------------
    -- TEST 6: Attempt to change Checking, Ironing and Packing (Must Fail)
    -- ----------------------------------------------------
    v_res := public.save_order_production_workflow(
        v_order_b,
        ARRAY['stock_sizes', 'inventory', 'cutting', 'embroidering', 'printing', 'stitching', 'ironing_packing', 'checking']
    );
    IF (v_res->>'success')::boolean IS FALSE THEN
        test_id := 'TEST 6';
        test_name := 'Reject Change to Fixed Final Stages';
        result := 'PASS';
        detail := 'Correctly rejected with: ' || (v_res->>'error');
        RETURN NEXT;
    ELSE
        test_id := 'TEST 6';
        test_name := 'Reject Change to Fixed Final Stages';
        result := 'FAIL';
        detail := 'Unexpectedly succeeded.';
        RETURN NEXT;
    END IF;

    -- ----------------------------------------------------
    -- TEST 7: Current stage after Cutting on Order A is Printing
    -- ----------------------------------------------------
    SELECT stage INTO v_stage_order FROM public.production_records WHERE order_id = v_order_a;
    IF v_stage_order = 'printing' THEN
        test_id := 'TEST 7';
        test_name := 'Current Stage After Cutting';
        result := 'PASS';
        detail := 'Current stage of Order A is Printing.';
        RETURN NEXT;
    ELSE
        test_id := 'TEST 7';
        test_name := 'Current Stage After Cutting';
        result := 'FAIL';
        detail := 'Expected printing, found: ' || COALESCE(v_stage_order, 'NULL');
        RETURN NEXT;
    END IF;

    -- ----------------------------------------------------
    -- TEST 8: After Printing completes: Current stage = Stitching
    -- ----------------------------------------------------
    v_res := public.advance_production_stage(v_order_a, 'stitching');
    SELECT stage INTO v_stage_order FROM public.production_records WHERE order_id = v_order_a;
    IF (v_res->>'success')::boolean IS TRUE AND v_stage_order = 'stitching' THEN
        test_id := 'TEST 8';
        test_name := 'After Printing Completes';
        result := 'PASS';
        detail := 'Current stage advanced to Stitching.';
        RETURN NEXT;
    ELSE
        test_id := 'TEST 8';
        test_name := 'After Printing Completes';
        result := 'FAIL';
        detail := 'Failed to advance to stitching: ' || (v_res->>'error');
        RETURN NEXT;
    END IF;

    -- ----------------------------------------------------
    -- TEST 9: After Stitching completes: Current stage = Embroidering
    -- ----------------------------------------------------
    v_res := public.advance_production_stage(v_order_a, 'embroidering');
    SELECT stage INTO v_stage_order FROM public.production_records WHERE order_id = v_order_a;
    IF (v_res->>'success')::boolean IS TRUE AND v_stage_order = 'embroidering' THEN
        test_id := 'TEST 9';
        test_name := 'After Stitching Completes';
        result := 'PASS';
        detail := 'Current stage advanced to Embroidering.';
        RETURN NEXT;
    ELSE
        test_id := 'TEST 9';
        test_name := 'After Stitching Completes';
        result := 'FAIL';
        detail := 'Failed to advance to embroidering: ' || (v_res->>'error');
        RETURN NEXT;
    END IF;

    -- ----------------------------------------------------
    -- TEST 10: After Embroidering completes: Current stage = Checking
    -- ----------------------------------------------------
    v_res := public.advance_production_stage(v_order_a, 'checking');
    SELECT stage INTO v_stage_order FROM public.production_records WHERE order_id = v_order_a;
    IF (v_res->>'success')::boolean IS TRUE AND v_stage_order = 'checking' THEN
        test_id := 'TEST 10';
        test_name := 'After Embroidering Completes';
        result := 'PASS';
        detail := 'Current stage advanced to Checking.';
        RETURN NEXT;
    ELSE
        test_id := 'TEST 10';
        test_name := 'After Embroidering Completes';
        result := 'FAIL';
        detail := 'Failed to advance to checking: ' || (v_res->>'error');
        RETURN NEXT;
    END IF;

    -- ----------------------------------------------------
    -- TEST 11: After Checking completes: Current stage = Ironing and Packing
    -- ----------------------------------------------------
    v_res := public.advance_production_stage(v_order_a, 'ironing_packing');
    SELECT stage INTO v_stage_order FROM public.production_records WHERE order_id = v_order_a;
    IF (v_res->>'success')::boolean IS TRUE AND v_stage_order = 'ironing_packing' THEN
        test_id := 'TEST 11';
        test_name := 'After Checking Completes';
        result := 'PASS';
        detail := 'Current stage advanced to Ironing and Packing.';
        RETURN NEXT;
    ELSE
        test_id := 'TEST 11';
        test_name := 'After Checking Completes';
        result := 'FAIL';
        detail := 'Failed to advance to ironing_packing: ' || (v_res->>'error');
        RETURN NEXT;
    END IF;

    -- Complete final stage
    PERFORM public.advance_production_stage(v_order_a, 'production_completed');

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

SELECT * FROM public.test_run_order_wise_suite();
DROP FUNCTION IF EXISTS public.test_run_order_wise_suite();
