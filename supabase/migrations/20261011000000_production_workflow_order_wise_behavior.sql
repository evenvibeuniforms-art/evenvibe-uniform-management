-- Migration: 20261011000000_production_workflow_order_wise_behavior.sql
-- Module: Production Workflow Final Order-Wise Sequence Behavior
-- Features:
--   1. Sequence order uniqueness constraint made DEFERRABLE.
--   2. save_order_production_workflow() updated with correct locking semantics:
--      - Admin can arrange middle stages before production starts or after the first 3 stages complete.
--      - Locks once middle stages begin progressing (any middle stage completed or worked on).
--      - Preserves statuses and timestamps of existing stages.
--      - Automatically activates sequence 4 stage when Cutting is finished.

BEGIN;

-- 1. Make unique sequence constraint deferrable for clean atomic re-ordering
ALTER TABLE public.order_production_workflows
    DROP CONSTRAINT IF EXISTS uq_order_production_workflow_seq;

ALTER TABLE public.order_production_workflows
    ADD CONSTRAINT uq_order_production_workflow_seq 
    UNIQUE (order_id, sequence_order) 
    DEFERRABLE INITIALLY DEFERRED;

-- 2. Update save_order_production_workflow() RPC
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
    v_cutting_status TEXT;
    v_existing_prod_stage TEXT;
    v_existing_prod_qty INTEGER;
    v_is_locked BOOLEAN := false;
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

    -- 3. Locking check:
    -- A. If order has completed production or moved to QC / packing / delivery lifecycle
    IF v_order_status IN ('quality_check', 'packed', 'dispatched', 'in_transit', 'delivered', 'cancelled') THEN
        v_is_locked := true;
    END IF;

    -- B. If any stage in positions 4, 5, 6, 7, 8 is already 'completed'
    IF EXISTS (
        SELECT 1 FROM public.order_production_workflows
        WHERE order_id = p_order_id
          AND sequence_order >= 4
          AND status = 'completed'
    ) THEN
        v_is_locked := true;
    END IF;

    -- C. If any work/quantity has already been recorded on middle stages
    SELECT stage, completed_quantity 
    INTO v_existing_prod_stage, v_existing_prod_qty
    FROM public.production_records
    WHERE order_id = p_order_id;

    IF v_existing_prod_stage IN ('stitching', 'printing', 'embroidering', 'checking', 'ironing_packing', 'production_completed')
       AND COALESCE(v_existing_prod_qty, 0) > 0 THEN
        v_is_locked := true;
    END IF;

    IF v_is_locked THEN
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
    IF p_stage_keys[1] != 'stock_sizes' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Stage 1 must be Stock Sizes (stock_sizes).'
        );
    END IF;

    IF p_stage_keys[2] != 'inventory' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Stage 2 must be Inventory (inventory).'
        );
    END IF;

    IF p_stage_keys[3] != 'cutting' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Stage 3 must be Cutting (cutting).'
        );
    END IF;

    IF p_stage_keys[7] != 'checking' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Stage 7 must be Checking (checking).'
        );
    END IF;

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

    -- 7. Update sequence_order for the middle stages (4, 5, 6) preserving existing history
    UPDATE public.order_production_workflows AS opw
    SET sequence_order = v.new_seq,
        updated_at = now()
    FROM (
        VALUES
            (p_stage_keys[4], 4),
            (p_stage_keys[5], 5),
            (p_stage_keys[6], 6)
    ) AS v(stage_key, new_seq)
    WHERE opw.order_id = p_order_id AND opw.stage_key = v.stage_key;

    -- 8. If Cutting is completed, ensure sequence 4 is active and production record matches
    SELECT status INTO v_cutting_status
    FROM public.order_production_workflows
    WHERE order_id = p_order_id AND stage_key = 'cutting';

    IF v_cutting_status = 'completed' THEN
        -- Activate the stage at sequence 4
        UPDATE public.order_production_workflows
        SET status = 'in_progress',
            started_at = COALESCE(started_at, now()),
            updated_at = now()
        WHERE order_id = p_order_id AND sequence_order = 4;

        -- Keep stages 5 and 6 as pending
        UPDATE public.order_production_workflows
        SET status = 'pending',
            completed_at = NULL,
            updated_at = now()
        WHERE order_id = p_order_id AND sequence_order IN (5, 6);

        -- Keep stages 7 and 8 as pending
        UPDATE public.order_production_workflows
        SET status = 'pending',
            completed_at = NULL,
            updated_at = now()
        WHERE order_id = p_order_id AND sequence_order IN (7, 8);

        -- Synchronize production_records stage to the new stage 4
        UPDATE public.production_records
        SET stage = p_stage_keys[4],
            updated_at = now()
        WHERE order_id = p_order_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Production workflow updated successfully.'
    );
END;
$$;

COMMIT;
