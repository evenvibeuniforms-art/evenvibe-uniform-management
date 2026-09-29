-- Migration: 20261027000000_order_quality_check_items.sql
-- Description: Implement item-level Quality Check module consuming final Packing Output.
-- 1. Creates public.order_quality_check_items table with unique constraints and RLS.
-- 2. Updates quality_check_records status constraint to support 'completed'.
-- 3. Updates start_quality_check RPC to derive total_quantity from authoritative Packing Output.
-- 4. Implements save_order_quality_check_items RPC with server-calculated Defective Quantity (Packed - Passed).
-- 5. Implements complete_order_quality_check RPC validating all operational rows are inspected before completion.

BEGIN;

-- =========================================================================
-- 1. Table: public.order_quality_check_items
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.order_quality_check_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    item_name TEXT NOT NULL,
    style_id UUID REFERENCES public.uniform_styles(id) ON DELETE SET NULL,
    style_name TEXT NULL,
    color TEXT NULL,
    size TEXT NOT NULL,
    packed_quantity INTEGER NOT NULL CHECK (packed_quantity >= 0),
    passed_quantity INTEGER NULL CHECK (passed_quantity IS NULL OR passed_quantity >= 0),
    defective_quantity INTEGER NOT NULL DEFAULT 0 CHECK (defective_quantity >= 0),
    remarks TEXT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'passed', 'defective', 'partial', 'complete', 'invalid')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_qc_item_quantities CHECK (
        passed_quantity IS NULL 
        OR (
            passed_quantity <= packed_quantity 
            AND (passed_quantity + defective_quantity = packed_quantity)
        )
    )
);

-- Unique index to guarantee 1 entry per order + item + style + color + size
CREATE UNIQUE INDEX IF NOT EXISTS idx_order_quality_check_items_unique ON public.order_quality_check_items (
    order_id,
    lower(trim(item_name)),
    COALESCE(NULLIF(trim(style_id::text), ''), 'no_style_id'),
    COALESCE(NULLIF(lower(trim(style_name)), ''), 'no_style_name'),
    COALESCE(NULLIF(lower(trim(color)), ''), 'no_color'),
    lower(trim(size))
);

CREATE INDEX IF NOT EXISTS idx_order_quality_check_items_order_id 
    ON public.order_quality_check_items(order_id);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_order_quality_check_items_modtime ON public.order_quality_check_items;
CREATE TRIGGER update_order_quality_check_items_modtime
    BEFORE UPDATE ON public.order_quality_check_items
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- RLS
ALTER TABLE public.order_quality_check_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage order quality check items" ON public.order_quality_check_items;
CREATE POLICY "Admins can manage order quality check items"
    ON public.order_quality_check_items FOR ALL
    USING (public.get_my_role() = 'evenvibe_admin')
    WITH CHECK (public.get_my_role() = 'evenvibe_admin');

DROP POLICY IF EXISTS "School Admins can view own order quality check items" ON public.order_quality_check_items;
CREATE POLICY "School Admins can view own order quality check items"
    ON public.order_quality_check_items
    FOR SELECT
    USING (
        order_id IN (
            SELECT id FROM public.orders WHERE school_id = public.get_my_school_id()
        )
        AND public.get_my_role() = 'school_admin'
    );

-- Grant privileges
GRANT ALL ON public.order_quality_check_items TO authenticated;
GRANT ALL ON public.order_quality_check_items TO service_role;

-- =========================================================================
-- 2. Update quality_check_records status check constraint
-- =========================================================================
ALTER TABLE public.quality_check_records 
    DROP CONSTRAINT IF EXISTS quality_check_records_status_check;

ALTER TABLE public.quality_check_records 
    ADD CONSTRAINT quality_check_records_status_check 
    CHECK (status IN ('pending', 'in_progress', 'passed', 'failed', 'completed'));

-- =========================================================================
-- 3. RPC: start_quality_check
-- =========================================================================
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

    -- Update order status to quality_check if not already advanced
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

-- =========================================================================
-- 4. RPC: save_order_quality_check_items
-- =========================================================================
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

    -- 2. Process each QC item
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_item_name := trim(v_item->>'item_name');
        v_style_id := NULLIF(trim(v_item->>'style_id'), '')::UUID;
        v_style_name := NULLIF(trim(v_item->>'style_name'), '');
        v_color := NULLIF(trim(v_item->>'color'), '');
        v_size := trim(v_item->>'size');
        v_remarks := NULLIF(trim(v_item->>'remarks'), '');

        IF v_item_name IS NULL OR v_item_name = '' OR v_size IS NULL OR v_size = '' THEN
            RETURN jsonb_build_object('success', false, 'error', 'Item name and size are required for all rows.');
        END IF;

        -- Derive Authoritative Input from Stage 8 Packing Output
        SELECT actual_quantity INTO v_auth_packed_qty
        FROM public.order_ironing_packing_items
        WHERE order_id = p_order_id
          AND stage_key = 'packing'
          AND lower(trim(item_name)) = lower(v_item_name)
          AND COALESCE(NULLIF(trim(style_id::text), ''), 'no_style_id') = COALESCE(NULLIF(trim(v_style_id::text), ''), 'no_style_id')
          AND COALESCE(NULLIF(lower(trim(style_name)), ''), 'no_style_name') = COALESCE(NULLIF(lower(trim(v_style_name)), ''), 'no_style_name')
          AND COALESCE(NULLIF(lower(trim(color)), ''), 'no_color') = COALESCE(NULLIF(lower(trim(v_color)), ''), 'no_color')
          AND lower(trim(size)) = lower(v_size);

        IF v_auth_packed_qty IS NULL THEN
            RETURN jsonb_build_object(
                'success', false, 
                'error', format('No Packing record found for %s (%s).', v_item_name, v_size)
            );
        END IF;

        -- ZERO-OUTPUT FILTER: Exclude zero output rows from inspection
        IF v_auth_packed_qty <= 0 THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', format('Cannot inspect %s (%s) because packed quantity is 0.', v_item_name, v_size)
            );
        END IF;

        -- Client input validation
        IF v_item->>'packed_quantity' IS NOT NULL THEN
            BEGIN
                v_client_packed_qty := (v_item->>'packed_quantity')::INTEGER;
                IF v_client_packed_qty != v_auth_packed_qty THEN
                    RETURN jsonb_build_object('success', false, 'error', 'Quality check packed quantity does not match Packing output.');
                END IF;
            EXCEPTION WHEN OTHERS THEN
                RETURN jsonb_build_object('success', false, 'error', 'Quality check packed quantity does not match Packing output.');
            END;
        END IF;

        -- Extract passed quantity (0 is strictly valid, null/blank means pending)
        v_passed_raw := v_item->>'passed_quantity';

        IF v_passed_raw IS NOT NULL AND trim(v_passed_raw) != '' THEN
            BEGIN
                v_passed_qty := trim(v_passed_raw)::INTEGER;
            EXCEPTION WHEN OTHERS THEN
                RETURN jsonb_build_object('success', false, 'error', format('Invalid passed quantity for %s (%s).', v_item_name, v_size));
            END;

            IF v_passed_qty < 0 THEN
                RETURN jsonb_build_object('success', false, 'error', 'Passed Quantity cannot be negative.');
            END IF;

            IF v_passed_qty > v_auth_packed_qty THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'error', 'Passed Quantity cannot be greater than Packed Quantity.'
                );
            END IF;

            -- Defective is strictly server calculated: Defective = Packed - Passed
            v_defective_qty := v_auth_packed_qty - v_passed_qty;

            v_row_status := CASE 
                WHEN v_passed_qty = v_auth_packed_qty THEN 'passed'
                WHEN v_passed_qty = 0 THEN 'defective'
                ELSE 'partial'
            END;
        ELSE
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

    -- 3. Update quality_check_records aggregates
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

    -- Ensure quality_check_records entry exists
    SELECT id INTO v_qc_id FROM public.quality_check_records WHERE order_id = p_order_id;
    IF v_qc_id IS NOT NULL THEN
        UPDATE public.quality_check_records
        SET total_quantity = v_total_packed,
            checked_quantity = v_checked_qty,
            passed_quantity = v_passed_qty_sum,
            defective_quantity = v_defective_qty_sum,
            status = CASE 
                WHEN status = 'completed' THEN 'completed' 
                WHEN status = 'passed' THEN 'passed' 
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

-- =========================================================================
-- 5. RPC: complete_order_quality_check
-- =========================================================================
CREATE OR REPLACE FUNCTION public.complete_order_quality_check(
    p_order_id UUID,
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
    v_total_operational INTEGER := 0;
    v_missing_count INTEGER := 0;
    v_invalid_count INTEGER := 0;
    v_total_packed INTEGER := 0;
    v_passed_qty_sum INTEGER := 0;
    v_defective_qty_sum INTEGER := 0;
    v_checked_qty INTEGER := 0;
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

    -- 2. Verify Operational Rows from Stage 8 (Packing)
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

    -- 3. Check if any operational packing row is missing from QC or has NULL passed_quantity
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

    -- 4. Check for invalid quantities: passed < 0 or passed > packed
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

    -- 5. Calculate final sums
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

    -- 6. Update quality_check_records
    SELECT id INTO v_qc_id FROM public.quality_check_records WHERE order_id = p_order_id;

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

    -- 7. Ensure Order is ready for Packing & Delivery
    UPDATE public.orders
    SET status = 'packed',
        updated_at = v_now
    WHERE id = p_order_id;

    -- 8. Add Quality Check History
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
        'in_progress',
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

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.start_quality_check(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_quality_check(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.save_order_quality_check_items(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_order_quality_check_items(UUID, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_order_quality_check(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_order_quality_check(UUID, TEXT) TO service_role;

COMMIT;
