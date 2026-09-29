-- =========================================================================
-- Migration: 20261029000000_fix_qc_completion_integrity.sql
-- Enforce strict Quality Check completion integrity:
-- 1. Correct existing inconsistent QC records where status = completed but checked_quantity < total_quantity
-- 2. Add DB CHECK constraint: status cannot be 'completed' or 'passed' unless checked_quantity = total_quantity and total_quantity > 0
-- 3. Update save_order_quality_check_items to enforce in_progress while any row is incomplete
-- 4. Update complete_order_quality_check to strictly validate all operational rows before setting completed
-- 5. Update start_quality_check to set status to in_progress
-- =========================================================================

-- 1. Correct any inconsistent rows currently in the database
UPDATE public.quality_check_records
SET status = 'in_progress'
WHERE status IN ('completed', 'passed')
  AND (
    checked_quantity = 0 
    OR checked_quantity < total_quantity 
    OR total_quantity = 0
  );

-- 2. Add strict database CHECK constraint
ALTER TABLE public.quality_check_records
    DROP CONSTRAINT IF EXISTS quality_check_records_completed_check;

ALTER TABLE public.quality_check_records
    ADD CONSTRAINT quality_check_records_completed_check
    CHECK (
        status NOT IN ('completed', 'passed')
        OR (total_quantity > 0 AND checked_quantity = total_quantity)
    );

-- 3. Update start_quality_check RPC
CREATE OR REPLACE FUNCTION public.start_quality_check(
    p_order_id UUID,
    p_remarks TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_user_id UUID;
    v_role TEXT;
    v_order_status TEXT;
    v_total_packed INTEGER := 0;
    v_existing_qc_id UUID;
    v_new_qc_id UUID;
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

    -- 2. Check Order
    SELECT status INTO v_order_status
    FROM public.orders
    WHERE id = p_order_id;

    IF v_order_status IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found');
    END IF;

    -- 3. Derive Authoritative Total Packed Quantity from Stage 8 (Packing)
    SELECT COALESCE(SUM(actual_quantity), 0)
    INTO v_total_packed
    FROM public.order_ironing_packing_items
    WHERE order_id = p_order_id
      AND stage_key = 'packing'
      AND actual_quantity > 0;

    -- Fallback if packing items not yet present
    IF v_total_packed = 0 THEN
        SELECT COALESCE(completed_quantity, 0)
        INTO v_total_packed
        FROM public.production_records
        WHERE order_id = p_order_id;
    END IF;

    -- 4. Check if QC record already exists
    SELECT id INTO v_existing_qc_id
    FROM public.quality_check_records
    WHERE order_id = p_order_id;

    IF v_existing_qc_id IS NOT NULL THEN
        UPDATE public.quality_check_records
        SET status = 'in_progress',
            started_at = COALESCE(started_at, now()),
            total_quantity = CASE WHEN v_total_packed > 0 THEN v_total_packed ELSE total_quantity END,
            remarks = COALESCE(p_remarks, remarks),
            checked_by = v_user_id,
            updated_at = now()
        WHERE id = v_existing_qc_id;

        v_new_qc_id := v_existing_qc_id;
    ELSE
        INSERT INTO public.quality_check_records (
            order_id,
            status,
            total_quantity,
            checked_quantity,
            passed_quantity,
            defective_quantity,
            remarks,
            started_at,
            checked_by
        ) VALUES (
            p_order_id,
            'in_progress',
            v_total_packed,
            0,
            0,
            0,
            p_remarks,
            now(),
            v_user_id
        )
        RETURNING id INTO v_new_qc_id;
    END IF;

    -- Update order status to quality_check while QC is in progress
    IF v_order_status IN ('production', 'packed') THEN
        UPDATE public.orders
        SET status = 'quality_check',
            updated_at = now()
        WHERE id = p_order_id;
    END IF;

    -- History entry
    INSERT INTO public.quality_check_history (
        quality_check_id,
        order_id,
        from_status,
        to_status,
        note,
        changed_by
    ) VALUES (
        v_new_qc_id,
        p_order_id,
        'pending',
        'in_progress',
        COALESCE(p_remarks, 'Quality check inspection started'),
        v_user_id
    );

    RETURN jsonb_build_object(
        'success', true,
        'qc_id', v_new_qc_id,
        'total_quantity', v_total_packed
    );
END;
$$;

-- 4. Update save_order_quality_check_items RPC
CREATE OR REPLACE FUNCTION public.save_order_quality_check_items(
    p_order_id UUID,
    p_items JSONB
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
    v_item JSONB;
    v_item_name TEXT;
    v_style_id UUID;
    v_style_name TEXT;
    v_color TEXT;
    v_size TEXT;
    v_remarks TEXT;
    v_passed_raw TEXT;
    v_passed_qty INTEGER;
    v_auth_packed_qty INTEGER;
    v_client_packed_qty INTEGER;
    v_defective_qty INTEGER;
    v_row_status TEXT;
    v_total_packed INTEGER := 0;
    v_checked_qty INTEGER := 0;
    v_passed_qty_sum INTEGER := 0;
    v_defective_qty_sum INTEGER := 0;
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

    -- 2. Process each item from client payload
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_item_name := trim(v_item->>'item_name');
        v_style_id := CASE 
            WHEN (v_item->>'style_id') IS NOT NULL AND trim(v_item->>'style_id') != '' 
            THEN (v_item->>'style_id')::UUID 
            ELSE NULL 
        END;
        v_style_name := NULLIF(trim(v_item->>'style_name'), '');
        v_color := NULLIF(trim(v_item->>'color'), '');
        v_size := trim(v_item->>'size');
        v_remarks := NULLIF(trim(v_item->>'remarks'), '');

        -- Query authoritative packed quantity from Stage 8 Packing
        SELECT COALESCE(actual_quantity, 0)
        INTO v_auth_packed_qty
        FROM public.order_ironing_packing_items
        WHERE order_id = p_order_id
          AND stage_key = 'packing'
          AND lower(trim(item_name)) = lower(v_item_name)
          AND COALESCE(NULLIF(trim(style_id::text), ''), 'no_style_id') = COALESCE(NULLIF(trim(v_style_id::text), ''), 'no_style_id')
          AND COALESCE(NULLIF(lower(trim(style_name)), ''), 'no_style_name') = COALESCE(NULLIF(lower(trim(v_style_name)), ''), 'no_style_name')
          AND COALESCE(NULLIF(lower(trim(color)), ''), 'no_color') = COALESCE(NULLIF(lower(trim(v_color)), ''), 'no_color')
          AND lower(trim(size)) = lower(v_size)
        LIMIT 1;

        -- Fallback to client packed_quantity only if not found in Stage 8 packing
        IF v_auth_packed_qty IS NULL OR v_auth_packed_qty = 0 THEN
            v_client_packed_qty := (v_item->>'packed_quantity')::INTEGER;
            v_auth_packed_qty := COALESCE(v_client_packed_qty, 0);
        END IF;

        -- Extract passed quantity
        v_passed_raw := v_item->>'passed_quantity';

        IF v_passed_raw IS NOT NULL AND trim(v_passed_raw) != '' THEN
            v_passed_qty := v_passed_raw::INTEGER;

            IF v_passed_qty < 0 THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'error', format('Passed quantity cannot be negative for %s Size %s.', v_item_name, v_size)
                );
            END IF;

            IF v_passed_qty > v_auth_packed_qty THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'error', format('Passed quantity (%s) cannot exceed Packed quantity (%s) for %s Size %s.', v_passed_qty, v_auth_packed_qty, v_item_name, v_size)
                );
            END IF;

            -- Auto calculate defective
            v_defective_qty := v_auth_packed_qty - v_passed_qty;

            IF v_passed_qty = v_auth_packed_qty THEN
                v_row_status := 'passed';
            ELSIF v_passed_qty = 0 THEN
                v_row_status := 'defective';
            ELSE
                v_row_status := 'partial';
            END IF;
        ELSE
            -- Missing / Not Entered (Pending)
            v_passed_qty := NULL;
            v_defective_qty := 0;
            v_row_status := 'pending';
        END IF;

        -- Upsert record into order_quality_check_items
        INSERT INTO public.order_quality_check_items (
            order_id,
            item_name,
            style_id,
            style_name,
            color,
            size,
            packed_quantity,
            passed_quantity,
            defective_quantity,
            remarks,
            status,
            updated_at
        ) VALUES (
            p_order_id,
            v_item_name,
            v_style_id,
            v_style_name,
            v_color,
            v_size,
            v_auth_packed_qty,
            v_passed_qty,
            v_defective_qty,
            v_remarks,
            v_row_status,
            now()
        )
        ON CONFLICT (
            order_id,
            lower(trim(item_name)),
            COALESCE(NULLIF(trim(style_id::text), ''), 'no_style_id'),
            COALESCE(NULLIF(lower(trim(style_name)), ''), 'no_style_name'),
            COALESCE(NULLIF(lower(trim(color)), ''), 'no_color'),
            lower(trim(size))
        )
        DO UPDATE SET
            packed_quantity = EXCLUDED.packed_quantity,
            passed_quantity = EXCLUDED.passed_quantity,
            defective_quantity = EXCLUDED.defective_quantity,
            remarks = COALESCE(EXCLUDED.remarks, public.order_quality_check_items.remarks),
            status = EXCLUDED.status,
            updated_at = now();
    END LOOP;

    -- 3. Calculate accurate aggregates across all operational items
    SELECT 
        COALESCE(SUM(packed_quantity), 0),
        COALESCE(SUM(CASE WHEN passed_quantity IS NOT NULL THEN packed_quantity ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN passed_quantity IS NOT NULL THEN passed_quantity ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN passed_quantity IS NOT NULL THEN defective_quantity ELSE 0 END), 0)
    INTO 
        v_total_packed,
        v_checked_qty,
        v_passed_qty_sum,
        v_defective_qty_sum
    FROM public.order_quality_check_items
    WHERE order_id = p_order_id;

    -- Ensure quality_check_records entry exists and strictly enforces in_progress unless truly completed
    SELECT id INTO v_qc_id FROM public.quality_check_records WHERE order_id = p_order_id;
    IF v_qc_id IS NOT NULL THEN
        UPDATE public.quality_check_records
        SET total_quantity = v_total_packed,
            checked_quantity = v_checked_qty,
            passed_quantity = v_passed_qty_sum,
            defective_quantity = v_defective_qty_sum,
            status = CASE 
                WHEN v_total_packed > 0 AND v_checked_qty = v_total_packed AND status IN ('completed', 'passed') THEN 'completed'
                ELSE 'in_progress'
            END,
            updated_at = now()
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
            checked_by
        ) VALUES (
            p_order_id,
            'in_progress',
            v_total_packed,
            v_checked_qty,
            v_passed_qty_sum,
            v_defective_qty_sum,
            now(),
            v_user_id
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'total_quantity', v_total_packed,
        'checked_quantity', v_checked_qty,
        'passed_quantity', v_passed_qty_sum,
        'defective_quantity', v_defective_qty_sum
    );
END;
$$;
