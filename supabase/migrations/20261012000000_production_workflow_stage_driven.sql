-- Migration: 20261012000000_production_workflow_stage_driven.sql
-- Module: Stage-Driven Middle Sequence Arrangement
-- Rules:
-- 1. Saving middle-stage sequence is strictly forbidden until Stock Sizes, Inventory, and Cutting are ALL completed.
-- 2. Once all 3 initial stages are completed, Admin arranges middle sequence (stitching, printing, embroidering).
-- 3. Saving persists the sequence for that order, activates stage 4, and production executes the exact saved sequence.

BEGIN;

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
    v_prod_id UUID;
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

    -- 3. MANDATORY STAGE-DRIVEN GATE:
    -- Stock Sizes, Inventory, and Cutting MUST ALL be completed before middle sequence can be arranged or saved
    IF NOT EXISTS (
        SELECT 1 FROM public.order_production_workflows
        WHERE order_id = p_order_id AND stage_key = 'stock_sizes' AND status = 'completed'
    ) OR NOT EXISTS (
        SELECT 1 FROM public.order_production_workflows
        WHERE order_id = p_order_id AND stage_key = 'inventory' AND status = 'completed'
    ) OR NOT EXISTS (
        SELECT 1 FROM public.order_production_workflows
        WHERE order_id = p_order_id AND stage_key = 'cutting' AND status = 'completed'
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Cannot arrange middle sequence. Stock Sizes, Inventory, and Cutting must all be completed first.'
        );
    END IF;

    -- 4. Locking check:
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
    SELECT id, stage, completed_quantity 
    INTO v_prod_id, v_existing_prod_stage, v_existing_prod_qty
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

    -- 5. Validate array length = 8
    IF array_length(p_stage_keys, 1) IS DISTINCT FROM 8 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Production workflow must contain exactly 8 stages.'
        );
    END IF;

    -- 6. Strict Fixed Stage Position Validation
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

    -- 7. Strict Middle Stages Validation (Positions 4, 5, 6)
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

    -- 8. Update sequence_order for the middle stages (4, 5, 6) preserving existing history
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

    -- 9. Activate the stage at sequence 4 and synchronize production_records
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
    IF v_prod_id IS NOT NULL THEN
        UPDATE public.production_records
        SET stage = p_stage_keys[4],
            updated_at = now()
        WHERE id = v_prod_id;

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
            'cutting',
            p_stage_keys[4],
            'Middle sequence arranged by Admin: ' || p_stage_keys[4] || ' -> ' || p_stage_keys[5] || ' -> ' || p_stage_keys[6],
            v_user_id
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Production workflow updated successfully.'
    );
END;
$$;

COMMIT;
