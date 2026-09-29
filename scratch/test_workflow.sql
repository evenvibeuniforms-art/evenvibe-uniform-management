-- Scratch Test Script for Order-Specific Workflow Sequencing
DO $BODY$
DECLARE
    v_order_a_id UUID;
    v_order_b_id UUID;
    v_req_a_id UUID;
    v_req_b_id UUID;
    v_res JSONB;
    v_stage_a TEXT;
    v_stage_b TEXT;
    v_admin_id UUID := 'a068ee85-bd10-4e99-8572-be87da83c8cd';
BEGIN
    -- 1. Cleanup
    DELETE FROM public.orders WHERE order_number IN ('EV-ORD-TEST-A', 'EV-ORD-TEST-B');
    DELETE FROM public.requirements WHERE requirement_number IN ('EV-REQ-TEST-A', 'EV-REQ-TEST-B');

    -- Create test requirements
    INSERT INTO public.requirements (requirement_number, school_id, status, total_students)
    VALUES ('EV-REQ-TEST-A', 'ec375e0e-1e7d-41f4-a089-1eb0fb23365a', 'submitted', 50)
    RETURNING id INTO v_req_a_id;

    INSERT INTO public.requirements (requirement_number, school_id, status, total_students)
    VALUES ('EV-REQ-TEST-B', '2ac4044a-facf-4642-874a-712ede9f4bb6', 'submitted', 50)
    RETURNING id INTO v_req_b_id;

    -- Insert dummy requirement item so total_quantity is valid
    INSERT INTO public.requirement_items (requirement_id, item_name, size, quantity)
    VALUES (v_req_a_id, 'Shirt', '32', 50);

    INSERT INTO public.requirement_items (requirement_id, item_name, size, quantity)
    VALUES (v_req_b_id, 'Shirt', '32', 50);

    -- 2. Create Order A & Order B in confirmed status
    INSERT INTO public.orders (order_number, school_id, requirement_id, status)
    VALUES ('EV-ORD-TEST-A', 'ec375e0e-1e7d-41f4-a089-1eb0fb23365a', v_req_a_id, 'confirmed')
    RETURNING id INTO v_order_a_id;

    INSERT INTO public.orders (order_number, school_id, requirement_id, status)
    VALUES ('EV-ORD-TEST-B', '2ac4044a-facf-4642-874a-712ede9f4bb6', v_req_b_id, 'confirmed')
    RETURNING id INTO v_order_b_id;

    -- Verify default 8 stages exist for both
    IF (SELECT count(*) FROM public.order_production_workflows WHERE order_id = v_order_a_id) != 8 THEN
        RAISE EXCEPTION 'Order A did not receive 8 default stages';
    END IF;

    IF (SELECT count(*) FROM public.order_production_workflows WHERE order_id = v_order_b_id) != 8 THEN
        RAISE EXCEPTION 'Order B did not receive 8 default stages';
    END IF;

    -- 3. Configure Order B sequence:
    -- 1 Stock Sizes, 2 Cutting, 3 Inventory, 4 Stitching, 5 Ironing and Packing, 6 Printing, 7 Embroidering, 8 Checking
    -- Temporarily set context user to admin
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin_id::text)::text, true);

    v_res := public.save_order_production_workflow(
        v_order_b_id,
        ARRAY[
            'stock_sizes',
            'cutting',
            'inventory',
            'stitching',
            'ironing_packing',
            'printing',
            'embroidering',
            'checking'
        ]
    );

    IF (v_res->>'success')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'Failed to save Order B workflow: %', v_res;
    END IF;

    -- Verify Order A is still default (sequence 2 is inventory, 3 is cutting)
    IF (SELECT stage_key FROM public.order_production_workflows WHERE order_id = v_order_a_id AND sequence_order = 2) != 'inventory' OR
       (SELECT stage_key FROM public.order_production_workflows WHERE order_id = v_order_a_id AND sequence_order = 3) != 'cutting' THEN
        RAISE EXCEPTION 'Order A sequence was unexpectedly modified by Order B update!';
    END IF;

    -- Verify Order B sequence 2 is cutting, 3 is inventory
    IF (SELECT stage_key FROM public.order_production_workflows WHERE order_id = v_order_b_id AND sequence_order = 2) != 'cutting' OR
       (SELECT stage_key FROM public.order_production_workflows WHERE order_id = v_order_b_id AND sequence_order = 3) != 'inventory' THEN
        RAISE EXCEPTION 'Order B sequence was not properly set!';
    END IF;

    -- 4. Start production on Order A and Order B
    v_res := public.start_production(v_order_a_id, 'Starting Order A');
    IF (v_res->>'success')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'Failed to start production on Order A: %', v_res;
    END IF;

    v_res := public.start_production(v_order_b_id, 'Starting Order B');
    IF (v_res->>'success')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'Failed to start production on Order B: %', v_res;
    END IF;

    -- 5. Test locking: Attempt to reorder Order A after production started -> MUST fail!
    v_res := public.save_order_production_workflow(
        v_order_a_id,
        ARRAY[
            'stock_sizes',
            'inventory',
            'cutting',
            'stitching',
            'printing',
            'embroidering',
            'ironing_packing',
            'checking'
        ]
    );

    IF (v_res->>'success')::boolean IS TRUE THEN
        RAISE EXCEPTION 'Locking failed! Reordering was allowed on started Order A';
    END IF;

    IF (v_res->>'error') NOT LIKE '%Production workflow is locked%' THEN
        RAISE EXCEPTION 'Unexpected lock error message: %', v_res->>'error';
    END IF;

    -- 6. Advance Order A:
    -- Currently in Stock Sizes (seq 1) -> advance to Inventory (seq 2)
    v_res := public.advance_production_stage(v_order_a_id, 'inventory', 'Stock sizes done');
    IF (v_res->>'success')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'Order A failed to advance to inventory: %', v_res;
    END IF;

    -- Advance Order A from Inventory (seq 2) -> to Cutting (seq 3)
    v_res := public.advance_production_stage(v_order_a_id, 'cutting', 'Inventory done');
    IF (v_res->>'success')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'Order A failed to advance to cutting: %', v_res;
    END IF;

    -- Check Order A current stage: MUST be cutting
    SELECT stage_key INTO v_stage_a FROM public.order_production_workflows WHERE order_id = v_order_a_id AND status = 'in_progress';
    IF v_stage_a != 'cutting' THEN
        RAISE EXCEPTION 'Expected Order A current stage = cutting, got %', v_stage_a;
    END IF;

    -- 7. Advance Order B:
    -- Currently in Stock Sizes (seq 1) -> advance to Cutting (seq 2 for Order B!)
    v_res := public.advance_production_stage(v_order_b_id, 'cutting', 'Stock sizes done');
    IF (v_res->>'success')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'Order B failed to advance to cutting: %', v_res;
    END IF;

    -- Advance Order B from Cutting (seq 2) -> to Inventory (seq 3 for Order B!)
    v_res := public.advance_production_stage(v_order_b_id, 'inventory', 'Cutting done');
    IF (v_res->>'success')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'Order B failed to advance to inventory: %', v_res;
    END IF;

    -- Check Order B current stage: MUST be inventory
    SELECT stage_key INTO v_stage_b FROM public.order_production_workflows WHERE order_id = v_order_b_id AND status = 'in_progress';
    IF v_stage_b != 'inventory' THEN
        RAISE EXCEPTION 'Expected Order B current stage = inventory, got %', v_stage_b;
    END IF;

    -- 8. Advance both to Stitching:
    -- Order A: from Cutting (seq 3) -> Stitching (seq 4)
    v_res := public.advance_production_stage(v_order_a_id, 'stitching', 'Order A cutting completed');
    IF (v_res->>'success')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'Order A failed to advance to stitching: %', v_res;
    END IF;

    -- Order B: from Inventory (seq 3) -> Stitching (seq 4)
    v_res := public.advance_production_stage(v_order_b_id, 'stitching', 'Order B inventory completed');
    IF (v_res->>'success')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'Order B failed to advance to stitching: %', v_res;
    END IF;

    -- Verify final stage states
    SELECT stage_key INTO v_stage_a FROM public.order_production_workflows WHERE order_id = v_order_a_id AND status = 'in_progress';
    SELECT stage_key INTO v_stage_b FROM public.order_production_workflows WHERE order_id = v_order_b_id AND status = 'in_progress';

    IF v_stage_a != 'stitching' OR v_stage_b != 'stitching' THEN
        RAISE EXCEPTION 'Advancement mismatch! Order A: %, Order B: %', v_stage_a, v_stage_b;
    END IF;

    RAISE NOTICE 'ALL DATABASE SEQUENCING TESTS PASSED SUCCESSFULLY!';
END $BODY$;
