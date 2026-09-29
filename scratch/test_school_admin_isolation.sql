DO $BODY$
DECLARE
    v_school_a_id UUID;
    v_school_b_id UUID;
    v_admin_a_id UUID;
    v_admin_b_id UUID;
    v_order_a_id UUID;
    v_order_b_id UUID;
    v_student_b_id UUID;
    v_res JSON;
BEGIN
    -- Find 2 distinct schools with admins
    SELECT s.id, p.id INTO v_school_a_id, v_admin_a_id
    FROM public.schools s
    JOIN public.profiles p ON p.school_id = s.id AND p.role = 'school_admin'
    ORDER BY s.id
    LIMIT 1;

    SELECT s.id, p.id INTO v_school_b_id, v_admin_b_id
    FROM public.schools s
    JOIN public.profiles p ON p.school_id = s.id AND p.role = 'school_admin'
    WHERE s.id != v_school_a_id
    ORDER BY s.id
    LIMIT 1;

    IF v_school_b_id IS NULL OR v_admin_b_id IS NULL THEN
        RAISE NOTICE 'Skipping cross-school test: only 1 school exists.';
        RETURN;
    END IF;

    -- Pick a student belonging to School B
    SELECT s.id INTO v_student_b_id
    FROM public.students s
    JOIN public.student_uniform_sizes sus ON sus.student_id = s.id
    WHERE s.school_id = v_school_b_id AND sus.is_complete = true
    LIMIT 1;

    -- Set context to Admin A
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_admin_a_id::text)::text, true);

    -- Try to submit student B under Admin A context -> MUST FAIL
    BEGIN
        v_res := public.submit_requirement(ARRAY[v_student_b_id]);
        RAISE EXCEPTION 'SECURITY FAILURE: Admin A was able to submit an order with students from School B!';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM LIKE '%SECURITY FAILURE%' THEN
                RAISE;
            END IF;
            RAISE NOTICE 'SUCCESS: Cross-school submission blocked as expected: %', SQLERRM;
    END;

    -- Verify RLS: Admin A querying orders table must ONLY see School A orders
    SELECT id INTO v_order_b_id
    FROM public.orders
    WHERE school_id = v_school_b_id
    LIMIT 1;

    IF v_order_b_id IS NOT NULL THEN
        RAISE EXCEPTION 'SECURITY FAILURE: Admin A was able to SELECT an order from School B!';
    END IF;

    RAISE NOTICE 'SUCCESS: RLS is intact. Admin A cannot read orders belonging to School B.';
END $BODY$;
