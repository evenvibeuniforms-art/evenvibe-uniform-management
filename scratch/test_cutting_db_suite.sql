-- Test Suite for Stage 3 Cutting — Style + Color + Size Required vs Actual Cut Quantity
CREATE OR REPLACE FUNCTION public.test_cutting_db_suite()
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
    v_workflow_res JSONB;
    v_res_val INT;
    v_req_val INT;
    v_cut_val INT;
    v_row_count INT;
BEGIN
    -- 1. Auth as admin
    SELECT id INTO v_admin_id FROM public.profiles WHERE role = 'evenvibe_admin' LIMIT 1;
    PERFORM set_config('request.jwt.claim.sub', v_admin_id::text, true);

    -- Get two distinct schools
    SELECT id INTO v_school_id FROM public.schools ORDER BY created_at ASC LIMIT 1;
    SELECT id INTO v_school_b_id FROM public.schools ORDER BY created_at DESC LIMIT 1;

    -- Setup Order 1 with Pant Style 1 Black (Sizes 22: 1, 26: 5, 28: 6, 30: 8)
    -- Plus Pant Style 1 Red (Sizes 22: 3, 26: 7)
    INSERT INTO public.requirements (school_id, requirement_number, status, total_students, regular_uniform_students, tshirt_uniform_students)
    VALUES (v_school_id, 'REQ-CUT-1-' || gen_random_uuid(), 'confirmed', 30, 30, 0)
    RETURNING id INTO v_req_1;

    INSERT INTO public.requirement_items (requirement_id, item_name, style_name, color, size, quantity)
    VALUES 
        (v_req_1, 'Pant', 'Style 1', 'Black', '22', 1),
        (v_req_1, 'Pant', 'Style 1', 'Black', '26', 5),
        (v_req_1, 'Pant', 'Style 1', 'Black', '28', 6),
        (v_req_1, 'Pant', 'Style 1', 'Black', '30', 8),
        (v_req_1, 'Pant', 'Style 1', 'Red', '22', 3),
        (v_req_1, 'Pant', 'Style 1', 'Red', '26', 7);

    INSERT INTO public.orders (order_number, school_id, requirement_id, status)
    VALUES ('ORD-CUT-1-' || substr(gen_random_uuid()::text, 1, 6), v_school_id, v_req_1, 'confirmed')
    RETURNING id INTO v_order_1;

    -- Setup Order 2 (Order B)
    INSERT INTO public.requirements (school_id, requirement_number, status, total_students, regular_uniform_students, tshirt_uniform_students)
    VALUES (v_school_id, 'REQ-CUT-2-' || gen_random_uuid(), 'confirmed', 10, 10, 0)
    RETURNING id INTO v_req_2;

    INSERT INTO public.requirement_items (requirement_id, item_name, style_name, color, size, quantity)
    VALUES 
        (v_req_2, 'Pant', 'Style 1', 'Black', '22', 10);

    INSERT INTO public.orders (order_number, school_id, requirement_id, status)
    VALUES ('ORD-CUT-2-' || substr(gen_random_uuid()::text, 1, 6), v_school_id, v_req_2, 'confirmed')
    RETURNING id INTO v_order_2;

    -- Initialize production workflow for both orders
    PERFORM public.start_production(v_order_1, 'Start order 1');
    PERFORM public.start_production(v_order_2, 'Start order 2');

    -- Setup Order 1 Inventory materials so inventory can be completed
    PERFORM public.save_order_inventory_materials(
        v_order_1,
        jsonb_build_array(
            jsonb_build_object('item_name', 'Pant', 'style_name', 'Style 1', 'color', 'Black', 'gram_per_piece', 250),
            jsonb_build_object('item_name', 'Pant', 'style_name', 'Style 1', 'color', 'Red', 'gram_per_piece', 250)
        )
    );

    -- Advance Order 1: Stage 1 (Stock Sizes) -> Stage 2 (Inventory)
    PERFORM public.advance_production_stage(v_order_1, 'inventory');
    -- Advance Order 1: Stage 2 (Inventory) -> Stage 3 (Cutting)
    PERFORM public.advance_production_stage(v_order_1, 'cutting');

    -------------------------------------------------------------------------
    -- TEST 1: Authoritative Required Quantity Derivation from snapshot
    -------------------------------------------------------------------------
    -- Frontend passes cut_quantity = 1, but attempts to forge required_quantity (should be ignored/overwritten from snapshot)
    v_save_res := public.save_order_cutting_items(
        v_order_1,
        jsonb_build_array(
            jsonb_build_object('item_name', 'Pant', 'style_name', 'Style 1', 'color', 'Black', 'size', '22', 'cut_quantity', 1, 'required_quantity', 9999)
        )
    );

    SELECT required_quantity, cut_quantity, result_quantity
    INTO v_req_val, v_cut_val, v_res_val
    FROM public.order_cutting_items
    WHERE order_id = v_order_1 AND item_name = 'Pant' AND color = 'Black' AND size = '22';

    IF v_req_val = 1 AND v_cut_val = 1 AND v_res_val = 0 THEN
        test_num := 1;
        test_name := 'Authoritative required quantity derived from snapshot (ignores client forgery)';
        result := 'PASS';
        detail := format('Required = %s (snapshot value 1, forged 9999 ignored), Cut = %s, Result = %s', v_req_val, v_cut_val, v_res_val);
        RETURN NEXT;
    ELSE
        test_num := 1;
        test_name := 'Authoritative required quantity derived from snapshot';
        result := 'FAIL';
        detail := format('Got req=%s, cut=%s, res=%s', v_req_val, v_cut_val, v_res_val);
        RETURN NEXT;
    END IF;

    -------------------------------------------------------------------------
    -- TEST 2: Under-cut produces positive Result (Size 26: Required 5, Cut 3 -> Result +2)
    -------------------------------------------------------------------------
    v_save_res := public.save_order_cutting_items(
        v_order_1,
        jsonb_build_array(
            jsonb_build_object('item_name', 'Pant', 'style_name', 'Style 1', 'color', 'Black', 'size', '26', 'cut_quantity', 3)
        )
    );

    SELECT required_quantity, cut_quantity, result_quantity
    INTO v_req_val, v_cut_val, v_res_val
    FROM public.order_cutting_items
    WHERE order_id = v_order_1 AND item_name = 'Pant' AND color = 'Black' AND size = '26';

    IF v_req_val = 5 AND v_cut_val = 3 AND v_res_val = 2 THEN
        test_num := 2;
        test_name := 'Under-cut produces positive Result (Pending)';
        result := 'PASS';
        detail := format('Size 26: Required = 5, Cut = 3, Result = %s (+2)', v_res_val);
        RETURN NEXT;
    ELSE
        test_num := 2;
        test_name := 'Under-cut produces positive Result';
        result := 'FAIL';
        detail := format('Got req=%s, cut=%s, res=%s', v_req_val, v_cut_val, v_res_val);
        RETURN NEXT;
    END IF;

    -------------------------------------------------------------------------
    -- TEST 3: Over-cut produces negative Result (Size 28: Required 6, Cut 8 -> Result -2)
    -------------------------------------------------------------------------
    v_save_res := public.save_order_cutting_items(
        v_order_1,
        jsonb_build_array(
            jsonb_build_object('item_name', 'Pant', 'style_name', 'Style 1', 'color', 'Black', 'size', '28', 'cut_quantity', 8)
        )
    );

    SELECT required_quantity, cut_quantity, result_quantity
    INTO v_req_val, v_cut_val, v_res_val
    FROM public.order_cutting_items
    WHERE order_id = v_order_1 AND item_name = 'Pant' AND color = 'Black' AND size = '28';

    IF v_req_val = 6 AND v_cut_val = 8 AND v_res_val = -2 THEN
        test_num := 3;
        test_name := 'Over-cut is valid and produces negative Result (Extra Cut)';
        result := 'PASS';
        detail := format('Size 28: Required = 6, Cut = 8, Result = %s (-2)', v_res_val);
        RETURN NEXT;
    ELSE
        test_num := 3;
        test_name := 'Over-cut is valid and produces negative Result';
        result := 'FAIL';
        detail := format('Got req=%s, cut=%s, res=%s', v_req_val, v_cut_val, v_res_val);
        RETURN NEXT;
    END IF;

    -------------------------------------------------------------------------
    -- TEST 4: Zero Cut is accepted and produces full Pending (Size 30: Required 8, Cut 0 -> Result +8)
    -------------------------------------------------------------------------
    v_save_res := public.save_order_cutting_items(
        v_order_1,
        jsonb_build_array(
            jsonb_build_object('item_name', 'Pant', 'style_name', 'Style 1', 'color', 'Black', 'size', '30', 'cut_quantity', 0)
        )
    );

    SELECT required_quantity, cut_quantity, result_quantity
    INTO v_req_val, v_cut_val, v_res_val
    FROM public.order_cutting_items
    WHERE order_id = v_order_1 AND item_name = 'Pant' AND color = 'Black' AND size = '30';

    IF v_req_val = 8 AND v_cut_val = 0 AND v_res_val = 8 THEN
        test_num := 4;
        test_name := 'Zero Cut is valid and produces positive Result (+8)';
        result := 'PASS';
        detail := format('Size 30: Required = 8, Cut = 0, Result = %s (+8)', v_res_val);
        RETURN NEXT;
    ELSE
        test_num := 4;
        test_name := 'Zero Cut is valid and produces positive Result';
        result := 'FAIL';
        detail := format('Got req=%s, cut=%s, res=%s', v_req_val, v_cut_val, v_res_val);
        RETURN NEXT;
    END IF;

    -------------------------------------------------------------------------
    -- TEST 5: Negative Cut Quantity is rejected by server
    -------------------------------------------------------------------------
    v_save_res := public.save_order_cutting_items(
        v_order_1,
        jsonb_build_array(
            jsonb_build_object('item_name', 'Pant', 'style_name', 'Style 1', 'color', 'Black', 'size', '22', 'cut_quantity', -1)
        )
    );

    IF (v_save_res->>'success')::boolean = false THEN
        test_num := 5;
        test_name := 'Negative Cut Quantity is rejected';
        result := 'PASS';
        detail := format('Correctly rejected with error: %s', v_save_res->>'error');
        RETURN NEXT;
    ELSE
        test_num := 5;
        test_name := 'Negative Cut Quantity is rejected';
        result := 'FAIL';
        detail := 'Server unexpectedly accepted negative cut quantity';
        RETURN NEXT;
    END IF;

    -------------------------------------------------------------------------
    -- TEST 6: Decimal Cut Quantity is rejected by server
    -------------------------------------------------------------------------
    v_save_res := public.save_order_cutting_items(
        v_order_1,
        jsonb_build_array(
            jsonb_build_object('item_name', 'Pant', 'style_name', 'Style 1', 'color', 'Black', 'size', '22', 'cut_quantity', '2.5')
        )
    );

    IF (v_save_res->>'success')::boolean = false THEN
        test_num := 6;
        test_name := 'Decimal Cut Quantity is rejected';
        result := 'PASS';
        detail := format('Correctly rejected with error: %s', v_save_res->>'error');
        RETURN NEXT;
    ELSE
        test_num := 6;
        test_name := 'Decimal Cut Quantity is rejected';
        result := 'FAIL';
        detail := 'Server unexpectedly accepted decimal cut quantity';
        RETURN NEXT;
    END IF;

    -------------------------------------------------------------------------
    -- TEST 7: Style + Color separation (Pant Style 1 Red is separate from Black)
    -------------------------------------------------------------------------
    v_save_res := public.save_order_cutting_items(
        v_order_1,
        jsonb_build_array(
            jsonb_build_object('item_name', 'Pant', 'style_name', 'Style 1', 'color', 'Red', 'size', '22', 'cut_quantity', 3)
            -- Note: Red size 26 is intentionally NOT saved yet to test incomplete blocking
        )
    );

    SELECT COUNT(*) INTO v_row_count FROM public.order_cutting_items WHERE order_id = v_order_1;

    IF v_row_count = 5 THEN
        test_num := 7;
        test_name := 'Style + Color separate rows created in DB';
        result := 'PASS';
        detail := format('5 separate size rows stored for Order 1 (Black 22,26,28,30 + Red 22)');
        RETURN NEXT;
    ELSE
        test_num := 7;
        test_name := 'Style + Color separate rows created in DB';
        result := 'FAIL';
        detail := format('Expected 5 rows, got %s', v_row_count);
        RETURN NEXT;
    END IF;

    -------------------------------------------------------------------------
    -- TEST 8: Missing Cut Quantity blocks Cutting completion
    -------------------------------------------------------------------------
    -- Red size 26 is still missing
    v_adv_res := public.advance_production_stage(v_order_1, 'cutting_completed');

    IF (v_adv_res->>'success')::boolean = false THEN
        test_num := 8;
        test_name := 'Missing Cut Quantity blocks completion in advance_production_stage';
        result := 'PASS';
        detail := format('Correctly blocked: %s', v_adv_res->>'error');
        RETURN NEXT;
    ELSE
        test_num := 8;
        test_name := 'Missing Cut Quantity blocks completion';
        result := 'FAIL';
        detail := 'Cutting stage was completed despite missing size 26 for Red!';
        RETURN NEXT;
    END IF;

    -------------------------------------------------------------------------
    -- TEST 9: Complete Cutting succeeds once all required sizes have cut quantities
    -------------------------------------------------------------------------
    -- Save the missing Red size 26
    PERFORM public.save_order_cutting_items(
        v_order_1,
        jsonb_build_array(
            jsonb_build_object('item_name', 'Pant', 'style_name', 'Style 1', 'color', 'Red', 'size', '26', 'cut_quantity', 7)
        )
    );

    v_adv_res := public.advance_production_stage(v_order_1, 'cutting_completed', 'All cuts verified');

    IF (v_adv_res->>'success')::boolean = true AND (v_adv_res->>'cutting_completed')::boolean = true THEN
        test_num := 9;
        test_name := 'Complete Cutting succeeds when all required sizes are cut';
        result := 'PASS';
        detail := format('Cutting marked completed: %s', v_adv_res);
        RETURN NEXT;
    ELSE
        test_num := 9;
        test_name := 'Complete Cutting succeeds when all required sizes are cut';
        result := 'FAIL';
        detail := format('Failed to complete cutting: %s', v_adv_res);
        RETURN NEXT;
    END IF;

    -------------------------------------------------------------------------
    -- TEST 10: Cutting completion unlocks middle stage sequence arrangement
    -------------------------------------------------------------------------
    v_workflow_res := public.save_order_production_workflow(
        v_order_1,
        ARRAY['stock_sizes', 'inventory', 'cutting', 'printing', 'stitching', 'embroidering', 'checking', 'ironing_packing']::TEXT[]
    );

    IF (v_workflow_res->>'success')::boolean = true THEN
        test_num := 10;
        test_name := 'Middle sequence arrangement unlocks after Cutting completion';
        result := 'PASS';
        detail := 'Admin successfully arranged Printing -> Stitching -> Embroidering';
        RETURN NEXT;
    ELSE
        test_num := 10;
        test_name := 'Middle sequence arrangement unlocks after Cutting completion';
        result := 'FAIL';
        detail := format('Failed to arrange middle sequence: %s', v_workflow_res);
        RETURN NEXT;
    END IF;

    -------------------------------------------------------------------------
    -- TEST 11: Order Independence (Order A does not affect Order B)
    -------------------------------------------------------------------------
    SELECT COUNT(*) INTO v_row_count FROM public.order_cutting_items WHERE order_id = v_order_2;

    IF v_row_count = 0 THEN
        test_num := 11;
        test_name := 'Order Independence: Order 2 has 0 cutting items while Order 1 has 6';
        result := 'PASS';
        detail := 'Order 2 remains completely clean and isolated';
        RETURN NEXT;
    ELSE
        test_num := 11;
        test_name := 'Order Independence';
        result := 'FAIL';
        detail := format('Order 2 contaminated with %s cutting items', v_row_count);
        RETURN NEXT;
    END IF;

    -- Cleanup test data
    DELETE FROM public.orders WHERE id IN (v_order_1, v_order_2);
    DELETE FROM public.requirements WHERE id IN (v_req_1, v_req_2);

END;
$$;
