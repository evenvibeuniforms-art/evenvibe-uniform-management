DO $BODY$
DECLARE
    v_order_c_id UUID;
    v_req_c_id UUID;
BEGIN
    DELETE FROM public.orders WHERE order_number = 'EV-ORD-TEST-C';
    DELETE FROM public.requirements WHERE requirement_number = 'EV-REQ-TEST-C';

    INSERT INTO public.requirements (requirement_number, school_id, status, total_students)
    VALUES ('EV-REQ-TEST-C', 'ec375e0e-1e7d-41f4-a089-1eb0fb23365a', 'submitted', 40)
    RETURNING id INTO v_req_c_id;

    INSERT INTO public.requirement_items (requirement_id, item_name, size, quantity)
    VALUES (v_req_c_id, 'T-Shirt', '30', 40);

    INSERT INTO public.orders (order_number, school_id, requirement_id, status)
    VALUES ('EV-ORD-TEST-C', 'ec375e0e-1e7d-41f4-a089-1eb0fb23365a', v_req_c_id, 'confirmed')
    RETURNING id INTO v_order_c_id;
END $BODY$;
