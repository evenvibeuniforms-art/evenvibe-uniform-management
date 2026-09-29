-- Workflow Sequence Test Suite Returning Formatted Results
CREATE OR REPLACE FUNCTION public.test_run_workflow_suite()
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
    v_req_c UUID;
    v_order_a UUID;
    v_order_b UUID;
    v_order_c UUID;
    v_res JSONB;
    v_seq_a TEXT[];
    v_seq_b TEXT[];
BEGIN
    SELECT id INTO v_admin_id FROM public.profiles WHERE role = 'evenvibe_admin' LIMIT 1;
    PERFORM set_config('request.jwt.claim.sub', v_admin_id::text, true);

    SELECT id INTO v_school_id FROM public.schools LIMIT 1;

    INSERT INTO public.requirements (school_id, requirement_number, status, total_students, regular_uniform_students, tshirt_uniform_students)
    VALUES (v_school_id, 'REQ-TEST-A-' || gen_random_uuid(), 'confirmed', 10, 10, 0)
    RETURNING id INTO v_req_a;

    INSERT INTO public.requirements (school_id, requirement_number, status, total_students, regular_uniform_students, tshirt_uniform_students)
    VALUES (v_school_id, 'REQ-TEST-B-' || gen_random_uuid(), 'confirmed', 10, 10, 0)
    RETURNING id INTO v_req_b;

    INSERT INTO public.requirements (school_id, requirement_number, status, total_students, regular_uniform_students, tshirt_uniform_students)
    VALUES (v_school_id, 'REQ-TEST-C-' || gen_random_uuid(), 'confirmed', 10, 10, 0)
    RETURNING id INTO v_req_c;

    INSERT INTO public.requirement_items (requirement_id, item_name, size, quantity)
    VALUES (v_req_b, 'Uniform Shirt', 'M', 10);
    
    INSERT INTO public.orders (order_number, school_id, requirement_id, status)
    VALUES ('TEST-SEQ-ORD-A-' || substr(gen_random_uuid()::text, 1, 6), v_school_id, v_req_a, 'confirmed')
    RETURNING id INTO v_order_a;

    INSERT INTO public.orders (order_number, school_id, requirement_id, status)
    VALUES ('TEST-SEQ-ORD-B-' || substr(gen_random_uuid()::text, 1, 6), v_school_id, v_req_b, 'confirmed')
    RETURNING id INTO v_order_b;

    INSERT INTO public.orders (order_number, school_id, requirement_id, status)
    VALUES ('TEST-SEQ-ORD-C-' || substr(gen_random_uuid()::text, 1, 6), v_school_id, v_req_c, 'confirmed')
    RETURNING id INTO v_order_c;

    -- TEST 1: Default Sequence
    v_res := public.save_order_production_workflow(
        v_order_a,
        ARRAY['stock_sizes', 'inventory', 'cutting', 'stitching', 'printing', 'embroidering', 'checking', 'ironing_packing']
    );
    IF (v_res->>'success')::boolean IS TRUE THEN
        test_id := 'TEST 1';
        test_name := 'Default Sequence';
        result := 'PASS';
        detail := 'Saved standard 8-stage sequence (7=checking, 8=ironing_packing)';
        RETURN NEXT;
    ELSE
        test_id := 'TEST 1';
        test_name := 'Default Sequence';
        result := 'FAIL';
        detail := v_res->>'error';
        RETURN NEXT;
    END IF;

    -- TEST 2: Custom Middle Sequence
    v_res := public.save_order_production_workflow(
        v_order_b,
        ARRAY['stock_sizes', 'inventory', 'cutting', 'printing', 'embroidering', 'stitching', 'checking', 'ironing_packing']
    );
    IF (v_res->>'success')::boolean IS TRUE THEN
        test_id := 'TEST 2';
        test_name := 'Custom Sequence (Printing -> Embroidering -> Stitching)';
        result := 'PASS';
        detail := 'Successfully accepted middle permutation';
        RETURN NEXT;
    ELSE
        test_id := 'TEST 2';
        test_name := 'Custom Sequence';
        result := 'FAIL';
        detail := v_res->>'error';
        RETURN NEXT;
    END IF;

    -- TEST 3: Another Custom Middle Sequence
    v_res := public.save_order_production_workflow(
        v_order_c,
        ARRAY['stock_sizes', 'inventory', 'cutting', 'embroidering', 'stitching', 'printing', 'checking', 'ironing_packing']
    );
    IF (v_res->>'success')::boolean IS TRUE THEN
        test_id := 'TEST 3';
        test_name := 'Custom Sequence (Embroidering -> Stitching -> Printing)';
        result := 'PASS';
        detail := 'Successfully accepted middle permutation';
        RETURN NEXT;
    ELSE
        test_id := 'TEST 3';
        test_name := 'Custom Sequence';
        result := 'FAIL';
        detail := v_res->>'error';
        RETURN NEXT;
    END IF;

    -- TEST 4: Fixed Initial Stage Violation
    v_res := public.save_order_production_workflow(
        v_order_a,
        ARRAY['inventory', 'stock_sizes', 'cutting', 'stitching', 'printing', 'embroidering', 'checking', 'ironing_packing']
    );
    IF (v_res->>'success')::boolean IS FALSE THEN
        test_id := 'TEST 4';
        test_name := 'Fixed Initial Stage Violation (Inventory at 1, Stock Sizes at 2)';
        result := 'PASS';
        detail := 'Correctly rejected with: ' || (v_res->>'error');
        RETURN NEXT;
    ELSE
        test_id := 'TEST 4';
        test_name := 'Fixed Initial Stage Violation';
        result := 'FAIL';
        detail := 'Unexpectedly succeeded';
        RETURN NEXT;
    END IF;

    -- TEST 5: Final Stage Violation
    v_res := public.save_order_production_workflow(
        v_order_a,
        ARRAY['stock_sizes', 'inventory', 'cutting', 'stitching', 'printing', 'embroidering', 'ironing_packing', 'checking']
    );
    IF (v_res->>'success')::boolean IS FALSE THEN
        test_id := 'TEST 5';
        test_name := 'Final Stage Violation (Ironing and Packing at 7, Checking at 8)';
        result := 'PASS';
        detail := 'Correctly rejected with: ' || (v_res->>'error');
        RETURN NEXT;
    ELSE
        test_id := 'TEST 5';
        test_name := 'Final Stage Violation';
        result := 'FAIL';
        detail := 'Unexpectedly succeeded';
        RETURN NEXT;
    END IF;

    -- TEST 6: Move Fixed Stage Violation
    v_res := public.save_order_production_workflow(
        v_order_a,
        ARRAY['stock_sizes', 'inventory', 'stitching', 'cutting', 'printing', 'embroidering', 'checking', 'ironing_packing']
    );
    IF (v_res->>'success')::boolean IS FALSE THEN
        test_id := 'TEST 6';
        test_name := 'Move Fixed Stage Violation (Cutting at 4)';
        result := 'PASS';
        detail := 'Correctly rejected with: ' || (v_res->>'error');
        RETURN NEXT;
    ELSE
        test_id := 'TEST 6';
        test_name := 'Move Fixed Stage Violation';
        result := 'FAIL';
        detail := 'Unexpectedly succeeded';
        RETURN NEXT;
    END IF;

    -- TEST 7: Remove Fixed Stage Violation
    v_res := public.save_order_production_workflow(
        v_order_a,
        ARRAY['inventory', 'cutting', 'stitching', 'printing', 'embroidering', 'checking', 'ironing_packing']
    );
    IF (v_res->>'success')::boolean IS FALSE THEN
        test_id := 'TEST 7';
        test_name := 'Remove Fixed Stage Violation (Missing Stock Sizes)';
        result := 'PASS';
        detail := 'Correctly rejected with: ' || (v_res->>'error');
        RETURN NEXT;
    ELSE
        test_id := 'TEST 7';
        test_name := 'Remove Fixed Stage Violation';
        result := 'FAIL';
        detail := 'Unexpectedly succeeded';
        RETURN NEXT;
    END IF;

    -- TEST 8: Order Independence
    SELECT array_agg(stage_key ORDER BY sequence_order) INTO v_seq_a
    FROM public.order_production_workflows WHERE order_id = v_order_a;

    SELECT array_agg(stage_key ORDER BY sequence_order) INTO v_seq_b
    FROM public.order_production_workflows WHERE order_id = v_order_b;

    IF (v_seq_a[4] = 'stitching' AND v_seq_a[5] = 'printing' AND v_seq_a[6] = 'embroidering') AND
       (v_seq_b[4] = 'printing' AND v_seq_b[5] = 'embroidering' AND v_seq_b[6] = 'stitching') THEN
        test_id := 'TEST 8';
        test_name := 'Order Independence';
        result := 'PASS';
        detail := 'Order A and Order B preserved independent middle sequences.';
        RETURN NEXT;
    ELSE
        test_id := 'TEST 8';
        test_name := 'Order Independence';
        result := 'FAIL';
        detail := 'Sequences collided: Order A=' || v_seq_a::text || ', Order B=' || v_seq_b::text;
        RETURN NEXT;
    END IF;

    -- TEST 9: Production Progression Follows Order-Specific Workflow
    v_res := public.start_production(v_order_b, 'Testing progression');
    PERFORM public.advance_production_stage(v_order_b, 'inventory');
    PERFORM public.advance_production_stage(v_order_b, 'cutting');
    
    -- Next must be printing (stage 4 for Order B)
    v_res := public.advance_production_stage(v_order_b, 'printing');
    IF (v_res->>'success')::boolean IS TRUE THEN
        PERFORM public.advance_production_stage(v_order_b, 'embroidering');
        PERFORM public.advance_production_stage(v_order_b, 'stitching');
        PERFORM public.advance_production_stage(v_order_b, 'checking');
        PERFORM public.advance_production_stage(v_order_b, 'ironing_packing');
        v_res := public.advance_production_stage(v_order_b, 'production_completed');

        IF (v_res->>'success')::boolean IS TRUE THEN
            test_id := 'TEST 9';
            test_name := 'Production Progression';
            result := 'PASS';
            detail := 'Order B advanced Cutting -> Printing -> Embroidering -> Stitching -> Checking -> Ironing/Packing -> Completed.';
            RETURN NEXT;
        ELSE
            test_id := 'TEST 9';
            test_name := 'Production Progression';
            result := 'FAIL';
            detail := 'Failed completion: ' || (v_res->>'error');
            RETURN NEXT;
        END IF;
    ELSE
        test_id := 'TEST 9';
        test_name := 'Production Progression';
        result := 'FAIL';
        detail := 'Failed to advance to printing: ' || (v_res->>'error');
        RETURN NEXT;
    END IF;

    -- Cleanup
    DELETE FROM public.production_stage_history WHERE order_id = v_order_b;
    DELETE FROM public.production_records WHERE order_id = v_order_b;
    DELETE FROM public.order_status_history WHERE order_id IN (v_order_a, v_order_b, v_order_c);
    DELETE FROM public.order_production_workflows WHERE order_id IN (v_order_a, v_order_b, v_order_c);
    DELETE FROM public.orders WHERE id IN (v_order_a, v_order_b, v_order_c);
    DELETE FROM public.requirement_items WHERE requirement_id IN (v_req_a, v_req_b, v_req_c);
    DELETE FROM public.requirements WHERE id IN (v_req_a, v_req_b, v_req_c);
END;
$$;

SELECT * FROM public.test_run_workflow_suite();
DROP FUNCTION IF EXISTS public.test_run_workflow_suite();
