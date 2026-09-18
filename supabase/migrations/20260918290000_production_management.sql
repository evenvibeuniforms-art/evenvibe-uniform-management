-- Migration: Production Management Module
-- Phase: EvenVibe Admin Production Management

BEGIN;

-- 1. Create public.production_records table
CREATE TABLE IF NOT EXISTS public.production_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE UNIQUE,
    stage TEXT NOT NULL DEFAULT 'production_started' CHECK (
        stage IN (
            'production_started',
            'cutting',
            'stitching',
            'finishing',
            'production_completed'
        )
    ),
    total_quantity INTEGER NOT NULL CHECK (total_quantity >= 0),
    completed_quantity INTEGER NOT NULL DEFAULT 0 CHECK (
        completed_quantity >= 0 AND completed_quantity <= total_quantity
    ),
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ NULL,
    remarks TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for production_records
CREATE INDEX IF NOT EXISTS production_records_order_id_idx ON public.production_records(order_id);
CREATE INDEX IF NOT EXISTS production_records_stage_idx ON public.production_records(stage);
CREATE INDEX IF NOT EXISTS production_records_created_at_idx ON public.production_records(created_at);

-- Trigger for updated_at on production_records
DROP TRIGGER IF EXISTS set_production_records_updated_at ON public.production_records;
CREATE TRIGGER set_production_records_updated_at
    BEFORE UPDATE ON public.production_records
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- 2. Create public.production_stage_history table
CREATE TABLE IF NOT EXISTS public.production_stage_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    production_record_id UUID NOT NULL REFERENCES public.production_records(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    from_stage TEXT NULL CHECK (
        from_stage IS NULL OR from_stage IN (
            'production_started',
            'cutting',
            'stitching',
            'finishing',
            'production_completed'
        )
    ),
    to_stage TEXT NOT NULL CHECK (
        to_stage IN (
            'production_started',
            'cutting',
            'stitching',
            'finishing',
            'production_completed'
        )
    ),
    note TEXT NULL,
    changed_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for production_stage_history
CREATE INDEX IF NOT EXISTS production_stage_history_order_id_idx ON public.production_stage_history(order_id);
CREATE INDEX IF NOT EXISTS production_stage_history_prod_id_idx ON public.production_stage_history(production_record_id);
CREATE INDEX IF NOT EXISTS production_stage_history_created_at_idx ON public.production_stage_history(created_at);

-- 3. Row Level Security
ALTER TABLE public.production_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_stage_history ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "EvenVive Admins can manage production_records" ON public.production_records;
DROP POLICY IF EXISTS "School Admins can view own production_records" ON public.production_records;
DROP POLICY IF EXISTS "EvenVive Admins can manage production_stage_history" ON public.production_stage_history;
DROP POLICY IF EXISTS "School Admins can view own production_stage_history" ON public.production_stage_history;

-- Admin policies (Full access for EvenVibe Admins)
CREATE POLICY "EvenVive Admins can manage production_records"
    ON public.production_records FOR ALL
    USING (public.get_my_role() = 'evenvibe_admin')
    WITH CHECK (public.get_my_role() = 'evenvibe_admin');

CREATE POLICY "EvenVive Admins can manage production_stage_history"
    ON public.production_stage_history FOR ALL
    USING (public.get_my_role() = 'evenvibe_admin')
    WITH CHECK (public.get_my_role() = 'evenvibe_admin');

-- School Admin policies (Read-only for their own school orders)
CREATE POLICY "School Admins can view own production_records"
    ON public.production_records FOR SELECT
    USING (
        order_id IN (
            SELECT id FROM public.orders WHERE school_id = public.get_my_school_id()
        ) AND public.get_my_role() = 'school_admin'
    );

CREATE POLICY "School Admins can view own production_stage_history"
    ON public.production_stage_history FOR SELECT
    USING (
        order_id IN (
            SELECT id FROM public.orders WHERE school_id = public.get_my_school_id()
        ) AND public.get_my_role() = 'school_admin'
    );

-- 4. Table Grants (Mandatory for authenticated role)
GRANT SELECT, INSERT, UPDATE ON public.production_records TO authenticated;
GRANT SELECT, INSERT ON public.production_stage_history TO authenticated;

-- 5. Atomic RPC to Start Production
CREATE OR REPLACE FUNCTION public.start_production(
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
    v_total_qty INTEGER := 0;
    v_existing_prod_id UUID;
    v_new_prod_id UUID;
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

    IF v_order_status != 'confirmed' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order must be in confirmed status to start production. Current status: ' || v_order_status);
    END IF;

    -- 3. Check for existing production record
    SELECT id INTO v_existing_prod_id
    FROM public.production_records
    WHERE order_id = p_order_id;

    IF v_existing_prod_id IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Production record already exists for this order');
    END IF;

    -- 4. Calculate historical total quantity from requirement_items snapshot
    SELECT COALESCE(SUM(quantity), 0) INTO v_total_qty
    FROM public.requirement_items
    WHERE requirement_id = v_requirement_id;

    -- 5. Update Order status to 'production'
    UPDATE public.orders
    SET status = 'production',
        updated_at = now()
    WHERE id = p_order_id;

    -- 6. Insert order_status_history entry
    INSERT INTO public.order_status_history (
        order_id,
        status,
        note
    ) VALUES (
        p_order_id,
        'production',
        COALESCE(p_remarks, 'Production started')
    );

    -- 7. Insert production_records entry
    INSERT INTO public.production_records (
        order_id,
        stage,
        total_quantity,
        completed_quantity,
        started_at,
        remarks
    ) VALUES (
        p_order_id,
        'production_started',
        v_total_qty,
        0,
        now(),
        p_remarks
    ) RETURNING id INTO v_new_prod_id;

    -- 8. Insert production_stage_history entry
    INSERT INTO public.production_stage_history (
        production_record_id,
        order_id,
        from_stage,
        to_stage,
        note,
        changed_by
    ) VALUES (
        v_new_prod_id,
        p_order_id,
        NULL,
        'production_started',
        COALESCE(p_remarks, 'Production started'),
        v_user_id
    );

    RETURN jsonb_build_object(
        'success', true,
        'production_record_id', v_new_prod_id,
        'total_quantity', v_total_qty
    );
END;
$$;

-- 6. Atomic RPC to Advance Production Stage
CREATE OR REPLACE FUNCTION public.advance_production_stage(
    p_order_id UUID,
    p_next_stage TEXT,
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
    v_order_status TEXT;
    v_prod_id UUID;
    v_current_stage TEXT;
    v_is_valid BOOLEAN := false;
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

    -- 2. Verify Order
    SELECT status INTO v_order_status
    FROM public.orders
    WHERE id = p_order_id;

    IF v_order_status IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found');
    END IF;

    IF v_order_status != 'production' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order is not in production lifecycle');
    END IF;

    -- 3. Lock & Fetch Production Record
    SELECT id, stage INTO v_prod_id, v_current_stage
    FROM public.production_records
    WHERE order_id = p_order_id
    FOR UPDATE;

    IF v_prod_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Production record not found for this order');
    END IF;

    -- 4. Validate strict stage transition
    IF (v_current_stage = 'production_started' AND p_next_stage = 'cutting') OR
       (v_current_stage = 'cutting' AND p_next_stage = 'stitching') OR
       (v_current_stage = 'stitching' AND p_next_stage = 'finishing') OR
       (v_current_stage = 'finishing' AND p_next_stage = 'production_completed') THEN
        v_is_valid := true;
    END IF;

    IF NOT v_is_valid THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Invalid stage transition from ' || v_current_stage || ' to ' || p_next_stage
        );
    END IF;

    -- 5. Update Production Record
    UPDATE public.production_records
    SET stage = p_next_stage,
        completed_at = CASE WHEN p_next_stage = 'production_completed' THEN now() ELSE completed_at END,
        remarks = COALESCE(p_note, remarks),
        updated_at = now()
    WHERE id = v_prod_id;

    -- 6. Insert Stage History
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
        v_current_stage,
        p_next_stage,
        p_note,
        v_user_id
    );

    RETURN jsonb_build_object(
        'success', true,
        'previous_stage', v_current_stage,
        'new_stage', p_next_stage
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_production(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.advance_production_stage(UUID, TEXT, TEXT) TO authenticated;

COMMIT;
