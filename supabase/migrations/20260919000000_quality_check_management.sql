-- Migration: Quality Check Management Module
-- Phase: EvenVibe Admin Quality Check Management

BEGIN;

-- 1. Create public.quality_check_records table
CREATE TABLE IF NOT EXISTS public.quality_check_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (
        status IN ('pending', 'in_progress', 'passed', 'failed')
    ),
    total_quantity INTEGER NOT NULL CHECK (total_quantity >= 0),
    checked_quantity INTEGER NOT NULL DEFAULT 0 CHECK (
        checked_quantity >= 0 AND checked_quantity <= total_quantity
    ),
    passed_quantity INTEGER NOT NULL DEFAULT 0 CHECK (passed_quantity >= 0),
    defective_quantity INTEGER NOT NULL DEFAULT 0 CHECK (defective_quantity >= 0),
    remarks TEXT NULL,
    started_at TIMESTAMPTZ NULL,
    completed_at TIMESTAMPTZ NULL,
    checked_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_qc_quantities CHECK (passed_quantity + defective_quantity <= checked_quantity)
);

-- Indexes for quality_check_records
CREATE INDEX IF NOT EXISTS quality_check_records_order_id_idx ON public.quality_check_records(order_id);
CREATE INDEX IF NOT EXISTS quality_check_records_status_idx ON public.quality_check_records(status);
CREATE INDEX IF NOT EXISTS quality_check_records_created_at_idx ON public.quality_check_records(created_at);

-- Trigger for updated_at on quality_check_records
DROP TRIGGER IF EXISTS set_quality_check_records_updated_at ON public.quality_check_records;
CREATE TRIGGER set_quality_check_records_updated_at
    BEFORE UPDATE ON public.quality_check_records
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- 2. Create public.quality_check_history table
CREATE TABLE IF NOT EXISTS public.quality_check_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quality_check_id UUID NOT NULL REFERENCES public.quality_check_records(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    from_status TEXT NULL CHECK (
        from_status IS NULL OR from_status IN ('pending', 'in_progress', 'passed', 'failed')
    ),
    to_status TEXT NOT NULL CHECK (
        to_status IN ('pending', 'in_progress', 'passed', 'failed')
    ),
    note TEXT NULL,
    changed_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for quality_check_history
CREATE INDEX IF NOT EXISTS quality_check_history_order_id_idx ON public.quality_check_history(order_id);
CREATE INDEX IF NOT EXISTS quality_check_history_qc_id_idx ON public.quality_check_history(quality_check_id);
CREATE INDEX IF NOT EXISTS quality_check_history_created_at_idx ON public.quality_check_history(created_at);

-- 3. Row Level Security
ALTER TABLE public.quality_check_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quality_check_history ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "EvenVive Admins can manage quality_check_records" ON public.quality_check_records;
DROP POLICY IF EXISTS "School Admins can view own quality_check_records" ON public.quality_check_records;
DROP POLICY IF EXISTS "EvenVive Admins can manage quality_check_history" ON public.quality_check_history;
DROP POLICY IF EXISTS "School Admins can view own quality_check_history" ON public.quality_check_history;

-- Admin policies (Full access for EvenVibe Admins)
CREATE POLICY "EvenVive Admins can manage quality_check_records"
    ON public.quality_check_records FOR ALL
    USING (public.get_my_role() = 'evenvibe_admin')
    WITH CHECK (public.get_my_role() = 'evenvibe_admin');

CREATE POLICY "EvenVive Admins can manage quality_check_history"
    ON public.quality_check_history FOR ALL
    USING (public.get_my_role() = 'evenvibe_admin')
    WITH CHECK (public.get_my_role() = 'evenvibe_admin');

-- School Admin policies (Read-only for their own school orders)
CREATE POLICY "School Admins can view own quality_check_records"
    ON public.quality_check_records FOR SELECT
    USING (
        order_id IN (
            SELECT id FROM public.orders WHERE school_id = public.get_my_school_id()
        ) AND public.get_my_role() = 'school_admin'
    );

CREATE POLICY "School Admins can view own quality_check_history"
    ON public.quality_check_history FOR SELECT
    USING (
        order_id IN (
            SELECT id FROM public.orders WHERE school_id = public.get_my_school_id()
        ) AND public.get_my_role() = 'school_admin'
    );

-- 4. Table Grants (Mandatory for authenticated role)
GRANT SELECT, INSERT, UPDATE ON public.quality_check_records TO authenticated;
GRANT SELECT, INSERT ON public.quality_check_history TO authenticated;

-- 5. Atomic RPC to Start Quality Check
CREATE OR REPLACE FUNCTION public.start_quality_check(
    p_order_id UUID,
    p_remarks TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role TEXT;
    v_user_id UUID;
    v_order_status TEXT;
    v_requirement_id UUID;
    v_prod_stage TEXT;
    v_total_qty INTEGER := 0;
    v_existing_qc_id UUID;
    v_new_qc_id UUID;
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
    SELECT status, requirement_id INTO v_order_status, v_requirement_id
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF v_order_status IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found');
    END IF;

    IF v_order_status != 'production' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order must be in production status to start quality check. Current status: ' || v_order_status);
    END IF;

    -- 3. Verify production record stage = 'production_completed'
    SELECT stage INTO v_prod_stage
    FROM public.production_records
    WHERE order_id = p_order_id;

    IF v_prod_stage IS NULL OR v_prod_stage != 'production_completed' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Production stage must be production_completed before starting quality check. Current stage: ' || COALESCE(v_prod_stage, 'none'));
    END IF;

    -- 4. Check for existing QC record
    SELECT id INTO v_existing_qc_id
    FROM public.quality_check_records
    WHERE order_id = p_order_id;

    IF v_existing_qc_id IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Quality check record already exists for this order');
    END IF;

    -- 5. Calculate historical total quantity from requirement_items snapshot
    SELECT COALESCE(SUM(quantity), 0) INTO v_total_qty
    FROM public.requirement_items
    WHERE requirement_id = v_requirement_id;

    -- 6. Insert quality_check_records entry
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
        v_total_qty,
        0,
        0,
        0,
        p_remarks,
        now(),
        v_user_id
    ) RETURNING id INTO v_new_qc_id;

    -- 7. Insert quality_check_history entry
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
        NULL,
        'in_progress',
        COALESCE(p_remarks, 'Quality check started'),
        v_user_id
    );

    -- 8. Update Order status to 'quality_check'
    UPDATE public.orders
    SET status = 'quality_check',
        updated_at = now()
    WHERE id = p_order_id;

    -- 9. Insert order_status_history entry
    INSERT INTO public.order_status_history (
        order_id,
        status,
        note
    ) VALUES (
        p_order_id,
        'quality_check',
        COALESCE(p_remarks, 'Quality check started')
    );

    RETURN jsonb_build_object(
        'success', true,
        'qc_id', v_new_qc_id,
        'total_quantity', v_total_qty
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 6. Atomic RPC to Update Quality Check Progress
CREATE OR REPLACE FUNCTION public.update_quality_check_progress(
    p_order_id UUID,
    p_checked_quantity INT,
    p_passed_quantity INT,
    p_defective_quantity INT,
    p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role TEXT;
    v_user_id UUID;
    v_qc_id UUID;
    v_qc_status TEXT;
    v_total_qty INT;
    v_hist_note TEXT;
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

    -- 2. Lock & Fetch QC Record
    SELECT id, status, total_quantity INTO v_qc_id, v_qc_status, v_total_qty
    FROM public.quality_check_records
    WHERE order_id = p_order_id
    FOR UPDATE;

    IF v_qc_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Quality check record not found for this order');
    END IF;

    IF v_qc_status != 'in_progress' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot update progress on quality check that is ' || v_qc_status);
    END IF;

    -- 3. Quantity Validations
    IF p_checked_quantity < 0 OR p_checked_quantity > v_total_qty THEN
        RETURN jsonb_build_object('success', false, 'error', format('Checked quantity (%s) must be between 0 and total quantity (%s)', p_checked_quantity, v_total_qty));
    END IF;

    IF p_passed_quantity < 0 OR p_defective_quantity < 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Passed and defective quantities cannot be negative');
    END IF;

    IF (p_passed_quantity + p_defective_quantity) > p_checked_quantity THEN
        RETURN jsonb_build_object('success', false, 'error', format('Passed (%s) + Defective (%s) cannot exceed Checked quantity (%s)', p_passed_quantity, p_defective_quantity, p_checked_quantity));
    END IF;

    -- 4. Update QC Record
    UPDATE public.quality_check_records
    SET checked_quantity = p_checked_quantity,
        passed_quantity = p_passed_quantity,
        defective_quantity = p_defective_quantity,
        updated_at = now()
    WHERE id = v_qc_id;

    -- 5. Insert History
    v_hist_note := format('Inspection progress: %s/%s checked (%s passed, %s defective)%s',
        p_checked_quantity,
        v_total_qty,
        p_passed_quantity,
        p_defective_quantity,
        CASE WHEN p_note IS NOT NULL AND trim(p_note) != '' THEN ' — ' || trim(p_note) ELSE '' END
    );

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
        'in_progress',
        v_hist_note,
        v_user_id
    );

    RETURN jsonb_build_object(
        'success', true,
        'checked_quantity', p_checked_quantity,
        'passed_quantity', p_passed_quantity,
        'defective_quantity', p_defective_quantity
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 7. Atomic RPC to Complete Quality Check
CREATE OR REPLACE FUNCTION public.complete_quality_check(
    p_order_id UUID,
    p_resolution_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role TEXT;
    v_user_id UUID;
    v_qc_id UUID;
    v_qc_status TEXT;
    v_total_qty INT;
    v_checked_qty INT;
    v_passed_qty INT;
    v_defective_qty INT;
    v_order_status TEXT;
    v_new_qc_status TEXT;
    v_note TEXT;
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

    -- 2. Lock & Fetch QC Record
    SELECT id, status, total_quantity, checked_quantity, passed_quantity, defective_quantity
    INTO v_qc_id, v_qc_status, v_total_qty, v_checked_qty, v_passed_qty, v_defective_qty
    FROM public.quality_check_records
    WHERE order_id = p_order_id
    FOR UPDATE;

    IF v_qc_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Quality check record not found for this order');
    END IF;

    IF v_qc_status != 'in_progress' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Quality check is already ' || v_qc_status);
    END IF;

    -- 3. Lock & Fetch Order
    SELECT status INTO v_order_status
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    -- 4. Completion Validations
    IF v_checked_qty != v_total_qty THEN
        RETURN jsonb_build_object('success', false, 'error', format('All items must be inspected before completion. Checked %s of %s items.', v_checked_qty, v_total_qty));
    END IF;

    IF (v_passed_qty + v_defective_qty) != v_checked_qty THEN
        RETURN jsonb_build_object('success', false, 'error', format('Passed (%s) + Defective (%s) must equal Checked quantity (%s) before completion.', v_passed_qty, v_defective_qty, v_checked_qty));
    END IF;

    -- 5. Branch based on Defective Quantity
    IF v_defective_qty = 0 THEN
        v_new_qc_status := 'passed';
        v_note := COALESCE(p_resolution_note, 'Quality check passed with 0 defects. Order ready for packing.');

        -- Update QC Record
        UPDATE public.quality_check_records
        SET status = 'passed',
            completed_at = now(),
            updated_at = now()
        WHERE id = v_qc_id;

        -- Advance Order to 'packed'
        UPDATE public.orders
        SET status = 'packed',
            updated_at = now()
        WHERE id = p_order_id;

        -- Log QC History
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
            'passed',
            v_note,
            v_user_id
        );

        -- Log Order Status History
        INSERT INTO public.order_status_history (
            order_id,
            status,
            note
        ) VALUES (
            p_order_id,
            'packed',
            v_note
        );

    ELSE
        v_new_qc_status := 'failed';
        v_note := COALESCE(p_resolution_note, format('Quality check failed: %s defective items detected out of %s total items.', v_defective_qty, v_total_qty));

        -- Update QC Record
        UPDATE public.quality_check_records
        SET status = 'failed',
            completed_at = now(),
            updated_at = now()
        WHERE id = v_qc_id;

        -- Order status remains 'quality_check'

        -- Log QC History
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
            'failed',
            v_note,
            v_user_id
        );

        -- Log Order Status History noting failure
        INSERT INTO public.order_status_history (
            order_id,
            status,
            note
        ) VALUES (
            p_order_id,
            'quality_check',
            v_note
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'status', v_new_qc_status,
        'passed_quantity', v_passed_qty,
        'defective_quantity', v_defective_qty
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

COMMIT;
