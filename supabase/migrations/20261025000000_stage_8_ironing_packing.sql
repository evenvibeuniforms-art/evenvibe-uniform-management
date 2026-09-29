-- Migration: 20261025000000_stage_8_ironing_packing.sql
-- Description: Implement Stage 8 — Ironing & Packing module.
-- 1. Creates public.order_ironing_packing_items table with separate stage_key for 'ironing' and 'packing'.
-- 2. Adds ironing_completed_at column to public.order_production_workflows to track the internal two-step workflow.
-- 3. Implements save_order_ironing_items RPC with authoritative Checking Passed Quantity input derivation.
-- 4. Implements complete_order_ironing_step RPC validating all operational rows have ironed == input and pending == 0.
-- 5. Implements save_order_packing_items RPC with authoritative Ironing Output input derivation.
-- 6. Implements complete_order_packing_step RPC validating all operational rows have packed == input, completing Stage 8, and updating order status to 'packed'.

BEGIN;

-- =========================================================================
-- 1. Table: public.order_ironing_packing_items
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.order_ironing_packing_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    stage_key TEXT NOT NULL CHECK (stage_key IN ('ironing', 'packing')),
    item_name TEXT NOT NULL,
    style_id UUID REFERENCES public.uniform_styles(id) ON DELETE SET NULL,
    style_name TEXT NULL,
    color TEXT NULL,
    size TEXT NOT NULL,
    input_quantity INTEGER NOT NULL CHECK (input_quantity >= 0),
    actual_quantity INTEGER NOT NULL DEFAULT 0 CHECK (actual_quantity >= 0),
    pending_quantity INTEGER NOT NULL DEFAULT 0 CHECK (pending_quantity >= 0),
    remarks TEXT NULL,
    status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('enter_quantities', 'pending', 'complete', 'completed', 'invalid')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_ironing_packing_quantities CHECK (
        actual_quantity <= input_quantity 
        AND (actual_quantity + pending_quantity = input_quantity)
    )
);

-- Unique index to guarantee 1 entry per order + stage_key + item + style + color + size
CREATE UNIQUE INDEX IF NOT EXISTS idx_order_ironing_packing_items_unique ON public.order_ironing_packing_items (
    order_id,
    stage_key,
    lower(trim(item_name)),
    COALESCE(NULLIF(trim(style_id::text), ''), 'no_style_id'),
    COALESCE(NULLIF(lower(trim(style_name)), ''), 'no_style_name'),
    COALESCE(NULLIF(lower(trim(color)), ''), 'no_color'),
    lower(trim(size))
);

CREATE INDEX IF NOT EXISTS idx_order_ironing_packing_items_order_stage 
    ON public.order_ironing_packing_items(order_id, stage_key);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_order_ironing_packing_items_modtime ON public.order_ironing_packing_items;
CREATE TRIGGER update_order_ironing_packing_items_modtime
    BEFORE UPDATE ON public.order_ironing_packing_items
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- RLS
ALTER TABLE public.order_ironing_packing_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage order ironing packing items" ON public.order_ironing_packing_items;
CREATE POLICY "Admins can manage order ironing packing items"
    ON public.order_ironing_packing_items FOR ALL
    USING (public.get_my_role() = 'evenvibe_admin')
    WITH CHECK (public.get_my_role() = 'evenvibe_admin');

DROP POLICY IF EXISTS "School Admins can view own order ironing packing items" ON public.order_ironing_packing_items;
CREATE POLICY "School Admins can view own order ironing packing items"
    ON public.order_ironing_packing_items
    FOR SELECT
    USING (
        order_id IN (
            SELECT id FROM public.orders WHERE school_id = public.get_my_school_id()
        )
        AND public.get_my_role() = 'school_admin'
    );

-- Grant privileges
GRANT ALL ON public.order_ironing_packing_items TO authenticated;
GRANT ALL ON public.order_ironing_packing_items TO service_role;

-- =========================================================================
-- 2. Add ironing_completed_at to public.order_production_workflows
-- =========================================================================
ALTER TABLE public.order_production_workflows 
    ADD COLUMN IF NOT EXISTS ironing_completed_at TIMESTAMPTZ NULL;

-- =========================================================================
-- 3. RPC: save_order_ironing_items
-- =========================================================================
CREATE OR REPLACE FUNCTION public.save_order_ironing_items(
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
    v_checking_status TEXT;
    v_item JSONB;
    v_item_name TEXT;
    v_style_id UUID;
    v_style_name TEXT;
    v_color TEXT;
    v_size TEXT;
    v_remarks TEXT;
    v_ironed_qty INTEGER;
    v_auth_input_qty INTEGER;
    v_client_input_qty INTEGER;
    v_pending_qty INTEGER;
    v_row_status TEXT;
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

    -- 2. Verify Checking Stage is completed
    SELECT status INTO v_checking_status
    FROM public.order_production_workflows
    WHERE order_id = p_order_id AND sequence_order = 7;

    IF v_checking_status != 'completed' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Checking stage must be completed before Ironing.');
    END IF;

    -- 3. Process each ironing item
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

        -- Extract ironed quantity (0 is strictly valid)
        IF v_item->>'actual_quantity' IS NULL OR trim(v_item->>'actual_quantity') = '' THEN
            RETURN jsonb_build_object(
                'success', false, 
                'error', format('Enter ironed quantity for %s (%s).', v_item_name, v_size)
            );
        END IF;

        BEGIN
            v_ironed_qty := (v_item->>'actual_quantity')::INTEGER;
        EXCEPTION WHEN OTHERS THEN
            RETURN jsonb_build_object('success', false, 'error', format('Invalid ironed quantity for %s (%s).', v_item_name, v_size));
        END;

        IF v_ironed_qty < 0 THEN
            RETURN jsonb_build_object('success', false, 'error', 'Ironed quantity cannot be negative.');
        END IF;

        -- Derive Authoritative Input from Checking Passed Quantity
        SELECT passed_quantity INTO v_auth_input_qty
        FROM public.order_checking_items
        WHERE order_id = p_order_id
          AND lower(trim(item_name)) = lower(v_item_name)
          AND COALESCE(NULLIF(trim(style_id::text), ''), 'no_style_id') = COALESCE(NULLIF(trim(v_style_id::text), ''), 'no_style_id')
          AND COALESCE(NULLIF(lower(trim(style_name)), ''), 'no_style_name') = COALESCE(NULLIF(lower(trim(v_style_name)), ''), 'no_style_name')
          AND COALESCE(NULLIF(lower(trim(color)), ''), 'no_color') = COALESCE(NULLIF(lower(trim(v_color)), ''), 'no_color')
          AND lower(trim(size)) = lower(v_size);

        IF v_auth_input_qty IS NULL THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', format('No Checking record found for %s (%s).', v_item_name, v_size)
            );
        END IF;

        -- ZERO-OUTPUT FILTER: Ironing rows cannot exist if Checking passed quantity was 0
        IF v_auth_input_qty <= 0 THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', format('Cannot iron %s (%s) because Checking passed quantity is 0.', v_item_name, v_size)
            );
        END IF;

        -- Client input validation: reject if client attempts to falsify input quantity
        IF v_item->>'input_quantity' IS NOT NULL THEN
            BEGIN
                v_client_input_qty := (v_item->>'input_quantity')::INTEGER;
                IF v_client_input_qty != v_auth_input_qty THEN
                    RETURN jsonb_build_object('success', false, 'error', 'Ironing input quantity does not match Checking passed quantity.');
                END IF;
            EXCEPTION WHEN OTHERS THEN
                RETURN jsonb_build_object('success', false, 'error', 'Ironing input quantity does not match Checking passed quantity.');
            END;
        END IF;

        -- IRONED > INPUT VALIDATION
        IF v_ironed_qty > v_auth_input_qty THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Ironed quantity cannot be greater than input quantity.'
            );
        END IF;

        -- PENDING CALCULATION: Pending = Input - Ironed
        v_pending_qty := v_auth_input_qty - v_ironed_qty;
        v_row_status := CASE WHEN v_pending_qty = 0 THEN 'complete' ELSE 'pending' END;

        -- Upsert record into order_ironing_packing_items with stage_key = 'ironing'
        INSERT INTO public.order_ironing_packing_items (
            order_id,
            stage_key,
            item_name,
            style_id,
            style_name,
            color,
            size,
            input_quantity,
            actual_quantity,
            pending_quantity,
            remarks,
            status,
            updated_at
        ) VALUES (
            p_order_id,
            'ironing',
            v_item_name,
            v_style_id,
            v_style_name,
            v_color,
            v_size,
            v_auth_input_qty,
            v_ironed_qty,
            v_pending_qty,
            v_remarks,
            v_row_status,
            now()
        )
        ON CONFLICT (
            order_id,
            stage_key,
            lower(trim(item_name)),
            COALESCE(NULLIF(trim(style_id::text), ''), 'no_style_id'),
            COALESCE(NULLIF(lower(trim(style_name)), ''), 'no_style_name'),
            COALESCE(NULLIF(lower(trim(color)), ''), 'no_color'),
            lower(trim(size))
        )
        DO UPDATE SET
            input_quantity = EXCLUDED.input_quantity,
            actual_quantity = EXCLUDED.actual_quantity,
            pending_quantity = EXCLUDED.pending_quantity,
            remarks = COALESCE(EXCLUDED.remarks, public.order_ironing_packing_items.remarks),
            status = EXCLUDED.status,
            updated_at = now();
    END LOOP;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- =========================================================================
-- 4. RPC: complete_order_ironing_step
-- =========================================================================
CREATE OR REPLACE FUNCTION public.complete_order_ironing_step(
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
    v_prod_id UUID;
    v_total_operational INTEGER := 0;
    v_missing_count INTEGER := 0;
    v_pending_count INTEGER := 0;
    v_invalid_count INTEGER := 0;
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

    -- 2. Lock Production Record
    SELECT id INTO v_prod_id
    FROM public.production_records
    WHERE order_id = p_order_id
    FOR UPDATE;

    IF v_prod_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Production record not found for this order');
    END IF;

    -- 3. Count total operational rows from Checking where passed_quantity > 0
    SELECT COUNT(*)
    INTO v_total_operational
    FROM public.order_checking_items oci
    WHERE oci.order_id = p_order_id
      AND oci.passed_quantity > 0;

    IF v_total_operational = 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'No pieces are available for ironing.'
        );
    END IF;

    -- 4. Check if any operational row is missing from Ironing
    SELECT COUNT(*)
    INTO v_missing_count
    FROM public.order_checking_items oci
    LEFT JOIN public.order_ironing_packing_items oipi ON (
        oipi.order_id = p_order_id
        AND oipi.stage_key = 'ironing'
        AND lower(trim(oipi.item_name)) = lower(trim(oci.item_name))
        AND COALESCE(NULLIF(trim(oipi.style_id::text), ''), 'no_style_id') = COALESCE(NULLIF(trim(oci.style_id::text), ''), 'no_style_id')
        AND COALESCE(NULLIF(lower(trim(oipi.style_name)), ''), 'no_style_name') = COALESCE(NULLIF(lower(trim(oci.style_name)), ''), 'no_style_name')
        AND COALESCE(NULLIF(lower(trim(oipi.color)), ''), 'no_color') = COALESCE(NULLIF(lower(trim(oci.color)), ''), 'no_color')
        AND lower(trim(oipi.size)) = lower(trim(oci.size))
    )
    WHERE oci.order_id = p_order_id
      AND oci.passed_quantity > 0
      AND (oipi.id IS NULL OR oipi.actual_quantity IS NULL);

    IF v_missing_count > 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Complete ironing for all required quantities before continuing.'
        );
    END IF;

    -- 5. Check if any row has invalid quantity or pending > 0
    SELECT COUNT(*)
    INTO v_invalid_count
    FROM public.order_checking_items oci
    JOIN public.order_ironing_packing_items oipi ON (
        oipi.order_id = p_order_id
        AND oipi.stage_key = 'ironing'
        AND lower(trim(oipi.item_name)) = lower(trim(oci.item_name))
        AND COALESCE(NULLIF(trim(oipi.style_id::text), ''), 'no_style_id') = COALESCE(NULLIF(trim(oci.style_id::text), ''), 'no_style_id')
        AND COALESCE(NULLIF(lower(trim(oipi.style_name)), ''), 'no_style_name') = COALESCE(NULLIF(lower(trim(oci.style_name)), ''), 'no_style_name')
        AND COALESCE(NULLIF(lower(trim(oipi.color)), ''), 'no_color') = COALESCE(NULLIF(lower(trim(oci.color)), ''), 'no_color')
        AND lower(trim(oipi.size)) = lower(trim(oci.size))
    )
    WHERE oci.order_id = p_order_id
      AND oci.passed_quantity > 0
      AND (
          oipi.actual_quantity < 0
          OR oipi.actual_quantity > oci.passed_quantity
      );

    IF v_invalid_count > 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Ironed quantity cannot be greater than input quantity.'
        );
    END IF;

    -- 6. Check for partial ironing (Pending > 0)
    SELECT COUNT(*)
    INTO v_pending_count
    FROM public.order_checking_items oci
    JOIN public.order_ironing_packing_items oipi ON (
        oipi.order_id = p_order_id
        AND oipi.stage_key = 'ironing'
        AND lower(trim(oipi.item_name)) = lower(trim(oci.item_name))
        AND COALESCE(NULLIF(trim(oipi.style_id::text), ''), 'no_style_id') = COALESCE(NULLIF(trim(oci.style_id::text), ''), 'no_style_id')
        AND COALESCE(NULLIF(lower(trim(oipi.style_name)), ''), 'no_style_name') = COALESCE(NULLIF(lower(trim(oci.style_name)), ''), 'no_style_name')
        AND COALESCE(NULLIF(lower(trim(oipi.color)), ''), 'no_color') = COALESCE(NULLIF(lower(trim(oci.color)), ''), 'no_color')
        AND lower(trim(oipi.size)) = lower(trim(oci.size))
    )
    WHERE oci.order_id = p_order_id
      AND oci.passed_quantity > 0
      AND (
          oipi.actual_quantity != oci.passed_quantity
          OR oipi.pending_quantity > 0
      );

    IF v_pending_count > 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Complete ironing for all required quantities before continuing.'
        );
    END IF;

    -- 7. Record Ironing Completed on workflow record
    UPDATE public.order_production_workflows
    SET ironing_completed_at = now(),
        updated_at = now()
    WHERE order_id = p_order_id AND sequence_order = 8;

    -- 8. Add stage history
    INSERT INTO public.production_stage_history (
        production_record_id,
        order_id,
        from_stage,
        to_stage,
        note,
        changed_by
    ) VALUES (
        v_prod_id,
        p_order_id,
        'ironing_packing',
        'ironing_packing',
        COALESCE(p_note, 'Ironing step completed successfully. Packing operation unlocked.'),
        v_user_id
    );

    RETURN jsonb_build_object(
        'success', true,
        'is_ironing_completed', true
    );
END;
$$;

-- =========================================================================
-- 5. RPC: save_order_packing_items
-- =========================================================================
CREATE OR REPLACE FUNCTION public.save_order_packing_items(
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
    v_ironing_completed_at TIMESTAMPTZ;
    v_item JSONB;
    v_item_name TEXT;
    v_style_id UUID;
    v_style_name TEXT;
    v_color TEXT;
    v_size TEXT;
    v_remarks TEXT;
    v_packed_qty INTEGER;
    v_auth_input_qty INTEGER;
    v_client_input_qty INTEGER;
    v_pending_qty INTEGER;
    v_row_status TEXT;
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

    -- 2. Verify Ironing step is completed
    SELECT ironing_completed_at INTO v_ironing_completed_at
    FROM public.order_production_workflows
    WHERE order_id = p_order_id AND sequence_order = 8;

    IF v_ironing_completed_at IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Packing is locked until Ironing is completed.');
    END IF;

    -- 3. Process each packing item
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

        -- Extract packed quantity (0 is strictly valid)
        IF v_item->>'actual_quantity' IS NULL OR trim(v_item->>'actual_quantity') = '' THEN
            RETURN jsonb_build_object(
                'success', false, 
                'error', format('Enter packed quantity for %s (%s).', v_item_name, v_size)
            );
        END IF;

        BEGIN
            v_packed_qty := (v_item->>'actual_quantity')::INTEGER;
        EXCEPTION WHEN OTHERS THEN
            RETURN jsonb_build_object('success', false, 'error', format('Invalid packed quantity for %s (%s).', v_item_name, v_size));
        END;

        IF v_packed_qty < 0 THEN
            RETURN jsonb_build_object('success', false, 'error', 'Packed quantity cannot be negative.');
        END IF;

        -- Derive Authoritative Input from Ironing Actual Output
        SELECT actual_quantity INTO v_auth_input_qty
        FROM public.order_ironing_packing_items
        WHERE order_id = p_order_id
          AND stage_key = 'ironing'
          AND lower(trim(item_name)) = lower(v_item_name)
          AND COALESCE(NULLIF(trim(style_id::text), ''), 'no_style_id') = COALESCE(NULLIF(trim(v_style_id::text), ''), 'no_style_id')
          AND COALESCE(NULLIF(lower(trim(style_name)), ''), 'no_style_name') = COALESCE(NULLIF(lower(trim(v_style_name)), ''), 'no_style_name')
          AND COALESCE(NULLIF(lower(trim(color)), ''), 'no_color') = COALESCE(NULLIF(lower(trim(v_color)), ''), 'no_color')
          AND lower(trim(size)) = lower(v_size);

        IF v_auth_input_qty IS NULL THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', format('No Ironing record found for %s (%s).', v_item_name, v_size)
            );
        END IF;

        -- ZERO-OUTPUT FILTER: Packing rows cannot exist if Ironed quantity was 0
        IF v_auth_input_qty <= 0 THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', format('Cannot pack %s (%s) because Ironed quantity is 0.', v_item_name, v_size)
            );
        END IF;

        -- Client input validation: reject if client attempts to falsify input quantity
        IF v_item->>'input_quantity' IS NOT NULL THEN
            BEGIN
                v_client_input_qty := (v_item->>'input_quantity')::INTEGER;
                IF v_client_input_qty != v_auth_input_qty THEN
                    RETURN jsonb_build_object('success', false, 'error', 'Packing input quantity does not match Ironing output.');
                END IF;
            EXCEPTION WHEN OTHERS THEN
                RETURN jsonb_build_object('success', false, 'error', 'Packing input quantity does not match Ironing output.');
            END;
        END IF;

        -- PACKED > INPUT VALIDATION
        IF v_packed_qty > v_auth_input_qty THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Packed quantity cannot be greater than input quantity.'
            );
        END IF;

        -- PENDING CALCULATION: Pending = Input - Packed
        v_pending_qty := v_auth_input_qty - v_packed_qty;
        v_row_status := CASE WHEN v_pending_qty = 0 THEN 'complete' ELSE 'pending' END;

        -- Upsert record into order_ironing_packing_items with stage_key = 'packing'
        INSERT INTO public.order_ironing_packing_items (
            order_id,
            stage_key,
            item_name,
            style_id,
            style_name,
            color,
            size,
            input_quantity,
            actual_quantity,
            pending_quantity,
            remarks,
            status,
            updated_at
        ) VALUES (
            p_order_id,
            'packing',
            v_item_name,
            v_style_id,
            v_style_name,
            v_color,
            v_size,
            v_auth_input_qty,
            v_packed_qty,
            v_pending_qty,
            v_remarks,
            v_row_status,
            now()
        )
        ON CONFLICT (
            order_id,
            stage_key,
            lower(trim(item_name)),
            COALESCE(NULLIF(trim(style_id::text), ''), 'no_style_id'),
            COALESCE(NULLIF(lower(trim(style_name)), ''), 'no_style_name'),
            COALESCE(NULLIF(lower(trim(color)), ''), 'no_color'),
            lower(trim(size))
        )
        DO UPDATE SET
            input_quantity = EXCLUDED.input_quantity,
            actual_quantity = EXCLUDED.actual_quantity,
            pending_quantity = EXCLUDED.pending_quantity,
            remarks = COALESCE(EXCLUDED.remarks, public.order_ironing_packing_items.remarks),
            status = EXCLUDED.status,
            updated_at = now();
    END LOOP;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- =========================================================================
-- 6. RPC: complete_order_packing_step
-- =========================================================================
CREATE OR REPLACE FUNCTION public.complete_order_packing_step(
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
    v_prod_id UUID;
    v_ironing_completed_at TIMESTAMPTZ;
    v_total_operational INTEGER := 0;
    v_missing_count INTEGER := 0;
    v_pending_count INTEGER := 0;
    v_invalid_count INTEGER := 0;
    v_total_packed INTEGER := 0;
    v_current_order_status TEXT;
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

    -- 2. Lock Production Record
    SELECT id INTO v_prod_id
    FROM public.production_records
    WHERE order_id = p_order_id
    FOR UPDATE;

    IF v_prod_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Production record not found for this order');
    END IF;

    -- 3. Verify Ironing step was completed
    SELECT ironing_completed_at INTO v_ironing_completed_at
    FROM public.order_production_workflows
    WHERE order_id = p_order_id AND sequence_order = 8;

    IF v_ironing_completed_at IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Ironing must be completed before Packing can be completed.'
        );
    END IF;

    -- 4. Count operational rows from Ironing where actual_quantity > 0
    SELECT COUNT(*)
    INTO v_total_operational
    FROM public.order_ironing_packing_items iron
    WHERE iron.order_id = p_order_id
      AND iron.stage_key = 'ironing'
      AND iron.actual_quantity > 0;

    IF v_total_operational = 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'No pieces are available for packing.'
        );
    END IF;

    -- 5. Check if any operational row is missing from Packing
    SELECT COUNT(*)
    INTO v_missing_count
    FROM public.order_ironing_packing_items iron
    LEFT JOIN public.order_ironing_packing_items pack ON (
        pack.order_id = p_order_id
        AND pack.stage_key = 'packing'
        AND lower(trim(pack.item_name)) = lower(trim(iron.item_name))
        AND COALESCE(NULLIF(trim(pack.style_id::text), ''), 'no_style_id') = COALESCE(NULLIF(trim(iron.style_id::text), ''), 'no_style_id')
        AND COALESCE(NULLIF(lower(trim(pack.style_name)), ''), 'no_style_name') = COALESCE(NULLIF(lower(trim(iron.style_name)), ''), 'no_style_name')
        AND COALESCE(NULLIF(lower(trim(pack.color)), ''), 'no_color') = COALESCE(NULLIF(lower(trim(iron.color)), ''), 'no_color')
        AND lower(trim(pack.size)) = lower(trim(iron.size))
    )
    WHERE iron.order_id = p_order_id
      AND iron.stage_key = 'ironing'
      AND iron.actual_quantity > 0
      AND (pack.id IS NULL OR pack.actual_quantity IS NULL);

    IF v_missing_count > 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Complete packing for all required quantities before continuing.'
        );
    END IF;

    -- 6. Check for invalid quantities: packed < 0 or packed > input
    SELECT COUNT(*)
    INTO v_invalid_count
    FROM public.order_ironing_packing_items iron
    JOIN public.order_ironing_packing_items pack ON (
        pack.order_id = p_order_id
        AND pack.stage_key = 'packing'
        AND lower(trim(pack.item_name)) = lower(trim(iron.item_name))
        AND COALESCE(NULLIF(trim(pack.style_id::text), ''), 'no_style_id') = COALESCE(NULLIF(trim(iron.style_id::text), ''), 'no_style_id')
        AND COALESCE(NULLIF(lower(trim(pack.style_name)), ''), 'no_style_name') = COALESCE(NULLIF(lower(trim(iron.style_name)), ''), 'no_style_name')
        AND COALESCE(NULLIF(lower(trim(pack.color)), ''), 'no_color') = COALESCE(NULLIF(lower(trim(iron.color)), ''), 'no_color')
        AND lower(trim(pack.size)) = lower(trim(iron.size))
    )
    WHERE iron.order_id = p_order_id
      AND iron.stage_key = 'ironing'
      AND iron.actual_quantity > 0
      AND (
          pack.actual_quantity < 0
          OR pack.actual_quantity > iron.actual_quantity
      );

    IF v_invalid_count > 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Packed quantity cannot be greater than input quantity.'
        );
    END IF;

    -- 7. Check for partial packing (pending > 0 or packed != input)
    SELECT COUNT(*)
    INTO v_pending_count
    FROM public.order_ironing_packing_items iron
    JOIN public.order_ironing_packing_items pack ON (
        pack.order_id = p_order_id
        AND pack.stage_key = 'packing'
        AND lower(trim(pack.item_name)) = lower(trim(iron.item_name))
        AND COALESCE(NULLIF(trim(pack.style_id::text), ''), 'no_style_id') = COALESCE(NULLIF(trim(iron.style_id::text), ''), 'no_style_id')
        AND COALESCE(NULLIF(lower(trim(pack.style_name)), ''), 'no_style_name') = COALESCE(NULLIF(lower(trim(iron.style_name)), ''), 'no_style_name')
        AND COALESCE(NULLIF(lower(trim(pack.color)), ''), 'no_color') = COALESCE(NULLIF(lower(trim(iron.color)), ''), 'no_color')
        AND lower(trim(pack.size)) = lower(trim(iron.size))
    )
    WHERE iron.order_id = p_order_id
      AND iron.stage_key = 'ironing'
      AND iron.actual_quantity > 0
      AND (
          pack.actual_quantity != iron.actual_quantity
          OR pack.pending_quantity > 0
      );

    IF v_pending_count > 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Complete packing for all required quantities before continuing.'
        );
    END IF;

    -- 8. Compute total packed pieces
    SELECT COALESCE(SUM(actual_quantity), 0) INTO v_total_packed
    FROM public.order_ironing_packing_items
    WHERE order_id = p_order_id AND stage_key = 'packing';

    -- 9. Mark Stage 8 (Ironing and Packing) as completed
    UPDATE public.order_production_workflows
    SET status = 'completed',
        completed_at = now(),
        updated_at = now()
    WHERE order_id = p_order_id AND sequence_order = 8;

    -- 10. Mark Production Record as completed
    UPDATE public.production_records
    SET stage = 'production_completed',
        completed_quantity = v_total_packed,
        completed_at = now(),
        remarks = COALESCE(p_note, remarks),
        updated_at = now()
    WHERE id = v_prod_id;

    -- 11. Update Order Status to 'packed'
    SELECT status INTO v_current_order_status
    FROM public.orders
    WHERE id = p_order_id;

    UPDATE public.orders
    SET status = 'packed',
        updated_at = now()
    WHERE id = p_order_id;

    -- 12. Add stage history
    INSERT INTO public.production_stage_history (
        production_record_id,
        order_id,
        from_stage,
        to_stage,
        note,
        changed_by
    ) VALUES (
        v_prod_id,
        p_order_id,
        'ironing_packing',
        'production_completed',
        COALESCE(p_note, format('Ironing and Packing completed (%s packed). Order status updated to Packed.', v_total_packed)),
        v_user_id
    );

    -- 13. Add order status history
    INSERT INTO public.order_status_history (
        order_id,
        status,
        note
    ) VALUES (
        p_order_id,
        'packed',
        COALESCE(p_note, format('Production manufacturing finished. Total packed: %s.', v_total_packed))
    );

    RETURN jsonb_build_object(
        'success', true,
        'completed_stage', 'ironing_packing',
        'order_status', 'packed',
        'total_packed', v_total_packed
    );
END;
$$;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.save_order_ironing_items(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_order_ironing_items(UUID, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_order_ironing_step(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_order_ironing_step(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.save_order_packing_items(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_order_packing_items(UUID, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_order_packing_step(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_order_packing_step(UUID, TEXT) TO service_role;

COMMIT;
