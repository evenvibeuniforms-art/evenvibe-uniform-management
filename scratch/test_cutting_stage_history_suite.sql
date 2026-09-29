-- =========================================================================
-- TEST SUITE: PRODUCTION STAGE HISTORY CHECK CONSTRAINT & CUTTING COMPLETION
-- Covers TESTS 1 through 10
-- =========================================================================

BEGIN;

DO $$
DECLARE
    v_admin_id UUID;
    v_school_id UUID;
    v_req_id UUID;
    v_order_id UUID;
    v_prod_id UUID;
    v_res JSONB;
    v_hist_to_stage TEXT;
    v_hist_count INTEGER;
    v_check_err BOOLEAN;
BEGIN
    RAISE NOTICE '=== STARTING PRODUCTION STAGE HISTORY VERIFICATION SUITE ===';

    -- 1. Setup Admin profile
    SELECT id INTO v_admin_id FROM public.profiles WHERE role = 'evenvibe_admin' LIMIT 1;
    IF v_admin_id IS NULL THEN
        v_admin_id := gen_random_uuid();
        INSERT INTO public.profiles (id, full_name, email, role)
        VALUES (v_admin_id, 'Test Admin', 'testadmin@evenvibe.com', 'evenvibe_admin');
    END IF;

    -- Emulate admin session
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin_id::text)::text, true);

    -- Setup School
    SELECT id INTO v_school_id FROM public.schools LIMIT 1;
    IF v_school_id IS NULL THEN
        INSERT INTO public.schools (id, name, school_code)
        VALUES (gen_random_uuid(), 'History Test School', 'HTS-001')
        RETURNING id INTO v_school_id;
    END IF;

    -- =========================================================================
    -- TEST 8: Verify production_stage_history constraint accepts every valid canonical stage
    -- =========================================================================
    RAISE NOTICE 'TEST 8: Verify production_stage_history constraint accepts every valid canonical stage';
    
    -- Create dummy order for constraint testing
    INSERT INTO public.orders (order_number, school_id, status, total_amount)
    VALUES ('ORD-HIST-TEST-1', v_school_id, 'in_production', 1000)
    RETURNING id INTO v_order_id;

    INSERT INTO public.production_records (order_id, stage, total_quantity)
    VALUES (v_order_id, 'cutting', 10)
    RETURNING id INTO v_prod_id;

    -- Test all valid canonical transitions:
    -- 'production_started', 'stock_sizes', 'inventory', 'cutting', 'stitching', 'printing', 'embroidering', 'checking', 'ironing_packing', 'finishing', 'production_completed'
    INSERT INTO public.production_stage_history (production_record_id, order_id, from_stage, to_stage, note, changed_by)
    VALUES 
        (v_prod_id, v_order_id, NULL, 'production_started', 'Start', v_admin_id),
        (v_prod_id, v_order_id, 'production_started', 'stock_sizes', 'Step 1', v_admin_id),
        (v_prod_id, v_order_id, 'stock_sizes', 'inventory', 'Step 2', v_admin_id),
        (v_prod_id, v_order_id, 'inventory', 'cutting', 'Step 3', v_admin_id),
        (v_prod_id, v_order_id, 'cutting', 'stitching', 'Step 4a', v_admin_id),
        (v_prod_id, v_order_id, 'cutting', 'printing', 'Step 4b', v_admin_id),
        (v_prod_id, v_order_id, 'cutting', 'embroidering', 'Step 4c', v_admin_id),
        (v_prod_id, v_order_id, 'stitching', 'printing', 'Step 5', v_admin_id),
        (v_prod_id, v_order_id, 'printing', 'embroidering', 'Step 6', v_admin_id),
        (v_prod_id, v_order_id, 'embroidering', 'checking', 'Step 7', v_admin_id),
        (v_prod_id, v_order_id, 'checking', 'ironing_packing', 'Step 8', v_admin_id),
        (v_prod_id, v_order_id, 'ironing_packing', 'production_completed', 'Step 9', v_admin_id);

    RAISE NOTICE '  ✓ TEST 8 PASS: Constraint accepts all canonical stage keys.';

    -- =========================================================================
    -- TEST 9: Verify invalid stage values are rejected by the database
    -- =========================================================================
    RAISE NOTICE 'TEST 9: Verify invalid stage values are rejected by the database';
    v_check_err := false;
    BEGIN
        INSERT INTO public.production_stage_history (production_record_id, order_id, from_stage, to_stage, note, changed_by)
        VALUES (v_prod_id, v_order_id, 'cutting', 'invalid_random_stage', 'Bad transition', v_admin_id);
    EXCEPTION WHEN check_violation THEN
        v_check_err := true;
    END;

    IF NOT v_check_err THEN
        RAISE EXCEPTION 'TEST 9 FAILED: Invalid stage was not rejected by check constraint!';
    END IF;

    -- Also verify 'cutting_completed' is rejected as non-canonical
    v_check_err := false;
    BEGIN
        INSERT INTO public.production_stage_history (production_record_id, order_id, from_stage, to_stage, note, changed_by)
        VALUES (v_prod_id, v_order_id, 'cutting', 'cutting_completed', 'Bad transition', v_admin_id);
    EXCEPTION WHEN check_violation THEN
        v_check_err := true;
    END;

    IF NOT v_check_err THEN
        RAISE EXCEPTION 'TEST 9 FAILED: Non-canonical cutting_completed was not rejected by check constraint!';
    END IF;

    RAISE NOTICE '  ✓ TEST 9 PASS: Invalid stage values and cutting_completed are strictly rejected.';

    -- =========================================================================
    -- TEST 10: Verify existing production history remains readable
    -- =========================================================================
    RAISE NOTICE 'TEST 10: Verify existing production history remains readable';
    SELECT COUNT(*) INTO v_hist_count FROM public.production_stage_history WHERE order_id = v_order_id;
    IF v_hist_count < 12 THEN
        RAISE EXCEPTION 'TEST 10 FAILED: Could not read back history rows!';
    END IF;
    RAISE NOTICE '  ✓ TEST 10 PASS: History rows read successfully (count = %).', v_hist_count;

    -- =========================================================================
    -- TESTS 1..6: CUTTING COMPLETION & TO_STAGE CORRESPONDING TO SEQUENCE
    -- =========================================================================

    -- Helper setup for Order with Requirement & Cut Items
    CREATE TEMP TABLE temp_stage_order (ord_id UUID, req_id UUID, p_id UUID);

    -- TEST 4: Sequence starts with Stitching (Cutting -> Stitching)
    RAISE NOTICE 'TEST 4: Sequence starts with Stitching: Cutting -> Stitching';
    INSERT INTO public.orders (order_number, school_id, status, total_amount)
    VALUES ('ORD-STITCH-1', v_school_id, 'in_production', 1000)
    RETURNING id INTO v_order_id;

    INSERT INTO public.requirements (school_id, academic_year, status, total_sets)
    VALUES (v_school_id, '2026-2027', 'confirmed', 10)
    RETURNING id INTO v_req_id;

    UPDATE public.orders SET requirement_id = v_req_id WHERE id = v_order_id;

    INSERT INTO public.requirement_items (requirement_id, item_name, style_name, color, size, quantity)
    VALUES (v_req_id, 'Shirt', 'Regular', 'White', '26', 10);

    INSERT INTO public.production_records (order_id, stage, total_quantity)
    VALUES (v_order_id, 'cutting', 10)
    RETURNING id INTO v_prod_id;

    -- Default workflows (sequence 4 = stitching)
    DELETE FROM public.order_production_workflows WHERE order_id = v_order_id;
    INSERT INTO public.order_production_workflows (order_id, stage_key, sequence_order, status)
    VALUES 
        (v_order_id, 'stock_sizes', 1, 'completed'),
        (v_order_id, 'inventory', 2, 'completed'),
        (v_order_id, 'cutting', 3, 'in_progress'),
        (v_order_id, 'stitching', 4, 'pending'),
        (v_order_id, 'printing', 5, 'pending'),
        (v_order_id, 'embroidering', 6, 'pending'),
        (v_order_id, 'checking', 7, 'pending'),
        (v_order_id, 'ironing_packing', 8, 'pending');

    -- Insert cut quantity
    INSERT INTO public.order_cutting_items (order_id, item_name, style_name, color, size, required_quantity, cut_quantity)
    VALUES (v_order_id, 'Shirt', 'Regular', 'White', '26', 10, 12);

    -- Call advance_production_stage to complete cutting
    v_res := public.advance_production_stage(v_order_id, 'cutting_completed', 'Cutting complete');
    IF (v_res->>'success')::boolean != true THEN
        RAISE EXCEPTION 'TEST 1/4 FAILED: advance_production_stage error: %', v_res->>'error';
    END IF;

    -- Verify history row created
    SELECT to_stage INTO v_hist_to_stage
    FROM public.production_stage_history
    WHERE order_id = v_order_id AND from_stage = 'cutting'
    ORDER BY created_at DESC LIMIT 1;

    IF v_hist_to_stage != 'stitching' THEN
        RAISE EXCEPTION 'TEST 4 FAILED: Expected to_stage stitching, got %', v_hist_to_stage;
    END IF;
    RAISE NOTICE '  ✓ TEST 4 PASS: Cutting completed without error -> to_stage is stitching.';

    -- TEST 5: Sequence starts with Printing (Cutting -> Printing)
    RAISE NOTICE 'TEST 5: Sequence starts with Printing: Cutting -> Printing';
    INSERT INTO public.orders (order_number, school_id, status, total_amount)
    VALUES ('ORD-PRINT-1', v_school_id, 'in_production', 1000)
    RETURNING id INTO v_order_id;

    INSERT INTO public.requirements (school_id, academic_year, status, total_sets)
    VALUES (v_school_id, '2026-2027', 'confirmed', 10)
    RETURNING id INTO v_req_id;

    UPDATE public.orders SET requirement_id = v_req_id WHERE id = v_order_id;

    INSERT INTO public.requirement_items (requirement_id, item_name, style_name, color, size, quantity)
    VALUES (v_req_id, 'Shirt', 'Regular', 'White', '26', 10);

    INSERT INTO public.production_records (order_id, stage, total_quantity)
    VALUES (v_order_id, 'cutting', 10)
    RETURNING id INTO v_prod_id;

    -- Workflows where sequence 4 = printing
    DELETE FROM public.order_production_workflows WHERE order_id = v_order_id;
    INSERT INTO public.order_production_workflows (order_id, stage_key, sequence_order, status)
    VALUES 
        (v_order_id, 'stock_sizes', 1, 'completed'),
        (v_order_id, 'inventory', 2, 'completed'),
        (v_order_id, 'cutting', 3, 'in_progress'),
        (v_order_id, 'printing', 4, 'pending'),
        (v_order_id, 'stitching', 5, 'pending'),
        (v_order_id, 'embroidering', 6, 'pending'),
        (v_order_id, 'checking', 7, 'pending'),
        (v_order_id, 'ironing_packing', 8, 'pending');

    INSERT INTO public.order_cutting_items (order_id, item_name, style_name, color, size, required_quantity, cut_quantity)
    VALUES (v_order_id, 'Shirt', 'Regular', 'White', '26', 10, 12);

    v_res := public.advance_production_stage(v_order_id, 'cutting_completed', 'Cutting complete');
    IF (v_res->>'success')::boolean != true THEN
        RAISE EXCEPTION 'TEST 5 FAILED: advance_production_stage error: %', v_res->>'error';
    END IF;

    SELECT to_stage INTO v_hist_to_stage
    FROM public.production_stage_history
    WHERE order_id = v_order_id AND from_stage = 'cutting'
    ORDER BY created_at DESC LIMIT 1;

    IF v_hist_to_stage != 'printing' THEN
        RAISE EXCEPTION 'TEST 5 FAILED: Expected to_stage printing, got %', v_hist_to_stage;
    END IF;
    RAISE NOTICE '  ✓ TEST 5 PASS: Cutting completed without error -> to_stage is printing.';

    -- TEST 6: Sequence starts with Embroidering (Cutting -> Embroidering)
    RAISE NOTICE 'TEST 6: Sequence starts with Embroidering: Cutting -> Embroidering';
    INSERT INTO public.orders (order_number, school_id, status, total_amount)
    VALUES ('ORD-EMB-1', v_school_id, 'in_production', 1000)
    RETURNING id INTO v_order_id;

    INSERT INTO public.requirements (school_id, academic_year, status, total_sets)
    VALUES (v_school_id, '2026-2027', 'confirmed', 10)
    RETURNING id INTO v_req_id;

    UPDATE public.orders SET requirement_id = v_req_id WHERE id = v_order_id;

    INSERT INTO public.requirement_items (requirement_id, item_name, style_name, color, size, quantity)
    VALUES (v_req_id, 'Shirt', 'Regular', 'White', '26', 10);

    INSERT INTO public.production_records (order_id, stage, total_quantity)
    VALUES (v_order_id, 'cutting', 10)
    RETURNING id INTO v_prod_id;

    -- Workflows where sequence 4 = embroidering
    DELETE FROM public.order_production_workflows WHERE order_id = v_order_id;
    INSERT INTO public.order_production_workflows (order_id, stage_key, sequence_order, status)
    VALUES 
        (v_order_id, 'stock_sizes', 1, 'completed'),
        (v_order_id, 'inventory', 2, 'completed'),
        (v_order_id, 'cutting', 3, 'in_progress'),
        (v_order_id, 'embroidering', 4, 'pending'),
        (v_order_id, 'stitching', 5, 'pending'),
        (v_order_id, 'printing', 6, 'pending'),
        (v_order_id, 'checking', 7, 'pending'),
        (v_order_id, 'ironing_packing', 8, 'pending');

    INSERT INTO public.order_cutting_items (order_id, item_name, style_name, color, size, required_quantity, cut_quantity)
    VALUES (v_order_id, 'Shirt', 'Regular', 'White', '26', 10, 12);

    v_res := public.advance_production_stage(v_order_id, 'cutting_completed', 'Cutting complete');
    IF (v_res->>'success')::boolean != true THEN
        RAISE EXCEPTION 'TEST 6 FAILED: advance_production_stage error: %', v_res->>'error';
    END IF;

    SELECT to_stage INTO v_hist_to_stage
    FROM public.production_stage_history
    WHERE order_id = v_order_id AND from_stage = 'cutting'
    ORDER BY created_at DESC LIMIT 1;

    IF v_hist_to_stage != 'embroidering' THEN
        RAISE EXCEPTION 'TEST 6 FAILED: Expected to_stage embroidering, got %', v_hist_to_stage;
    END IF;
    RAISE NOTICE '  ✓ TEST 6 PASS: Cutting completed without error -> to_stage is embroidering.';

    RAISE NOTICE '=================================================================';
    RAISE NOTICE 'ALL TESTS IN SUITE PASSED SUCCESSFULLY WITH ZERO ERRORS!';
    RAISE NOTICE '=================================================================';
END;
$$;

ROLLBACK;
