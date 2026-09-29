DO $BODY$
DECLARE
    v_order_id UUID;
    v_school_admin_id UUID := '785aef6d-5396-46d4-bc9b-2e307eaefad2'; -- School Admin
    v_res JSONB;
BEGIN
    SELECT id INTO v_order_id FROM public.orders WHERE order_number = 'EV-ORD-TEST-A';

    -- Set context to school admin
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_school_admin_id::text)::text, true);

    v_res := public.save_order_production_workflow(
        v_order_id,
        ARRAY['stock_sizes', 'inventory', 'cutting', 'stitching', 'printing', 'embroidering', 'ironing_packing', 'checking']
    );

    IF (v_res->>'success')::boolean IS TRUE THEN
        RAISE EXCEPTION 'SECURITY BREACH: School Admin was able to save workflow!';
    END IF;

    IF (v_res->>'error') NOT LIKE '%Unauthorized%' AND (v_res->>'error') NOT LIKE '%EvenVibe Admin required%' THEN
        RAISE EXCEPTION 'Expected Unauthorized error, got: %', v_res->>'error';
    END IF;

    RAISE NOTICE 'School Admin blocked successfully: %', v_res->>'error';
END $BODY$;
