DO $BODY$
DECLARE
    v_school_id UUID;
    v_school_admin_id UUID;
    v_student_ids UUID[];
    v_student_a_id UUID;
    v_student_b_id UUID;
    v_res_a JSON;
    v_res_b JSON;
    v_order_a_id UUID;
    v_order_b_id UUID;
    v_req_a_id UUID;
    v_req_b_id UUID;
    v_order_a_number TEXT;
    v_order_b_number TEXT;
    v_stage_cutting_status TEXT;
    v_count_active_orders INT;
BEGIN
    -- 1. Identify school & school admin
    SELECT s.id, p.id INTO v_school_id, v_school_admin_id
    FROM public.schools s
    JOIN public.profiles p ON p.school_id = s.id AND p.role = 'school_admin'
    LIMIT 1;

    IF v_school_id IS NULL OR v_school_admin_id IS NULL THEN
        RAISE EXCEPTION 'No school or school admin found for testing';
    END IF;

    -- Pick 2 students with completed sizes
    SELECT array_agg(st.id) INTO v_student_ids
    FROM (
        SELECT s.id
        FROM public.students s
        JOIN public.student_uniform_sizes sus ON sus.student_id = s.id
        WHERE s.school_id = v_school_id AND sus.is_complete = true
        LIMIT 2
    ) st;

    IF array_length(v_student_ids, 1) < 2 THEN
        RAISE EXCEPTION 'Need at least 2 completed students for school %', v_school_id;
    END IF;

    v_student_a_id := v_student_ids[1];
    v_student_b_id := v_student_ids[2];

    -- Set context to school admin
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_school_admin_id::text)::text, true);

    -- 2. Submit Requirement A (creates Order A)
    v_res_a := public.submit_requirement(ARRAY[v_student_a_id]);
    IF (v_res_a->>'success')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'Order A submission failed: %', v_res_a;
    END IF;

    v_order_a_id := (v_res_a->>'order_id')::uuid;
    v_req_a_id := (v_res_a->>'requirement_id')::uuid;
    v_order_a_number := v_res_a->>'order_number';

    -- 3. Transition Order A to 'production' and set 'cutting' stage to in_progress
    UPDATE public.orders
    SET status = 'production', updated_at = now()
    WHERE id = v_order_a_id;

    UPDATE public.order_production_workflows
    SET status = 'in_progress', started_at = now(), updated_at = now()
    WHERE order_id = v_order_a_id AND stage_key = 'cutting';

    -- Verify Order A status & workflow
    SELECT status INTO v_stage_cutting_status
    FROM public.order_production_workflows
    WHERE order_id = v_order_a_id AND stage_key = 'cutting';

    IF v_stage_cutting_status != 'in_progress' THEN
        RAISE EXCEPTION 'Order A cutting stage is not in_progress';
    END IF;

    -- 4. CRITICAL TEST: While Order A is live in 'production' (stage Cutting),
    -- Submit Requirement B for the SAME school by the SAME school admin!
    v_res_b := public.submit_requirement(ARRAY[v_student_b_id]);
    IF (v_res_b->>'success')::boolean IS NOT TRUE THEN
        RAISE EXCEPTION 'Order B submission failed while Order A is active in Production: %', v_res_b;
    END IF;

    v_order_b_id := (v_res_b->>'order_id')::uuid;
    v_req_b_id := (v_res_b->>'requirement_id')::uuid;
    v_order_b_number := v_res_b->>'order_number';

    -- 5. VERIFY INDEPENDENCE:
    -- Verify Order B has distinct order and requirement IDs
    IF v_order_a_id = v_order_b_id THEN
        RAISE EXCEPTION 'Order IDs must be distinct!';
    END IF;
    IF v_req_a_id = v_req_b_id THEN
        RAISE EXCEPTION 'Requirement IDs must be distinct!';
    END IF;
    IF v_order_a_number = v_order_b_number THEN
        RAISE EXCEPTION 'Order numbers must be distinct!';
    END IF;

    -- Verify Order A is STILL in 'production' and cutting stage is STILL in_progress
    IF (SELECT status FROM public.orders WHERE id = v_order_a_id) != 'production' THEN
        RAISE EXCEPTION 'Order A status was corrupted by Order B creation!';
    END IF;

    IF (SELECT status FROM public.order_production_workflows WHERE order_id = v_order_a_id AND stage_key = 'cutting') != 'in_progress' THEN
        RAISE EXCEPTION 'Order A cutting stage was modified by Order B creation!';
    END IF;

    -- Verify Order B is in 'submitted'
    IF (SELECT status FROM public.orders WHERE id = v_order_b_id) != 'submitted' THEN
        RAISE EXCEPTION 'Order B status should be submitted, got %', (SELECT status FROM public.orders WHERE id = v_order_b_id);
    END IF;

    -- Verify Order B received its OWN 8 independent stages
    IF (SELECT count(*) FROM public.order_production_workflows WHERE order_id = v_order_b_id) != 8 THEN
        RAISE EXCEPTION 'Order B did not receive its own 8 stages!';
    END IF;

    -- Verify Order B cutting stage is pending (NOT affected by Order A cutting stage being in_progress)
    IF (SELECT status FROM public.order_production_workflows WHERE order_id = v_order_b_id AND stage_key = 'cutting') != 'pending' THEN
        RAISE EXCEPTION 'Order B cutting stage was incorrectly set to Order A status!';
    END IF;

    -- 6. Advance Order A to another stage and verify Order B remains unaffected
    UPDATE public.order_production_workflows
    SET status = 'completed', completed_at = now(), updated_at = now()
    WHERE order_id = v_order_a_id AND stage_key = 'cutting';

    IF (SELECT status FROM public.order_production_workflows WHERE order_id = v_order_b_id AND stage_key = 'cutting') != 'pending' THEN
        RAISE EXCEPTION 'Order B cutting stage was mutated when Order A advanced!';
    END IF;

    -- 7. Verify count of active orders for this school is at least 2
    SELECT count(*) INTO v_count_active_orders
    FROM public.orders
    WHERE school_id = v_school_id AND status IN ('submitted', 'under_review', 'confirmed', 'production');

    IF v_count_active_orders < 2 THEN
        RAISE EXCEPTION 'Expected at least 2 active orders, got %', v_count_active_orders;
    END IF;

    RAISE NOTICE 'TEST PASSED: Multiple active orders coexist and progress independently! School: %, Order A (%: %), Order B (%: %)', 
        v_school_id, v_order_a_number, (SELECT status FROM public.orders WHERE id = v_order_a_id),
        v_order_b_number, (SELECT status FROM public.orders WHERE id = v_order_b_id);
END $BODY$;
