-- Migration: 20261010000000_production_workflow_final_sequence.sql
-- Module: Production Workflow Final Stage Sequence Correction
-- Sequence:
--   1. Stock Sizes (FIXED)
--   2. Inventory (FIXED)
--   3. Cutting (FIXED)
--   4/5/6. Stitching / Printing / Embroidering (Order-specific reorderable middle stages)
--   7. Checking (FIXED)
--   8. Ironing and Packing (FIXED)

BEGIN;

-- 1. Safely normalize all existing order_production_workflows
-- Temporarily drop the range check and unique sequence constraint to reorder without collision
ALTER TABLE public.order_production_workflows 
    DROP CONSTRAINT IF EXISTS order_production_workflows_sequence_order_check;
ALTER TABLE public.order_production_workflows 
    DROP CONSTRAINT IF EXISTS uq_order_production_workflow_seq;

-- Normalize fixed initial stages
UPDATE public.order_production_workflows
SET sequence_order = 1
WHERE stage_key = 'stock_sizes';

UPDATE public.order_production_workflows
SET sequence_order = 2
WHERE stage_key = 'inventory';

UPDATE public.order_production_workflows
SET sequence_order = 3
WHERE stage_key = 'cutting';

-- Normalize fixed final stages
UPDATE public.order_production_workflows
SET sequence_order = 7
WHERE stage_key = 'checking';

UPDATE public.order_production_workflows
SET sequence_order = 8
WHERE stage_key = 'ironing_packing';

-- Normalize middle stages (stitching, printing, embroidering) preserving relative order
WITH ranked_middle AS (
    SELECT 
        id, 
        3 + ROW_NUMBER() OVER (
            PARTITION BY order_id 
            ORDER BY sequence_order ASC
        ) as new_seq
    FROM public.order_production_workflows
    WHERE stage_key IN ('stitching', 'printing', 'embroidering')
)
UPDATE public.order_production_workflows opw
SET sequence_order = rm.new_seq
FROM ranked_middle rm
WHERE opw.id = rm.id;

-- Re-enable constraints
ALTER TABLE public.order_production_workflows
    ADD CONSTRAINT order_production_workflows_sequence_order_check CHECK (sequence_order >= 1 AND sequence_order <= 8);

ALTER TABLE public.order_production_workflows
    ADD CONSTRAINT uq_order_production_workflow_seq UNIQUE (order_id, sequence_order);

-- 2. Add database CHECK constraint to permanently enforce fixed stage positions
ALTER TABLE public.order_production_workflows 
    DROP CONSTRAINT IF EXISTS chk_order_production_workflow_fixed_stages;

ALTER TABLE public.order_production_workflows
    ADD CONSTRAINT chk_order_production_workflow_fixed_stages CHECK (
        (sequence_order = 1 AND stage_key = 'stock_sizes') OR
        (sequence_order = 2 AND stage_key = 'inventory') OR
        (sequence_order = 3 AND stage_key = 'cutting') OR
        (sequence_order IN (4, 5, 6) AND stage_key IN ('stitching', 'printing', 'embroidering')) OR
        (sequence_order = 7 AND stage_key = 'checking') OR
        (sequence_order = 8 AND stage_key = 'ironing_packing')
    );

-- 3. Update handle_new_order_production_workflow() trigger function
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
        (NEW.id, 'checking', 7, 'pending'),
        (NEW.id, 'ironing_packing', 8, 'pending')
    ON CONFLICT (order_id, stage_key) DO NOTHING;
    RETURN NEW;
END;
$$;

-- 4. Update save_order_production_workflow() RPC with strict position validation
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
    v_idx INTEGER;
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
            'error', 'Production workflow must contain exactly 8 stages.'
        );
    END IF;

    -- 5. Strict Fixed Stage Position Validation
    -- Stage 1 must be Stock Sizes
    IF p_stage_keys[1] != 'stock_sizes' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Stage 1 must be Stock Sizes (stock_sizes).'
        );
    END IF;

    -- Stage 2 must be Inventory
    IF p_stage_keys[2] != 'inventory' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Stage 2 must be Inventory (inventory).'
        );
    END IF;

    -- Stage 3 must be Cutting
    IF p_stage_keys[3] != 'cutting' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Stage 3 must be Cutting (cutting).'
        );
    END IF;

    -- Stage 7 must be Checking
    IF p_stage_keys[7] != 'checking' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Stage 7 must be Checking (checking).'
        );
    END IF;

    -- Stage 8 must be Ironing and Packing
    IF p_stage_keys[8] != 'ironing_packing' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Stage 8 must be Ironing and Packing (ironing_packing).'
        );
    END IF;

    -- 6. Strict Middle Stages Validation (Positions 4, 5, 6)
    IF NOT (p_stage_keys[4] IN ('stitching', 'printing', 'embroidering')) OR
       NOT (p_stage_keys[5] IN ('stitching', 'printing', 'embroidering')) OR
       NOT (p_stage_keys[6] IN ('stitching', 'printing', 'embroidering')) OR
       p_stage_keys[4] = p_stage_keys[5] OR
       p_stage_keys[4] = p_stage_keys[6] OR
       p_stage_keys[5] = p_stage_keys[6] THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Stages 4, 5, and 6 must strictly contain a unique permutation of Stitching, Printing, and Embroidering.'
        );
    END IF;

    -- 7. Atomic replacement: delete existing rows for this order and insert new ordered sequence
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

-- 5. Update start_production fallback
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
            (p_order_id, 'checking', 7, 'pending'),
            (p_order_id, 'ironing_packing', 8, 'pending')
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

COMMIT;
