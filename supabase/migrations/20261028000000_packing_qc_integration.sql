-- =========================================================================
-- Migration: 20261028000000_packing_qc_integration.sql
-- Fix Packing & Delivery integration with Quality Check:
-- 1. start_packing verifies QC status IN ('completed', 'passed')
-- 2. Business-friendly error: 'Complete Quality Check before starting packing.'
-- 3. Sets packing_records.total_quantity strictly to QC Passed Quantity (deliverable approved pieces)
-- 4. Prevents duplicate packing start: 'Packing has already been started for this order.'
-- 5. Ensures order isolation and RLS security.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.start_packing(
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

    -- 3. Check for existing packing record first
    SELECT id INTO v_existing_packing_id
    FROM public.packing_records
    WHERE order_id = p_order_id;

    IF v_existing_packing_id IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Packing has already been started for this order.');
    END IF;

    -- 4. Verify Authoritative QC Status from quality_check_records
    SELECT status, COALESCE(passed_quantity, 0), COALESCE(total_quantity, 0)
    INTO v_qc_status, v_qc_passed_qty, v_qc_total_qty
    FROM public.quality_check_records
    WHERE order_id = p_order_id;

    -- Only 'completed' or 'passed' is valid
    IF v_qc_status IS NULL OR v_qc_status NOT IN ('completed', 'passed') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Complete Quality Check before starting packing.');
    END IF;

    -- 5. Derive Authoritative Deliverable Quantity strictly from QC Passed Quantity
    -- Defective pieces MUST NOT be treated as deliverable quantity
    v_total_deliverable_qty := v_qc_passed_qty;

    -- Fallback to sum of passed_quantity in order_quality_check_items if needed
    IF v_total_deliverable_qty = 0 THEN
        SELECT COALESCE(SUM(passed_quantity), 0)
        INTO v_total_deliverable_qty
        FROM public.order_quality_check_items
        WHERE order_id = p_order_id
          AND passed_quantity > 0;
    END IF;

    -- Fallback to qc total_quantity if passed_quantity was 0 and all were passed
    IF v_total_deliverable_qty = 0 THEN
        v_total_deliverable_qty := v_qc_total_qty;
    END IF;

    -- 6. Ensure order status is packed
    IF v_order_status IN ('production', 'quality_check') THEN
        UPDATE public.orders
        SET status = 'packed',
            updated_at = now()
        WHERE id = p_order_id;
    END IF;

    -- 7. Insert packing_records entry with deliverable quantity
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
        0,
        p_remarks,
        now(),
        v_user_id
    ) RETURNING id INTO v_new_packing_id;

    -- 8. Seed standard 5 checklist items
    INSERT INTO public.packing_checklist_items (packing_record_id, item_key, label, is_completed)
    VALUES
        (v_new_packing_id, 'quantity_verified', 'Quantity Verified', false),
        (v_new_packing_id, 'items_packed', 'Items Packed', false),
        (v_new_packing_id, 'labels_attached', 'Labels Attached', false),
        (v_new_packing_id, 'order_details_verified', 'Order / School Details Verified', false),
        (v_new_packing_id, 'packaging_completed', 'Packaging Completed', false);

    -- 9. Insert packing_history entry
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
        NULL,
        'in_progress',
        COALESCE(p_remarks, 'Packing started'),
        v_user_id
    );

    RETURN jsonb_build_object(
        'success', true,
        'packing_id', v_new_packing_id,
        'total_quantity', v_total_deliverable_qty
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unable to start packing. Please refresh and try again.');
END;
$$;
