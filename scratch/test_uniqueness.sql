DO $BODY$
DECLARE
    v_order_number TEXT;
    v_school_id UUID;
    v_req_id UUID;
BEGIN
    SELECT order_number, school_id, requirement_id INTO v_order_number, v_school_id, v_req_id
    FROM public.orders
    LIMIT 1;

    -- Attempt to insert duplicate order_number -> MUST FAIL
    BEGIN
        INSERT INTO public.orders (order_number, school_id, requirement_id, status)
        VALUES (v_order_number, v_school_id, v_req_id, 'submitted');
        RAISE EXCEPTION 'FAILURE: Duplicate order_number was allowed!';
    EXCEPTION
        WHEN unique_violation THEN
            RAISE NOTICE 'SUCCESS: Duplicate order_number blocked by unique constraint.';
    END;
END $BODY$;
