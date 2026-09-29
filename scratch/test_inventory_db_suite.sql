-- Test Suite for Inventory Stage (Stage 2) Material Weight Calculation
CREATE OR REPLACE FUNCTION public.test_inventory_db_suite()
RETURNS TABLE (
    test_num INT,
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
    v_school_b_id UUID;
    v_req_1 UUID;
    v_req_2 UUID;
    v_order_1 UUID;
    v_order_2 UUID;
    v_save_res JSONB;
    v_adv_res JSONB;
    v_rec RECORD;
    v_count INT;
    v_row_count INT;
    v_pant_black_qty INT;
    v_pant_navy_qty INT;
BEGIN
    -- Auth as admin
    SELECT id INTO v_admin_id FROM public.profiles WHERE role = 'evenvibe_admin' LIMIT 1;
    PERFORM set_config('request.jwt.claim.sub', v_admin_id::text, true);

    -- Get two distinct schools
    SELECT id INTO v_school_id FROM public.schools ORDER BY created_at ASC LIMIT 1;
    SELECT id INTO v_school_b_id FROM public.schools ORDER BY created_at DESC LIMIT 1;

    -- Setup Order 1 (School A) with 4 Style+Color combinations
    -- Pant Style 1 Black: 30 + 70 = 100 pcs
    -- Pant Style 1 Navy Blue: 80 pcs
    -- Shirt Style 2 White: 120 pcs
    -- Shirt Style 2 Sky Blue: 60 pcs
    INSERT INTO public.requirements (school_id, requirement_number, status, total_students, regular_uniform_students, tshirt_uniform_students)
    VALUES (v_school_id, 'REQ-INV-1-' || gen_random_uuid(), 'confirmed', 360, 360, 0)
    RETURNING id INTO v_req_1;

    INSERT INTO public.requirement_items (requirement_id, item_name, style_name, color, size, quantity)
    VALUES 
        (v_req_1, 'Pant', 'Style 1', 'Black', '28', 30),
        (v_req_1, 'Pant', 'Style 1', 'Black', '30', 70),
        (v_req_1, 'Pant', 'Style 1', 'Navy Blue', '32', 80),
        (v_req_1, 'Shirt', 'Style 2', 'White', '36', 120),
        (v_req_1, 'Shirt', 'Style 2', 'Sky Blue', '36', 60);

    INSERT INTO public.orders (order_number, school_id, requirement_id, status)
    VALUES ('ORD-INV-1-' || substr(gen_random_uuid()::text, 1, 6), v_school_id, v_req_1, 'confirmed')
    RETURNING id INTO v_order_1;

    -- Setup Order 2 (Same School A) to test multiple active orders independence
    INSERT INTO public.requirements (school_id, requirement_number, status, total_students, regular_uniform_students, tshirt_uniform_students)
    VALUES (v_school_id, 'REQ-INV-2-' || gen_random_uuid(), 'confirmed', 200, 200, 0)
    RETURNING id INTO v_req_2;

    INSERT INTO public.requirement_items (requirement_id, item_name, style_name, color, size, quantity)
    VALUES 
        (v_req_2, 'Pant', 'Style 1', 'Black', '30', 200);

    INSERT INTO public.orders (order_number, school_id, requirement_id, status)
    VALUES ('ORD-INV-2-' || substr(gen_random_uuid()::text, 1, 6), v_school_id, v_req_2, 'confirmed')
    RETURNING id INTO v_order_2;

    -- Initialize production workflows for both orders
    PERFORM public.start_production(v_order_1, 'Start order 1');
    PERFORM public.start_production(v_order_2, 'Start order 2');

    -- Advance Order 1 from Stock Sizes (Stage 1) to Inventory (Stage 2)
    PERFORM public.advance_production_stage(v_order_1, 'inventory');

    -------------------------------------------------------------------------
    -- TEST 1: Stock Sizes size quantities aggregate automatically in Inventory
    -------------------------------------------------------------------------
    -- Call save_order_inventory_materials for Pant Black and Pant Navy
    v_save_res := public.save_order_inventory_materials(
        v_order_1,
        jsonb_build_array(
            jsonb_build_object('item_name', 'Pant', 'style_name', 'Style 1', 'color', 'Black', 'gram_per_piece', 250),
            jsonb_build_object('item_name', 'Pant', 'style_name', 'Style 1', 'color', 'Navy Blue', 'gram_per_piece', 250)
        )
    );

    SELECT quantity INTO v_pant_black_qty FROM public.order_inventory_materials
    WHERE order_id = v_order_1 AND item_name = 'Pant' AND color = 'Black';

    SELECT quantity INTO v_pant_navy_qty FROM public.order_inventory_materials
    WHERE order_id = v_order_1 AND item_name = 'Pant' AND color = 'Navy Blue';

    IF v_pant_black_qty = 100 AND v_pant_navy_qty = 80 THEN
        test_num := 1;
        test_name := 'Inventory quantities aggregate automatically from Stock Sizes snapshot';
        result := 'PASS';
        detail := format('Pant Black = %s pcs (30+70), Pant Navy = %s pcs', v_pant_black_qty, v_pant_navy_qty);
        RETURN NEXT;
    ELSE
        test_num := 1;
        test_name := 'Inventory quantities aggregate automatically from Stock Sizes snapshot';
        result := 'FAIL';
        detail := format('Expected 100 and 80, got %s and %s', v_pant_black_qty, v_pant_navy_qty);
        RETURN NEXT;
    END IF;

    -------------------------------------------------------------------------
    -- TEST 2: Colors and Styles never combine; separate rows in DB
    -------------------------------------------------------------------------
    SELECT COUNT(*) INTO v_row_count FROM public.order_inventory_materials
    WHERE order_id = v_order_1;

    IF v_row_count = 2 THEN
        test_num := 2;
        test_name := 'Style + Color combinations create separate rows and never combine';
        result := 'PASS';
        detail := '2 distinct rows created for Black and Navy Blue under same Pant Style 1';
        RETURN NEXT;
    ELSE
        test_num := 2;
        test_name := 'Style + Color combinations create separate rows and never combine';
        result := 'FAIL';
        detail := format('Expected 2 rows, found %s', v_row_count);
        RETURN NEXT;
    END IF;

    -------------------------------------------------------------------------
    -- TEST 3: Gram × Quantity calculation in database
    -------------------------------------------------------------------------
    SELECT total_grams INTO v_rec FROM public.order_inventory_materials
    WHERE order_id = v_order_1 AND item_name = 'Pant' AND color = 'Black';

    IF v_rec.total_grams = 25000 THEN
        test_num := 3;
        test_name := 'Gram × Quantity calculation matches specification (250g * 100 = 25000g)';
        result := 'PASS';
        detail := format('total_grams = %s', v_rec.total_grams);
        RETURN NEXT;
    ELSE
        test_num := 3;
        test_name := 'Gram × Quantity calculation matches specification (250g * 100 = 25000g)';
        result := 'FAIL';
        detail := format('Expected 25000, got %s', v_rec.total_grams);
        RETURN NEXT;
    END IF;

    -------------------------------------------------------------------------
    -- TEST 4: Zero gram is rejected by save_order_inventory_materials
    -------------------------------------------------------------------------
    v_save_res := public.save_order_inventory_materials(
        v_order_1,
        jsonb_build_array(
            jsonb_build_object('item_name', 'Pant', 'style_name', 'Style 1', 'color', 'Black', 'gram_per_piece', 0)
        )
    );
    IF (v_save_res->>'success')::boolean = false AND (v_save_res->>'error') ILIKE '%Invalid gram per piece%' THEN
        test_num := 4;
        test_name := 'Zero gram rejection';
        result := 'PASS';
        detail := format('Correctly rejected with error: %s', v_save_res->>'error');
        RETURN NEXT;
    ELSE
        test_num := 4;
        test_name := 'Zero gram rejection';
        result := 'FAIL';
        detail := format('Expected failure, got: %s', v_save_res::text);
        RETURN NEXT;
    END IF;

    -------------------------------------------------------------------------
    -- TEST 5: Negative gram is rejected by save_order_inventory_materials
    -------------------------------------------------------------------------
    v_save_res := public.save_order_inventory_materials(
        v_order_1,
        jsonb_build_array(
            jsonb_build_object('item_name', 'Pant', 'style_name', 'Style 1', 'color', 'Black', 'gram_per_piece', -150)
        )
    );
    IF (v_save_res->>'success')::boolean = false AND (v_save_res->>'error') ILIKE '%Invalid gram per piece%' THEN
        test_num := 5;
        test_name := 'Negative gram rejection';
        result := 'PASS';
        detail := format('Correctly rejected with error: %s', v_save_res->>'error');
        RETURN NEXT;
    ELSE
        test_num := 5;
        test_name := 'Negative gram rejection';
        result := 'FAIL';
        detail := format('Expected failure, got: %s', v_save_res::text);
        RETURN NEXT;
    END IF;

    -------------------------------------------------------------------------
    -- TEST 6: Decimal gram is supported (e.g., 225.5 g)
    -------------------------------------------------------------------------
    v_save_res := public.save_order_inventory_materials(
        v_order_1,
        jsonb_build_array(
            jsonb_build_object('item_name', 'Shirt', 'style_name', 'Style 2', 'color', 'White', 'gram_per_piece', 225.5)
        )
    );
    SELECT total_grams INTO v_rec FROM public.order_inventory_materials
    WHERE order_id = v_order_1 AND item_name = 'Shirt' AND color = 'White';

    -- 225.5 * 120 = 27060
    IF v_rec.total_grams = 27060 THEN
        test_num := 6;
        test_name := 'Decimal gram supported (225.5 * 120 = 27060)';
        result := 'PASS';
        detail := format('total_grams = %s', v_rec.total_grams);
        RETURN NEXT;
    ELSE
        test_num := 6;
        test_name := 'Decimal gram supported (225.5 * 120 = 27060)';
        result := 'FAIL';
        detail := format('Expected 27060, got %s', v_rec.total_grams);
        RETURN NEXT;
    END IF;

    -------------------------------------------------------------------------
    -- TEST 7: Cannot complete Inventory stage with missing style/color grams
    -------------------------------------------------------------------------
    -- Order 1 still has 'Shirt Style 2 Sky Blue' without any gram value!
    v_adv_res := public.advance_production_stage(v_order_1, 'cutting');
    IF (v_adv_res->>'success')::boolean = false THEN
        test_num := 7;
        test_name := 'Cannot complete Inventory stage when required style/color grams are missing';
        result := 'PASS';
        detail := format('Blocked advance with error: %s', v_adv_res->>'error');
        RETURN NEXT;
    ELSE
        test_num := 7;
        test_name := 'Cannot complete Inventory stage when required style/color grams are missing';
        result := 'FAIL';
        detail := 'Stage advanced unexpectedly while rows were missing';
        RETURN NEXT;
    END IF;

    -------------------------------------------------------------------------
    -- TEST 8: Full completion succeeds once all grams are provided
    -------------------------------------------------------------------------
    -- Save the remaining row (Shirt Sky Blue = 180g) and set Shirt White = 180g
    v_save_res := public.save_order_inventory_materials(
        v_order_1,
        jsonb_build_array(
            jsonb_build_object('item_name', 'Shirt', 'style_name', 'Style 2', 'color', 'White', 'gram_per_piece', 180),
            jsonb_build_object('item_name', 'Shirt', 'style_name', 'Style 2', 'color', 'Sky Blue', 'gram_per_piece', 180)
        )
    );

    v_adv_res := public.advance_production_stage(v_order_1, 'cutting');
    IF (v_adv_res->>'success')::boolean = true THEN
        test_num := 8;
        test_name := 'Inventory stage completes and advances to Cutting when all grams are valid';
        result := 'PASS';
        detail := format('Advanced to stage: %s', v_adv_res->>'current_stage');
        RETURN NEXT;
    ELSE
        test_num := 8;
        test_name := 'Inventory stage completes and advances to Cutting when all grams are valid';
        result := 'FAIL';
        detail := format('Failed to advance: %s', v_adv_res->>'error');
        RETURN NEXT;
    END IF;

    -------------------------------------------------------------------------
    -- TEST 9: Order Independence (Order 1 vs Order 2 on same School A)
    -------------------------------------------------------------------------
    -- Save Order 2 with 300g for Pant Black
    v_save_res := public.save_order_inventory_materials(
        v_order_2,
        jsonb_build_array(
            jsonb_build_object('item_name', 'Pant', 'style_name', 'Style 1', 'color', 'Black', 'gram_per_piece', 300)
        )
    );

    SELECT gram_per_piece INTO v_rec FROM public.order_inventory_materials
    WHERE order_id = v_order_1 AND item_name = 'Pant' AND color = 'Black';

    IF v_rec.gram_per_piece = 250 THEN
        test_num := 9;
        test_name := 'Multiple active orders for same school remain completely independent';
        result := 'PASS';
        detail := 'Order 1 retained 250g while Order 2 was saved with 300g';
        RETURN NEXT;
    ELSE
        test_num := 9;
        test_name := 'Multiple active orders for same school remain completely independent';
        result := 'FAIL';
        detail := format('Order 1 gram was mutated to %s', v_rec.gram_per_piece);
        RETURN NEXT;
    END IF;

    -------------------------------------------------------------------------
    -- TEST 10: Authorization: Non-evenvibe_admin cannot save inventory materials
    -------------------------------------------------------------------------
    -- Find a school admin user
    DECLARE
        v_school_admin_id UUID;
    BEGIN
        SELECT id INTO v_school_admin_id FROM public.profiles WHERE role = 'school_admin' LIMIT 1;
        IF v_school_admin_id IS NULL THEN
            v_school_admin_id := gen_random_uuid();
        END IF;

        PERFORM set_config('request.jwt.claim.sub', v_school_admin_id::text, true);

        v_save_res := public.save_order_inventory_materials(
            v_order_1,
            jsonb_build_array(
                jsonb_build_object('item_name', 'Pant', 'style_name', 'Style 1', 'color', 'Black', 'gram_per_piece', 500)
            )
        );

        IF (v_save_res->>'success')::boolean = false AND (v_save_res->>'error') ILIKE '%Unauthorized%' THEN
            test_num := 10;
            test_name := 'Non-evenvibe_admin cannot mutate inventory materials';
            result := 'PASS';
            detail := format('Correctly blocked with: %s', v_save_res->>'error');
            RETURN NEXT;
        ELSE
            test_num := 10;
            test_name := 'Non-evenvibe_admin cannot mutate inventory materials';
            result := 'FAIL';
            detail := format('Expected unauthorized error, got: %s', v_save_res::text);
            RETURN NEXT;
        END IF;
    END;

END;
$$;

SELECT * FROM public.test_inventory_db_suite();
DROP FUNCTION IF EXISTS public.test_inventory_db_suite();
