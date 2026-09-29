-- Migration: 20261102000000_estimated_delivery_date_validation.sql
-- Goal: Server-side validation for estimated_delivery date in save_delivery_details and dispatch_order

-- 1. Update save_delivery_details RPC with date validation
CREATE OR REPLACE FUNCTION public.save_delivery_details(
    p_order_id UUID,
    p_courier_name TEXT DEFAULT NULL,
    p_tracking_number TEXT DEFAULT NULL,
    p_estimated_delivery DATE DEFAULT NULL,
    p_remarks TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_role TEXT;
    v_user_id UUID;
    v_now TIMESTAMPTZ := now();
    v_today DATE := (now() AT TIME ZONE 'Asia/Kolkata')::DATE;
    v_existing_date DATE;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
    END IF;

    SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
    IF v_role != 'evenvibe_admin' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized. EvenVibe Admin required.');
    END IF;

    -- Validate estimated delivery date cannot be earlier than today (Asia/Kolkata)
    IF p_estimated_delivery IS NOT NULL THEN
        IF p_estimated_delivery < v_today THEN
            SELECT estimated_delivery INTO v_existing_date
            FROM public.orders
            WHERE id = p_order_id;

            IF v_existing_date IS DISTINCT FROM p_estimated_delivery THEN
                RETURN jsonb_build_object('success', false, 'error', 'Estimated delivery date cannot be earlier than today.');
            END IF;
        END IF;
    END IF;

    -- Update Order Courier Details
    UPDATE public.orders
    SET courier_name = NULLIF(trim(p_courier_name), ''),
        tracking_number = NULLIF(trim(p_tracking_number), ''),
        estimated_delivery = p_estimated_delivery,
        updated_at = v_now
    WHERE id = p_order_id;

    -- Update Packing Record remarks if exists
    UPDATE public.packing_records
    SET remarks = NULLIF(trim(p_remarks), ''),
        updated_at = v_now
    WHERE order_id = p_order_id;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- 2. Update dispatch_order RPC with date validation
CREATE OR REPLACE FUNCTION public.dispatch_order(
    p_order_id UUID,
    p_courier_name TEXT DEFAULT NULL,
    p_tracking_number TEXT DEFAULT NULL,
    p_estimated_delivery TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_role TEXT;
    v_user_id UUID;
    v_order_status TEXT;
    v_packing_id UUID;
    v_packing_status TEXT;
    v_qc_status TEXT;
    v_note TEXT;
    v_now TIMESTAMPTZ := now();
    v_today DATE := (now() AT TIME ZONE 'Asia/Kolkata')::DATE;
    v_parsed_date DATE := NULL;
    v_existing_date DATE;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
    END IF;

    SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
    IF v_role != 'evenvibe_admin' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized. EvenVibe Admin required.');
    END IF;

    -- 1. Lock & Fetch Order
    SELECT status INTO v_order_status
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF v_order_status IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found');
    END IF;

    -- 2. Verify QC is completed
    SELECT status INTO v_qc_status
    FROM public.quality_check_records
    WHERE order_id = p_order_id;

    IF v_qc_status IS NULL OR v_qc_status NOT IN ('completed', 'passed') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Complete Quality Check before dispatching order.');
    END IF;

    -- 3. Verify delivery has been started
    SELECT id, status INTO v_packing_id, v_packing_status
    FROM public.packing_records
    WHERE order_id = p_order_id
    FOR UPDATE;

    IF v_packing_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Delivery must be started before dispatching.');
    END IF;

    -- 4. Validate estimated delivery date
    IF p_estimated_delivery IS NOT NULL AND trim(p_estimated_delivery) != '' THEN
        BEGIN
            v_parsed_date := trim(p_estimated_delivery)::DATE;
        EXCEPTION WHEN OTHERS THEN
            RETURN jsonb_build_object('success', false, 'error', 'Estimated delivery must be a valid date (YYYY-MM-DD)');
        END;

        IF v_parsed_date < v_today THEN
            SELECT estimated_delivery INTO v_existing_date
            FROM public.orders
            WHERE id = p_order_id;

            IF v_existing_date IS DISTINCT FROM v_parsed_date THEN
                RETURN jsonb_build_object('success', false, 'error', 'Estimated delivery date cannot be earlier than today.');
            END IF;
        END IF;
    END IF;

    -- 5. Update Order status
    UPDATE public.orders
    SET status = 'dispatched',
        shipped_at = v_now,
        courier_name = COALESCE(NULLIF(trim(p_courier_name), ''), courier_name),
        tracking_number = COALESCE(NULLIF(trim(p_tracking_number), ''), tracking_number),
        estimated_delivery = COALESCE(v_parsed_date, estimated_delivery),
        updated_at = v_now
    WHERE id = p_order_id;

    -- 6. Update Packing Record
    UPDATE public.packing_records
    SET status = 'completed',
        completed_at = v_now,
        updated_at = v_now
    WHERE id = v_packing_id;

    -- 7. Insert History
    v_note := 'Shipment dispatched' || 
              CASE WHEN p_courier_name IS NOT NULL AND trim(p_courier_name) != '' 
                   THEN ' via ' || trim(p_courier_name) ELSE '' END ||
              CASE WHEN p_tracking_number IS NOT NULL AND trim(p_tracking_number) != '' 
                   THEN ' (Tracking: ' || trim(p_tracking_number) || ')' ELSE '' END;

    INSERT INTO public.order_status_history (
        order_id,
        status,
        note
    ) VALUES (
        p_order_id,
        'dispatched',
        v_note
    );

    INSERT INTO public.packing_history (
        packing_record_id,
        order_id,
        from_status,
        to_status,
        note,
        changed_by
    ) VALUES (
        v_packing_id,
        p_order_id,
        v_packing_status,
        'dispatched',
        v_note,
        v_user_id
    );

    RETURN jsonb_build_object(
        'success', true,
        'status', 'dispatched',
        'courier_name', p_courier_name,
        'tracking_number', p_tracking_number,
        'estimated_delivery', v_parsed_date,
        'shipped_at', v_now
    );
END;
$$;
