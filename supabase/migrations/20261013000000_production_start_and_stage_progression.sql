-- Migration: 20261013000000_production_start_and_stage_progression.sql
-- Module: Production Start and Stage Progression
-- Rules:
-- 1. Initial State: All 8 stages pending.
-- 2. Start Production: Activates ONLY Stock Sizes to 'in_progress', marks orders.status = 'production'.
-- 3. Stage-by-Stage: Inventory cannot start before Stock Sizes completes; Cutting cannot start before Inventory completes.
-- 4. Middle Stage Gate: Stitching, Printing, Embroidering arrangement unlocks ONLY after Cutting completes.
-- 5. Lock Rule: Once the first middle production stage starts, the sequence is permanently locked.
-- 6. Order Independence: Each order has its own independent workflow and sequence.

BEGIN;

-- 1. Update start_production RPC
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
    v_has_active_stage BOOLEAN := false;
BEGIN
    -- A. Verify Authentication & Role
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
    END IF;

    SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
    IF v_role != 'evenvibe_admin' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized. EvenVibe Admin required.');
    END IF;

    -- B. Lock & Fetch Order
    SELECT status, requirement_id INTO v_order_status, v_requirement_id
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF v_order_status IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found');
    END IF;

    -- Allow orders in confirmed, submitted, or production status (ready to start)
    IF v_order_status NOT IN ('confirmed', 'submitted', 'production') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order status must be confirmed, submitted, or production to start production. Current status: ' || v_order_status);
    END IF;

    -- C. Ensure 8-stage workflow definition exists for this order
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

    -- Check if any stage has already completed or is already in progress
    SELECT EXISTS (
        SELECT 1 FROM public.order_production_workflows
        WHERE order_id = p_order_id AND status IN ('in_progress', 'completed')
    ) INTO v_has_active_stage;

    -- Check existing production record
    SELECT id INTO v_existing_prod_id
    FROM public.production_records
    WHERE order_id = p_order_id;

    -- If already actively in progress or completed, return success or error
    IF v_has_active_stage AND v_existing_prod_id IS NOT NULL THEN
        RETURN jsonb_build_object('success', true, 'message', 'Production already started', 'order_id', p_order_id);
    END IF;

    -- D. Calculate total quantity from requirement items
    SELECT COALESCE(SUM(quantity), 0) INTO v_total_qty
    FROM public.requirement_items
    WHERE requirement_id = v_requirement_id;

    -- E. Reset/Ensure Stage 1 is Stock Sizes and set to 'in_progress'
    UPDATE public.order_production_workflows
    SET status = 'in_progress',
        started_at = now(),
        completed_at = NULL,
        updated_at = now()
    WHERE order_id = p_order_id AND sequence_order = 1;

    -- Ensure stages 2..8 are pending
    UPDATE public.order_production_workflows
    SET status = 'pending',
        started_at = NULL,
        completed_at = NULL,
        updated_at = now()
    WHERE order_id = p_order_id AND sequence_order > 1;

    -- F. Update Order status to 'production'
    UPDATE public.orders
    SET status = 'production',
        updated_at = now()
    WHERE id = p_order_id;

    -- G. Insert or update production_records entry
    IF v_existing_prod_id IS NOT NULL THEN
        UPDATE public.production_records
        SET stage = 'stock_sizes',
            total_quantity = v_total_qty,
            started_at = now(),
            remarks = COALESCE(p_remarks, remarks),
            updated_at = now()
        WHERE id = v_existing_prod_id
        RETURNING id INTO v_new_prod_id;
    ELSE
        INSERT INTO public.production_records (
            order_id,
            stage,
            total_quantity,
            completed_quantity,
            started_at,
            remarks
        ) VALUES (
            p_order_id,
            'stock_sizes',
            v_total_qty,
            0,
            now(),
            p_remarks
        ) RETURNING id INTO v_new_prod_id;
    END IF;

    -- H. Insert production_stage_history entry
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
        'stock_sizes',
        COALESCE(p_remarks, 'Production started with Stock Sizes'),
        v_user_id
    );

    -- I. Insert order_status_history entry
    INSERT INTO public.order_status_history (
        order_id,
        status,
        note
    ) VALUES (
        p_order_id,
        'production',
        COALESCE(p_remarks, 'Production started')
    );

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'total_quantity', v_total_qty,
        'stage', 'stock_sizes'
    );
END;
$$;

-- 2. Update advance_production_stage RPC
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
    -- A. Verify Authentication & Role
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
    END IF;

    SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
    IF v_role != 'evenvibe_admin' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized. EvenVibe Admin required.');
    END IF;

    -- B. Verify Order
    SELECT status INTO v_order_status
    FROM public.orders
    WHERE id = p_order_id;

    IF v_order_status IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found');
    END IF;

    IF v_order_status != 'production' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order is not in production lifecycle');
    END IF;

    -- C. Lock & Fetch Production Record
    SELECT id, total_quantity INTO v_prod_id, v_total_qty
    FROM public.production_records
    WHERE order_id = p_order_id
    FOR UPDATE;

    IF v_prod_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Production record not found for this order');
    END IF;

    -- D. Find the currently in_progress stage in order_production_workflows
    SELECT sequence_order, stage_key
    INTO v_current_seq, v_current_stage_key
    FROM public.order_production_workflows
    WHERE order_id = p_order_id AND status = 'in_progress'
    ORDER BY sequence_order ASC
    LIMIT 1;

    IF v_current_seq IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No active production stage currently in progress for this order');
    END IF;

    -- E. Handle Stage-Specific Transitions
    IF v_current_seq = 3 THEN
        -- Current stage is Cutting
        IF p_next_stage IN ('cutting_completed', 'complete_cutting') THEN
            -- Complete cutting without auto-starting middle stage, so Admin can arrange middle sequence
            UPDATE public.order_production_workflows
            SET status = 'completed',
                completed_at = now(),
                updated_at = now()
            WHERE order_id = p_order_id AND sequence_order = 3;

            UPDATE public.production_records
            SET stage = 'cutting',
                remarks = COALESCE(p_note, remarks),
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
                'cutting',
                COALESCE(p_note, 'Cutting completed. Ready to arrange middle production sequence.'),
                v_user_id
            );

            RETURN jsonb_build_object(
                'success', true,
                'previous_stage', 'cutting',
                'new_stage', 'cutting',
                'completed_sequence', 3,
                'cutting_completed', true
            );
        END IF;
    END IF;

    -- Determine standard expected next stage
    IF v_current_seq < 8 THEN
        v_next_seq := v_current_seq + 1;
        SELECT stage_key INTO v_expected_next_stage_key
        FROM public.order_production_workflows
        WHERE order_id = p_order_id AND sequence_order = v_next_seq;
    ELSE
        v_next_seq := NULL;
        v_expected_next_stage_key := 'production_completed';
    END IF;

    -- Validate requested next stage against expected next stage
    IF p_next_stage != v_expected_next_stage_key THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Invalid stage transition for this order workflow. Expected next stage: ' || v_expected_next_stage_key || ', but received: ' || p_next_stage
        );
    END IF;

    -- F. Mark current stage as completed
    UPDATE public.order_production_workflows
    SET status = 'completed',
        completed_at = now(),
        updated_at = now()
    WHERE order_id = p_order_id AND sequence_order = v_current_seq;

    -- G. Advance to next stage or complete production
    IF v_expected_next_stage_key = 'production_completed' THEN
        UPDATE public.production_records
        SET stage = 'production_completed',
            completed_at = now(),
            completed_quantity = v_total_qty,
            remarks = COALESCE(p_note, remarks),
            updated_at = now()
        WHERE id = v_prod_id;
    ELSE
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

    -- H. Insert Stage History
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

-- 3. Update save_order_production_workflow with strict locking rule
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

    -- B. Once middle production starts (any stage >= 4 is 'in_progress' or 'completed')
    IF EXISTS (
        SELECT 1 FROM public.order_production_workflows
        WHERE order_id = p_order_id
          AND sequence_order >= 4
          AND status IN ('in_progress', 'completed')
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

    -- 9. Activate stage 4 and synchronize production_records
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

GRANT EXECUTE ON FUNCTION public.start_production(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_production(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.advance_production_stage(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.advance_production_stage(UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.save_order_production_workflow(UUID, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_order_production_workflow(UUID, TEXT[]) TO service_role;

COMMIT;
