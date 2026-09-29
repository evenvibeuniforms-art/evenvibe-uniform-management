-- Ensure complete_order_quality_check function has v_old_status
CREATE OR REPLACE FUNCTION public.complete_order_quality_check(
    p_order_id UUID,
    p_items JSONB DEFAULT NULL,
    p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_user_id UUID;
    v_role TEXT;
    v_qc_id UUID;
    v_old_status TEXT := 'in_progress';
    v_total_operational INTEGER := 0;
    v_missing_count INTEGER := 0;
    v_invalid_count INTEGER := 0;
    v_total_packed INTEGER := 0;
    v_passed_qty_sum INTEGER := 0;
    v_defective_qty_sum INTEGER := 0;
    v_checked_qty INTEGER := 0;
    v_save_result JSONB;
    v_now TIMESTAMPTZ := now();
BEGIN
    -- 1. Authentication & Role check
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
    END IF;

    SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
    IF v_role != 'evenvibe_admin' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized. EvenVibe Admin required.');
    END IF;

    -- 2. If items payload provided, persist items FIRST in the same transaction
    IF p_items IS NOT NULL AND jsonb_typeof(p_items) = 'array' AND jsonb_array_length(p_items) > 0 THEN
        v_save_result := public.save_order_quality_check_items(p_order_id, p_items);
        IF (v_save_result->>'success')::BOOLEAN IS NOT TRUE THEN
            RETURN v_save_result;
        END IF;
    END IF;

    -- 3. Verify Operational Rows from Stage 8 (Packing)
    SELECT COUNT(*)
    INTO v_total_operational
    FROM public.order_ironing_packing_items
    WHERE order_id = p_order_id
      AND stage_key = 'packing'
      AND actual_quantity > 0;

    IF v_total_operational = 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'No pieces are available for Quality Check.'
        );
    END IF;

    -- 4. Check if any operational packing row is missing from QC or has NULL passed_quantity
    SELECT COUNT(*)
    INTO v_missing_count
    FROM public.order_ironing_packing_items pack
    LEFT JOIN public.order_quality_check_items qc ON (
        qc.order_id = p_order_id
        AND lower(trim(qc.item_name)) = lower(trim(pack.item_name))
        AND COALESCE(NULLIF(trim(qc.style_id::text), ''), 'no_style_id') = COALESCE(NULLIF(trim(pack.style_id::text), ''), 'no_style_id')
        AND COALESCE(NULLIF(lower(trim(qc.style_name)), ''), 'no_style_name') = COALESCE(NULLIF(lower(trim(pack.style_name)), ''), 'no_style_name')
        AND COALESCE(NULLIF(lower(trim(qc.color)), ''), 'no_color') = COALESCE(NULLIF(lower(trim(pack.color)), ''), 'no_color')
        AND lower(trim(qc.size)) = lower(trim(pack.size))
    )
    WHERE pack.order_id = p_order_id
      AND pack.stage_key = 'packing'
      AND pack.actual_quantity > 0
      AND (qc.id IS NULL OR qc.passed_quantity IS NULL);

    IF v_missing_count > 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Please enter Passed Quantity for all sizes before completing Quality Check.'
        );
    END IF;

    -- 5. Check for invalid quantities: passed < 0 or passed > packed
    SELECT COUNT(*)
    INTO v_invalid_count
    FROM public.order_ironing_packing_items pack
    JOIN public.order_quality_check_items qc ON (
        qc.order_id = p_order_id
        AND lower(trim(qc.item_name)) = lower(trim(pack.item_name))
        AND COALESCE(NULLIF(trim(qc.style_id::text), ''), 'no_style_id') = COALESCE(NULLIF(trim(pack.style_id::text), ''), 'no_style_id')
        AND COALESCE(NULLIF(lower(trim(qc.style_name)), ''), 'no_style_name') = COALESCE(NULLIF(lower(trim(pack.style_name)), ''), 'no_style_name')
        AND COALESCE(NULLIF(lower(trim(qc.color)), ''), 'no_color') = COALESCE(NULLIF(lower(trim(pack.color)), ''), 'no_color')
        AND lower(trim(qc.size)) = lower(trim(pack.size))
    )
    WHERE pack.order_id = p_order_id
      AND pack.stage_key = 'packing'
      AND pack.actual_quantity > 0
      AND (
          qc.passed_quantity < 0
          OR qc.passed_quantity > pack.actual_quantity
      );

    IF v_invalid_count > 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Passed Quantity cannot be greater than Packed Quantity.'
        );
    END IF;

    -- 6. Calculate authoritative final sums
    SELECT 
        COALESCE(SUM(packed_quantity), 0),
        COALESCE(SUM(passed_quantity), 0),
        COALESCE(SUM(defective_quantity), 0)
    INTO 
        v_total_packed,
        v_passed_qty_sum,
        v_defective_qty_sum
    FROM public.order_quality_check_items
    WHERE order_id = p_order_id;

    v_checked_qty := v_total_packed;

    -- 7. Update quality_check_records
    SELECT id, status INTO v_qc_id, v_old_status FROM public.quality_check_records WHERE order_id = p_order_id;

    IF v_qc_id IS NOT NULL THEN
        UPDATE public.quality_check_records
        SET status = 'completed',
            total_quantity = v_total_packed,
            checked_quantity = v_checked_qty,
            passed_quantity = v_passed_qty_sum,
            defective_quantity = v_defective_qty_sum,
            completed_at = v_now,
            remarks = COALESCE(p_note, remarks),
            updated_at = v_now
        WHERE id = v_qc_id;
    ELSE
        INSERT INTO public.quality_check_records (
            order_id,
            status,
            total_quantity,
            checked_quantity,
            passed_quantity,
            defective_quantity,
            started_at,
            completed_at,
            remarks,
            checked_by
        ) VALUES (
            p_order_id,
            'completed',
            v_total_packed,
            v_checked_qty,
            v_passed_qty_sum,
            v_defective_qty_sum,
            v_now,
            v_now,
            p_note,
            v_user_id
        )
        RETURNING id INTO v_qc_id;
    END IF;

    -- 8. Ensure Order is ready for Packing & Delivery
    UPDATE public.orders
    SET status = 'packed',
        updated_at = v_now
    WHERE id = p_order_id;

    -- 9. Insert Quality Check History with valid 'completed' status
    INSERT INTO public.quality_check_history (
        quality_check_id,
        order_id,
        from_status,
        to_status,
        note,
        changed_by
    ) VALUES (
        v_qc_id,
        p_order_id,
        COALESCE(v_old_status, 'in_progress'),
        'completed',
        COALESCE(p_note, format('Quality check completed. %s passed, %s defective out of %s total units.', v_passed_qty_sum, v_defective_qty_sum, v_total_packed)),
        v_user_id
    );

    RETURN jsonb_build_object(
        'success', true,
        'status', 'completed',
        'total_quantity', v_total_packed,
        'checked_quantity', v_checked_qty,
        'passed_quantity', v_passed_qty_sum,
        'defective_quantity', v_defective_qty_sum
    );
END;
$$;
