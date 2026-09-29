-- Migration: 20261008000000_order_production_workflow_sequencing.sql
-- Module: Order-Specific Production Workflow Sequencing
-- Description: Independent 8-stage production sequence per order with strict locking upon production start.

BEGIN;

-- 1. Create public.order_production_workflows table
CREATE TABLE IF NOT EXISTS public.order_production_workflows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    stage_key TEXT NOT NULL,
    sequence_order INTEGER NOT NULL CHECK (sequence_order >= 1 AND sequence_order <= 8),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
    started_at TIMESTAMPTZ NULL,
    completed_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_order_production_workflow_stage UNIQUE (order_id, stage_key),
    CONSTRAINT uq_order_production_workflow_seq UNIQUE (order_id, sequence_order),
    CONSTRAINT chk_order_production_workflow_stage_key CHECK (
        stage_key IN (
            'stock_sizes',
            'inventory',
            'cutting',
            'stitching',
            'printing',
            'embroidering',
            'ironing_packing',
            'checking'
        )
    )
);

-- 2. Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_order_production_workflows_order_id 
    ON public.order_production_workflows(order_id);
CREATE INDEX IF NOT EXISTS idx_order_production_workflows_order_seq 
    ON public.order_production_workflows(order_id, sequence_order);
CREATE INDEX IF NOT EXISTS idx_order_production_workflows_status 
    ON public.order_production_workflows(status);

-- 3. Trigger for updated_at
DROP TRIGGER IF EXISTS set_order_production_workflows_updated_at ON public.order_production_workflows;
CREATE TRIGGER set_order_production_workflows_updated_at
    BEFORE UPDATE ON public.order_production_workflows
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- 4. Row Level Security Policies
ALTER TABLE public.order_production_workflows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "EvenVibe Admins can manage order_production_workflows" ON public.order_production_workflows;
DROP POLICY IF EXISTS "School Admins can view own order_production_workflows" ON public.order_production_workflows;

CREATE POLICY "EvenVibe Admins can manage order_production_workflows"
    ON public.order_production_workflows FOR ALL
    USING (public.get_my_role() = 'evenvibe_admin')
    WITH CHECK (public.get_my_role() = 'evenvibe_admin');

CREATE POLICY "School Admins can view own order_production_workflows"
    ON public.order_production_workflows FOR SELECT
    USING (
        order_id IN (
            SELECT id FROM public.orders WHERE school_id = public.get_my_school_id()
        ) AND public.get_my_role() = 'school_admin'
    );

-- Table Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_production_workflows TO authenticated;
GRANT ALL ON public.order_production_workflows TO service_role;

-- 5. Realtime publication
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
          AND schemaname = 'public' 
          AND tablename = 'order_production_workflows'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.order_production_workflows;
    END IF;
END $$;

-- 6. Widen check constraints on production_records and production_stage_history
ALTER TABLE public.production_records DROP CONSTRAINT IF EXISTS production_records_stage_check;
ALTER TABLE public.production_records ADD CONSTRAINT production_records_stage_check CHECK (
    stage IN (
        'production_started',
        'stock_sizes',
        'inventory',
        'cutting',
        'stitching',
        'printing',
        'embroidering',
        'ironing_packing',
        'checking',
        'finishing',
        'production_completed'
    )
);

ALTER TABLE public.production_stage_history DROP CONSTRAINT IF EXISTS production_stage_history_from_stage_check;
ALTER TABLE public.production_stage_history ADD CONSTRAINT production_stage_history_from_stage_check CHECK (
    from_stage IS NULL OR from_stage IN (
        'production_started',
        'stock_sizes',
        'inventory',
        'cutting',
        'stitching',
        'printing',
        'embroidering',
        'ironing_packing',
        'checking',
        'finishing',
        'production_completed'
    )
);

ALTER TABLE public.production_stage_history DROP CONSTRAINT IF EXISTS production_stage_history_to_stage_check;
ALTER TABLE public.production_stage_history ADD CONSTRAINT production_stage_history_to_stage_check CHECK (
    to_stage IN (
        'production_started',
        'stock_sizes',
        'inventory',
        'cutting',
        'stitching',
        'printing',
        'embroidering',
        'ironing_packing',
        'checking',
        'finishing',
        'production_completed'
    )
);

-- 7. Trigger to automatically initialize default 8-stage sequence on new orders
CREATE OR REPLACE FUNCTION public.handle_new_order_production_workflow()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.order_production_workflows (order_id, stage_key, sequence_order, status)
    VALUES
        (NEW.id, 'stock_sizes', 1, 'pending'),
        (NEW.id, 'inventory', 2, 'pending'),
        (NEW.id, 'cutting', 3, 'pending'),
        (NEW.id, 'stitching', 4, 'pending'),
        (NEW.id, 'printing', 5, 'pending'),
        (NEW.id, 'embroidering', 6, 'pending'),
        (NEW.id, 'ironing_packing', 7, 'pending'),
        (NEW.id, 'checking', 8, 'pending')
    ON CONFLICT (order_id, stage_key) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_initialize_order_production_workflow ON public.orders;
CREATE TRIGGER trigger_initialize_order_production_workflow
    AFTER INSERT ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_order_production_workflow();

-- 8. Safely backfill existing orders without resetting progress or fabricating timestamps
-- A. Completed/Delivered orders: mark all 8 stages completed
INSERT INTO public.order_production_workflows (order_id, stage_key, sequence_order, status, started_at, completed_at)
SELECT 
    o.id,
    w.stage_key,
    w.sequence_order,
    'completed' AS status,
    COALESCE(pr.started_at, o.created_at) AS started_at,
    COALESCE(pr.completed_at, o.updated_at) AS completed_at
FROM public.orders o
LEFT JOIN public.production_records pr ON pr.order_id = o.id
CROSS JOIN (
    VALUES
        ('stock_sizes', 1),
        ('inventory', 2),
        ('cutting', 3),
        ('stitching', 4),
        ('printing', 5),
        ('embroidering', 6),
        ('ironing_packing', 7),
        ('checking', 8)
) AS w(stage_key, sequence_order)
WHERE o.status IN ('quality_check', 'packed', 'dispatched', 'in_transit', 'delivered')
   OR (pr.stage = 'production_completed')
ON CONFLICT (order_id, stage_key) DO NOTHING;

-- B. All other existing orders: initialize as pending
INSERT INTO public.order_production_workflows (order_id, stage_key, sequence_order, status)
SELECT 
    o.id,
    w.stage_key,
    w.sequence_order,
    'pending' AS status
FROM public.orders o
CROSS JOIN (
    VALUES
        ('stock_sizes', 1),
        ('inventory', 2),
        ('cutting', 3),
        ('stitching', 4),
        ('printing', 5),
        ('embroidering', 6),
        ('ironing_packing', 7),
        ('checking', 8)
) AS w(stage_key, sequence_order)
WHERE NOT EXISTS (
    SELECT 1 FROM public.order_production_workflows opw WHERE opw.order_id = o.id
)
ON CONFLICT (order_id, stage_key) DO NOTHING;

-- 9. Atomic RPC to Save Order Workflow (Admin only, rejects if production started)
CREATE OR REPLACE FUNCTION public.save_order_production_workflow(
    p_order_id UUID,
    p_stage_keys TEXT[]
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
    v_has_started BOOLEAN := false;
    v_stage_key TEXT;
    v_idx INTEGER;
    v_allowed_stages TEXT[] := ARRAY[
        'stock_sizes',
        'inventory',
        'cutting',
        'stitching',
        'printing',
        'embroidering',
        'ironing_packing',
        'checking'
    ];
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

    -- 2. Verify Order exists
    SELECT status INTO v_order_status
    FROM public.orders
    WHERE id = p_order_id;

    IF v_order_status IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found');
    END IF;

    -- 3. Locking check: Reject if production has already started
    IF v_order_status IN ('production', 'quality_check', 'packed', 'dispatched', 'in_transit', 'delivered') THEN
        v_has_started := true;
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.production_records WHERE order_id = p_order_id
    ) THEN
        v_has_started := true;
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.order_production_workflows
        WHERE order_id = p_order_id AND status IN ('in_progress', 'completed')
    ) THEN
        v_has_started := true;
    END IF;

    IF v_has_started THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Production workflow is locked because production has already started.'
        );
    END IF;

    -- 4. Validate array length = 8
    IF array_length(p_stage_keys, 1) IS DISTINCT FROM 8 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Workflow must contain exactly 8 stages.'
        );
    END IF;

    -- 5. Validate that all 8 required stages are present with no duplicates
    FOREACH v_stage_key IN ARRAY v_allowed_stages
    LOOP
        IF NOT (v_stage_key = ANY(p_stage_keys)) THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Missing required stage: ' || v_stage_key
            );
        END IF;
    END LOOP;

    -- 6. Atomic replacement: delete existing rows for this order and insert new ordered sequence
    DELETE FROM public.order_production_workflows
    WHERE order_id = p_order_id;

    FOR v_idx IN 1..8 LOOP
        INSERT INTO public.order_production_workflows (
            order_id,
            stage_key,
            sequence_order,
            status,
            created_at,
            updated_at
        ) VALUES (
            p_order_id,
            p_stage_keys[v_idx],
            v_idx,
            'pending',
            now(),
            now()
        );
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Production workflow updated successfully.'
    );
END;
$$;

-- 10. Update start_production RPC
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
    v_first_stage_key TEXT;
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

    -- 4. Ensure workflow exists for this order
    IF NOT EXISTS (SELECT 1 FROM public.order_production_workflows WHERE order_id = p_order_id) THEN
        INSERT INTO public.order_production_workflows (order_id, stage_key, sequence_order, status)
        VALUES
            (p_order_id, 'stock_sizes', 1, 'pending'),
            (p_order_id, 'inventory', 2, 'pending'),
            (p_order_id, 'cutting', 3, 'pending'),
            (p_order_id, 'stitching', 4, 'pending'),
            (p_order_id, 'printing', 5, 'pending'),
            (p_order_id, 'embroidering', 6, 'pending'),
            (p_order_id, 'ironing_packing', 7, 'pending'),
            (p_order_id, 'checking', 8, 'pending')
        ON CONFLICT (order_id, stage_key) DO NOTHING;
    END IF;

    -- Get stage at sequence 1
    SELECT stage_key INTO v_first_stage_key
    FROM public.order_production_workflows
    WHERE order_id = p_order_id AND sequence_order = 1;

    IF v_first_stage_key IS NULL THEN
        v_first_stage_key := 'stock_sizes';
    END IF;

    -- Mark stage at sequence 1 in_progress
    UPDATE public.order_production_workflows
    SET status = 'in_progress',
        started_at = now(),
        updated_at = now()
    WHERE order_id = p_order_id AND sequence_order = 1;

    -- 5. Calculate historical total quantity from requirement_items snapshot
    SELECT COALESCE(SUM(quantity), 0) INTO v_total_qty
    FROM public.requirement_items
    WHERE requirement_id = v_requirement_id;

    -- 6. Update Order status to 'production'
    UPDATE public.orders
    SET status = 'production',
        updated_at = now()
    WHERE id = p_order_id;

    -- 7. Insert order_status_history entry
    INSERT INTO public.order_status_history (
        order_id,
        status,
        note
    ) VALUES (
        p_order_id,
        'production',
        COALESCE(p_remarks, 'Production started')
    );

    -- 8. Insert production_records entry
    INSERT INTO public.production_records (
        order_id,
        stage,
        total_quantity,
        completed_quantity,
        started_at,
        remarks
    ) VALUES (
        p_order_id,
        v_first_stage_key,
        v_total_qty,
        0,
        now(),
        p_remarks
    ) RETURNING id INTO v_new_prod_id;

    -- 9. Insert production_stage_history entry
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
        v_first_stage_key,
        COALESCE(p_remarks, 'Production started at ' || v_first_stage_key),
        v_user_id
    );

    RETURN jsonb_build_object(
        'success', true,
        'production_record_id', v_new_prod_id,
        'total_quantity', v_total_qty,
        'current_stage', v_first_stage_key
    );
END;
$$;

-- 11. Update advance_production_stage RPC
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
    v_current_seq INTEGER;
    v_current_stage_key TEXT;
    v_next_seq INTEGER;
    v_expected_next_stage_key TEXT;
    v_total_qty INTEGER;
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
    SELECT id, total_quantity INTO v_prod_id, v_total_qty
    FROM public.production_records
    WHERE order_id = p_order_id
    FOR UPDATE;

    IF v_prod_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Production record not found for this order');
    END IF;

    -- 4. Find the currently in_progress stage in order_production_workflows
    SELECT sequence_order, stage_key
    INTO v_current_seq, v_current_stage_key
    FROM public.order_production_workflows
    WHERE order_id = p_order_id AND status = 'in_progress'
    ORDER BY sequence_order ASC
    LIMIT 1;

    -- If no stage is currently in_progress, fallback: check first pending stage
    IF v_current_seq IS NULL THEN
        SELECT sequence_order, stage_key
        INTO v_current_seq, v_current_stage_key
        FROM public.order_production_workflows
        WHERE order_id = p_order_id AND status = 'pending'
        ORDER BY sequence_order ASC
        LIMIT 1;
        
        IF v_current_seq IS NOT NULL THEN
            UPDATE public.order_production_workflows
            SET status = 'in_progress', started_at = now()
            WHERE order_id = p_order_id AND sequence_order = v_current_seq;
        END IF;
    END IF;

    IF v_current_seq IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No active production stage found for this order');
    END IF;

    -- Determine expected next stage
    IF v_current_seq < 8 THEN
        v_next_seq := v_current_seq + 1;
        SELECT stage_key INTO v_expected_next_stage_key
        FROM public.order_production_workflows
        WHERE order_id = p_order_id AND sequence_order = v_next_seq;
    ELSE
        v_next_seq := NULL;
        v_expected_next_stage_key := 'production_completed';
    END IF;

    -- Validate requested next stage
    IF p_next_stage != v_expected_next_stage_key THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Invalid stage transition for this order workflow. Expected next stage: ' || v_expected_next_stage_key || ', but received: ' || p_next_stage
        );
    END IF;

    -- 5. Complete current stage
    UPDATE public.order_production_workflows
    SET status = 'completed',
        completed_at = now(),
        updated_at = now()
    WHERE order_id = p_order_id AND sequence_order = v_current_seq;

    -- 6. Advance to next stage or complete production
    IF v_expected_next_stage_key = 'production_completed' THEN
        -- Production completed: keep completed_quantity in sync
        UPDATE public.production_records
        SET stage = 'production_completed',
            completed_at = now(),
            completed_quantity = v_total_qty,
            remarks = COALESCE(p_note, remarks),
            updated_at = now()
        WHERE id = v_prod_id;
    ELSE
        -- Start next stage
        UPDATE public.order_production_workflows
        SET status = 'in_progress',
            started_at = now(),
            updated_at = now()
        WHERE order_id = p_order_id AND sequence_order = v_next_seq;

        UPDATE public.production_records
        SET stage = v_expected_next_stage_key,
            remarks = COALESCE(p_note, remarks),
            updated_at = now()
        WHERE id = v_prod_id;
    END IF;

    -- 7. Insert Stage History
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
        v_current_stage_key,
        v_expected_next_stage_key,
        p_note,
        v_user_id
    );

    RETURN jsonb_build_object(
        'success', true,
        'previous_stage', v_current_stage_key,
        'new_stage', v_expected_next_stage_key,
        'completed_sequence', v_current_seq,
        'next_sequence', v_next_seq
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_order_production_workflow(UUID, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_order_production_workflow(UUID, TEXT[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.start_production(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_production(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.advance_production_stage(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.advance_production_stage(UUID, TEXT, TEXT) TO service_role;

COMMIT;
