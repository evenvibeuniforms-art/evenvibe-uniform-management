-- =========================================================================
-- Migration: 20261031000000_update_delivery_workflow_rpcs.sql
-- Description: Streamline Delivery module workflow:
-- 1. Create start_delivery RPC (requires QC completed, QC passed qty > 0)
-- 2. Create save_delivery_details RPC (saves courier, tracking, est delivery, remarks)
-- 3. Update dispatch_order RPC to allow dispatching directly from in_progress delivery
-- 4. Update mark_order_delivered RPC to allow marking delivered from dispatched/in_transit
-- =========================================================================

-- 1. start_delivery RPC
CREATE OR REPLACE FUNCTION public.start_delivery(
    p_order_id UUID,
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
    v_order_status TEXT;
    v_qc_status TEXT;
    v_qc_passed_qty INTEGER := 0;
    v_qc_total_qty INTEGER := 0;
    v_total_deliverable_qty INTEGER := 0;
    v_existing_packing_id UUID;
    v_new_packing_id UUID;
    v_now TIMESTAMPTZ := now();
BEGIN
    -- 1. Verify Authentication & Role
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
    END IF;

    SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
    IF v_role != 'evenvibe_admin' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized. EvenVibe Admin required.');
    END IF;

    -- 2. Lock & Fetch Order
    SELECT status INTO v_order_status
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF v_order_status IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found');
    END IF;

    -- 3. Check for existing delivery/packing record
    SELECT id INTO v_existing_packing_id
    FROM public.packing_records
    WHERE order_id = p_order_id;

    IF v_existing_packing_id IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Delivery preparation has already been started for this order.');
    END IF;

    -- 4. Verify Authoritative QC Status from quality_check_records
    SELECT status, COALESCE(passed_quantity, 0), COALESCE(total_quantity, 0)
    INTO v_qc_status, v_qc_passed_qty, v_qc_total_qty
    FROM public.quality_check_records
    WHERE order_id = p_order_id;

    IF v_qc_status IS NULL OR v_qc_status NOT IN ('completed', 'passed') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Complete Quality Check before starting delivery.');
    END IF;

    -- 5. Derive Authoritative Deliverable Quantity strictly from QC Passed Quantity
    v_total_deliverable_qty := v_qc_passed_qty;

    IF v_total_deliverable_qty = 0 THEN
        SELECT COALESCE(SUM(passed_quantity), 0)
        INTO v_total_deliverable_qty
        FROM public.order_quality_check_items
        WHERE order_id = p_order_id
          AND passed_quantity > 0;
    END IF;

    IF v_total_deliverable_qty = 0 THEN
        v_total_deliverable_qty := v_qc_total_qty;
    END IF;

    IF v_total_deliverable_qty <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'No approved pieces are available for delivery.');
    END IF;

    -- 6. Ensure order status is at least packed
    IF v_order_status IN ('production', 'quality_check') THEN
        UPDATE public.orders
        SET status = 'packed',
            updated_at = v_now
        WHERE id = p_order_id;
    END IF;

    -- 7. Insert delivery record into packing_records
    INSERT INTO public.packing_records (
        order_id,
        status,
        total_quantity,
        packed_quantity,
        remarks,
        started_at,
        packed_by
    ) VALUES (
        p_order_id,
        'in_progress',
        v_total_deliverable_qty,
        v_total_deliverable_qty,
        p_remarks,
        v_now,
        v_user_id
    )
    RETURNING id INTO v_new_packing_id;

    -- 8. Insert history entry
    INSERT INTO public.packing_history (
        packing_record_id,
        order_id,
        from_status,
        to_status,
        note,
        changed_by
    ) VALUES (
        v_new_packing_id,
        p_order_id,
        'pending',
        'in_progress',
        COALESCE(p_remarks, 'Delivery preparation started by Admin'),
        v_user_id
    );

    RETURN jsonb_build_object(
        'success', true,
        'delivery_id', v_new_packing_id,
        'total_quantity', v_total_deliverable_qty
    );
END;
$$;

-- 2. save_delivery_details RPC
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
    v_packing_id UUID;
    v_now TIMESTAMPTZ := now();
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
    END IF;

    SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
    IF v_role != 'evenvibe_admin' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized. EvenVibe Admin required.');
    END IF;

    -- Update Order Courier Details
    UPDATE public.orders
    SET courier_name = NULLIF(trim(p_courier_name), ''),
        tracking_number = NULLIF(trim(p_tracking_number), ''),
        estimated_delivery = p_estimated_delivery,
        updated_at = v_now
    WHERE id = p_order_id;

    -- Update packing record remarks if exists
    SELECT id INTO v_packing_id FROM public.packing_records WHERE order_id = p_order_id;
    IF v_packing_id IS NOT NULL AND p_remarks IS NOT NULL THEN
        UPDATE public.packing_records
        SET remarks = NULLIF(trim(p_remarks), ''),
            updated_at = v_now
        WHERE id = v_packing_id;
    END IF;

    -- Insert history entry if changes were made
    IF v_packing_id IS NOT NULL THEN
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
            'in_progress',
            'in_progress',
            'Delivery details updated: ' || COALESCE(NULLIF(trim(p_courier_name), ''), 'No courier') || ' | ' || COALESCE(NULLIF(trim(p_tracking_number), ''), 'No tracking'),
            v_user_id
        );
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- 3. Update dispatch_order RPC to streamline delivery
CREATE OR REPLACE FUNCTION public.dispatch_order(
    p_order_id UUID,
    p_courier_name TEXT DEFAULT NULL,
    p_tracking_number TEXT DEFAULT NULL,
    p_estimated_delivery DATE DEFAULT NULL
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
        -- Auto-start delivery if not started yet
        INSERT INTO public.packing_records (
            order_id,
            status,
            total_quantity,
            packed_quantity,
            started_at,
            packed_by
        ) VALUES (
            p_order_id,
            'completed',
            1,
            1,
            v_now,
            v_user_id
        )
        RETURNING id INTO v_packing_id;
    ELSE
        UPDATE public.packing_records
        SET status = 'completed',
            completed_at = v_now,
            updated_at = v_now
        WHERE id = v_packing_id;
    END IF;

    -- 4. Update Order to 'dispatched'
    UPDATE public.orders
    SET status = 'dispatched',
        courier_name = COALESCE(NULLIF(trim(p_courier_name), ''), courier_name),
        tracking_number = COALESCE(NULLIF(trim(p_tracking_number), ''), tracking_number),
        estimated_delivery = COALESCE(p_estimated_delivery, estimated_delivery),
        shipped_at = COALESCE(shipped_at, v_now),
        updated_at = v_now
    WHERE id = p_order_id;

    v_note := format('Dispatched via %s (Tracking: %s, Est. Delivery: %s)',
        COALESCE(NULLIF(trim(p_courier_name), ''), 'Partner'),
        COALESCE(NULLIF(trim(p_tracking_number), ''), 'N/A'),
        COALESCE(to_char(p_estimated_delivery, 'YYYY-MM-DD'), 'N/A')
    );

    -- 5. Insert History
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
        COALESCE(v_packing_status, 'in_progress'),
        'dispatched',
        v_note,
        v_user_id
    );

    RETURN jsonb_build_object(
        'success', true,
        'status', 'dispatched'
    );
END;
$$;

-- 4. Update mark_order_delivered RPC to allow marking delivered from dispatched or in_transit
CREATE OR REPLACE FUNCTION public.mark_order_delivered(
    p_order_id UUID,
    p_note TEXT DEFAULT NULL
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
    v_hist_note TEXT;
    v_now TIMESTAMPTZ := now();
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

    IF v_order_status NOT IN ('dispatched', 'in_transit', 'packed') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order must be dispatched or in transit before marking delivered. Current status: ' || v_order_status);
    END IF;

    -- 2. Update Order to 'delivered'
    UPDATE public.orders
    SET status = 'delivered',
        delivered_at = v_now,
        updated_at = v_now
    WHERE id = p_order_id;

    v_hist_note := COALESCE(p_note, 'Consignment delivered to school premises');

    -- 3. Insert Order Status History
    INSERT INTO public.order_status_history (
        order_id,
        status,
        note
    ) VALUES (
        p_order_id,
        'delivered',
        v_hist_note
    );

    SELECT id INTO v_packing_id FROM public.packing_records WHERE order_id = p_order_id;
    IF v_packing_id IS NOT NULL THEN
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
            'dispatched',
            'delivered',
            v_hist_note,
            v_user_id
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'status', 'delivered'
    );
END;
$$;
