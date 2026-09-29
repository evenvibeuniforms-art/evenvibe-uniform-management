-- Comprehensive Verification Script for Production Workflow Final Stage Sequence Correction
-- Tests:
-- 1. Default Sequence (Pass)
-- 2. Custom Middle Sequence (Pass)
-- 3. Another Custom Middle Sequence (Pass)
-- 4. Fixed Initial Stage Violation (Must Fail)
-- 5. Fixed Final Stage Violation (Must Fail)
-- 6. Move Fixed Stage Violation (Must Fail)
-- 7. Remove Fixed Stage Violation (Must Fail)
-- 8. Order Independence (Order A and Order B saved independently)
-- 9. Production Progression follows order-specific middle sequence

DO $$
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
    v_curr_stage TEXT;
BEGIN
    RAISE NOTICE '==================================================';
    RAISE NOTICE 'STARTING WORKFLOW SEQUENCE TEST SUITE';
    RAISE NOTICE '==================================================';

    -- 1. Find an evenvibe_admin profile
    SELECT id INTO v_admin_id FROM public.profiles WHERE role = 'evenvibe_admin' LIMIT 1;
    IF v_admin_id IS NULL THEN
        RAISE EXCEPTION 'No evenvibe_admin profile found for testing';
    END IF;

    -- Set session auth to admin
    PERFORM set_config('request.jwt.claim.sub', v_admin_id::text, true);

    -- 2. Find school and create requirements
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

    -- Add items for req B
    INSERT INTO public.requirement_items (requirement_id, item_name, size, quantity)
    VALUES (v_req_b, 'Uniform Shirt', 'M', 10);
    
    -- Insert clean test orders
    INSERT INTO public.orders (order_number, school_id, requirement_id, status)
    VALUES ('TEST-SEQ-ORD-A-' || substr(gen_random_uuid()::text, 1, 6), v_school_id, v_req_a, 'confirmed')
    RETURNING id INTO v_order_a;

    INSERT INTO public.orders (order_number, school_id, requirement_id, status)
    VALUES ('TEST-SEQ-ORD-B-' || substr(gen_random_uuid()::text, 1, 6), v_school_id, v_req_b, 'confirmed')
    RETURNING id INTO v_order_b;

    INSERT INTO public.orders (order_number, school_id, requirement_id, status)
    VALUES ('TEST-SEQ-ORD-C-' || substr(gen_random_uuid()::text, 1, 6), v_school_id, v_req_c, 'confirmed')
    RETURNING id INTO v_order_c;

    -- ----------------------------------------------------
    -- TEST 1: DEFAULT SEQUENCE (Must Pass)
    -- ----------------------------------------------------
    v_res := public.save_order_production_workflow(
        v_order_a,
        ARRAY['stock_sizes', 'inventory', 'cutting', 'stitching', 'printing', 'embroidering', 'checking', 'ironing_packing']
    );
    IF (v_res->>'success')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'TEST 1 FAILED: Default sequence was rejected: %', v_res;
    END IF;
    RAISE NOTICE 'TEST 1 PASSED: Default sequence saved successfully.';

    -- ----------------------------------------------------
    -- TEST 2: CUSTOM SEQUENCE (Must Pass)
    -- middle: printing -> embroidering -> stitching
    -- ----------------------------------------------------
    v_res := public.save_order_production_workflow(
        v_order_b,
        ARRAY['stock_sizes', 'inventory', 'cutting', 'printing', 'embroidering', 'stitching', 'checking', 'ironing_packing']
    );
    IF (v_res->>'success')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'TEST 2 FAILED: Custom sequence B was rejected: %', v_res;
    END IF;
    RAISE NOTICE 'TEST 2 PASSED: Custom sequence B saved successfully.';

    -- ----------------------------------------------------
    -- TEST 3: ANOTHER CUSTOM SEQUENCE (Must Pass)
    -- middle: embroidering -> stitching -> printing
    -- ----------------------------------------------------
    v_res := public.save_order_production_workflow(
        v_order_c,
        ARRAY['stock_sizes', 'inventory', 'cutting', 'embroidering', 'stitching', 'printing', 'checking', 'ironing_packing']
    );
    IF (v_res->>'success')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'TEST 3 FAILED: Custom sequence C was rejected: %', v_res;
    END IF;
    RAISE NOTICE 'TEST 3 PASSED: Custom sequence C saved successfully.';

    -- ----------------------------------------------------
    -- TEST 4: FIXED STAGE VIOLATION (Must Fail)
    -- Swapping Inventory (1) and Stock Sizes (2)
    -- ----------------------------------------------------
    v_res := public.save_order_production_workflow(
        v_order_a,
        ARRAY['inventory', 'stock_sizes', 'cutting', 'stitching', 'printing', 'embroidering', 'checking', 'ironing_packing']
    );
    IF (v_res->>'success')::boolean IS TRUE THEN
        RAISE EXCEPTION 'TEST 4 FAILED: Fixed stage violation was unexpectedly accepted!';
    END IF;
    RAISE NOTICE 'TEST 4 PASSED: Fixed stage violation was correctly rejected with: %', v_res->>'error';

    -- ----------------------------------------------------
    -- TEST 5: FINAL STAGE VIOLATION (Must Fail)
    -- Swapping Ironing and Packing (7) and Checking (8)
    -- ----------------------------------------------------
    v_res := public.save_order_production_workflow(
        v_order_a,
        ARRAY['stock_sizes', 'inventory', 'cutting', 'stitching', 'printing', 'embroidering', 'ironing_packing', 'checking']
    );
    IF (v_res->>'success')::boolean IS TRUE THEN
        RAISE EXCEPTION 'TEST 5 FAILED: Final stage violation was unexpectedly accepted!';
    END IF;
    RAISE NOTICE 'TEST 5 PASSED: Final stage violation was correctly rejected with: %', v_res->>'error';

    -- ----------------------------------------------------
    -- TEST 6: MOVE FIXED STAGE (Must Fail)
    -- Moving Cutting to position 4
    -- ----------------------------------------------------
    v_res := public.save_order_production_workflow(
        v_order_a,
        ARRAY['stock_sizes', 'inventory', 'stitching', 'cutting', 'printing', 'embroidering', 'checking', 'ironing_packing']
    );
    IF (v_res->>'success')::boolean IS TRUE THEN
        RAISE EXCEPTION 'TEST 6 FAILED: Moving cutting to position 4 was unexpectedly accepted!';
    END IF;
    RAISE NOTICE 'TEST 6 PASSED: Moving fixed stage was correctly rejected with: %', v_res->>'error';

    -- ----------------------------------------------------
    -- TEST 7: REMOVE FIXED STAGE (Must Fail)
    -- Removing Stock Sizes
    -- ----------------------------------------------------
    v_res := public.save_order_production_workflow(
        v_order_a,
        ARRAY['inventory', 'cutting', 'stitching', 'printing', 'embroidering', 'checking', 'ironing_packing']
    );
    IF (v_res->>'success')::boolean IS TRUE THEN
        RAISE EXCEPTION 'TEST 7 FAILED: Removing stock sizes was unexpectedly accepted!';
    END IF;
    RAISE NOTICE 'TEST 7 PASSED: Removing fixed stage was correctly rejected with: %', v_res->>'error';

    -- ----------------------------------------------------
    -- TEST 8: ORDER INDEPENDENCE
    -- Verify Order A middle stages != Order B middle stages
    -- ----------------------------------------------------
    SELECT array_agg(stage_key ORDER BY sequence_order) INTO v_seq_a
    FROM public.order_production_workflows WHERE order_id = v_order_a;

    SELECT array_agg(stage_key ORDER BY sequence_order) INTO v_seq_b
    FROM public.order_production_workflows WHERE order_id = v_order_b;

    IF v_seq_a[4] != 'stitching' OR v_seq_a[5] != 'printing' OR v_seq_a[6] != 'embroidering' THEN
        RAISE EXCEPTION 'TEST 8 FAILED: Order A sequence was corrupted: %', v_seq_a;
    END IF;

    IF v_seq_b[4] != 'printing' OR v_seq_b[5] != 'embroidering' OR v_seq_b[6] != 'stitching' THEN
        RAISE EXCEPTION 'TEST 8 FAILED: Order B sequence was corrupted: %', v_seq_b;
    END IF;
    RAISE NOTICE 'TEST 8 PASSED: Order A and Order B are completely independent.';

    -- ----------------------------------------------------
    -- TEST 9: PRODUCTION PROGRESSION
    -- Start production on Order B:
    -- Sequence: stock_sizes -> inventory -> cutting -> printing -> embroidering -> stitching -> checking -> ironing_packing
    -- ----------------------------------------------------
    v_res := public.start_production(v_order_b, 'Testing progression on Order B');
    IF (v_res->>'success')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'TEST 9 FAILED: Could not start production: %', v_res;
    END IF;

    -- Advance stage 1 (stock_sizes) -> stage 2 (inventory)
    v_res := public.advance_production_stage(v_order_b, 'inventory');
    IF (v_res->>'success')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'TEST 9 FAILED: advance to inventory failed: %', v_res;
    END IF;

    -- Advance stage 2 (inventory) -> stage 3 (cutting)
    v_res := public.advance_production_stage(v_order_b, 'cutting');
    IF (v_res->>'success')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'TEST 9 FAILED: advance to cutting failed: %', v_res;
    END IF;

    -- CRITICAL CHECK: After cutting, Order B's next stage MUST be 'printing' (NOT 'stitching'!)
    -- Attempting to advance to stitching must FAIL
    v_res := public.advance_production_stage(v_order_b, 'stitching');
    IF (v_res->>'success')::boolean IS TRUE THEN
        RAISE EXCEPTION 'TEST 9 FAILED: Order B advanced to stitching instead of printing!';
    END IF;

    -- Advance to printing MUST succeed
    v_res := public.advance_production_stage(v_order_b, 'printing');
    IF (v_res->>'success')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'TEST 9 FAILED: advance to printing failed: %', v_res;
    END IF;

    -- After printing, next stage MUST be embroidering
    v_res := public.advance_production_stage(v_order_b, 'embroidering');
    IF (v_res->>'success')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'TEST 9 FAILED: advance to embroidering failed: %', v_res;
    END IF;

    -- After embroidering, next stage MUST be stitching
    v_res := public.advance_production_stage(v_order_b, 'stitching');
    IF (v_res->>'success')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'TEST 9 FAILED: advance to stitching failed: %', v_res;
    END IF;

    -- After stitching, next stage MUST be checking (Stage 7)
    v_res := public.advance_production_stage(v_order_b, 'checking');
    IF (v_res->>'success')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'TEST 9 FAILED: advance to checking failed: %', v_res;
    END IF;

    -- After checking, next stage MUST be ironing_packing (Stage 8)
    v_res := public.advance_production_stage(v_order_b, 'ironing_packing');
    IF (v_res->>'success')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'TEST 9 FAILED: advance to ironing_packing failed: %', v_res;
    END IF;

    -- After ironing_packing, next stage MUST be production_completed
    v_res := public.advance_production_stage(v_order_b, 'production_completed');
    IF (v_res->>'success')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'TEST 9 FAILED: advance to production_completed failed: %', v_res;
    END IF;

    RAISE NOTICE 'TEST 9 PASSED: Progression strictly followed Order B custom middle sequence through checking and ironing_packing to completion.';

    -- Clean up test orders and requirements
    DELETE FROM public.production_stage_history WHERE order_id = v_order_b;
    DELETE FROM public.production_records WHERE order_id = v_order_b;
    DELETE FROM public.order_status_history WHERE order_id IN (v_order_a, v_order_b, v_order_c);
    DELETE FROM public.order_production_workflows WHERE order_id IN (v_order_a, v_order_b, v_order_c);
    DELETE FROM public.orders WHERE id IN (v_order_a, v_order_b, v_order_c);
    DELETE FROM public.requirement_items WHERE requirement_id IN (v_req_a, v_req_b, v_req_c);
    DELETE FROM public.requirements WHERE id IN (v_req_a, v_req_b, v_req_c);

    RAISE NOTICE '==================================================';
    RAISE NOTICE 'ALL 9 TESTS PASSED SUCCESSFULLY!';
    RAISE NOTICE '==================================================';
END $$;
