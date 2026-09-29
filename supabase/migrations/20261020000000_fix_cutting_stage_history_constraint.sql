-- Migration: 20261020000000_fix_cutting_stage_history_constraint.sql
-- Description: Fix production_stage_history constraint compatibility and correct Cutting completion transition history
-- When Cutting is completed, the history row must record to_stage = [dynamically resolved Stage 4 from saved sequence]
-- instead of non-canonical 'cutting_completed'.

BEGIN;

-- 1. Ensure production_stage_history check constraints strictly and cleanly enforce canonical stages
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

-- 2. Update advance_production_stage RPC so that completing Cutting records to_stage as the dynamic Stage 4
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
    v_user_id UUID;
    v_role TEXT;
    v_prod_id UUID;
    v_current_stage TEXT;
    v_missing_items_count INTEGER;
    v_missing_cutting_count INTEGER;
    v_requirement_id UUID;
    v_order_num TEXT;
    v_current_seq INTEGER;
    v_next_seq INTEGER;
    v_expected_next_stage TEXT;
    v_next_stage_key TEXT;
    v_middle_missing INTEGER;
    v_prev_seq INTEGER;
    v_prev_stage_key TEXT;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
    END IF;

    SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
    IF v_role != 'evenvibe_admin' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized. EvenVibe Admin required.');
    END IF;

    SELECT id, stage INTO v_prod_id, v_current_stage
    FROM public.production_records
    WHERE order_id = p_order_id
    FOR UPDATE;

    IF v_prod_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Production record not found for this order');
    END IF;

    SELECT requirement_id, order_number INTO v_requirement_id, v_order_num
    FROM public.orders
    WHERE id = p_order_id;

    -- =========================================================================
    -- STAGE 1: STOCK SIZES ADVANCEMENT VALIDATION
    -- =========================================================================
    IF v_current_stage = 'stock_sizes' THEN
        IF p_next_stage != 'inventory' THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', format('Invalid transition. Stock Sizes must advance to Inventory, received: %s', p_next_stage)
            );
        END IF;

        UPDATE public.order_production_workflows
        SET status = 'completed',
            completed_at = now(),
            updated_at = now()
        WHERE order_id = p_order_id AND sequence_order = 1;

        UPDATE public.order_production_workflows
        SET status = 'in_progress',
            started_at = now(),
            updated_at = now()
        WHERE order_id = p_order_id AND sequence_order = 2;

        UPDATE public.production_records
        SET stage = 'inventory',
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
            'stock_sizes',
            'inventory',
            COALESCE(p_note, 'Advanced from Stock Sizes to Inventory Material Requirement'),
            v_user_id
        );

        RETURN jsonb_build_object(
            'success', true,
            'from_stage', 'stock_sizes',
            'to_stage', 'inventory'
        );
    END IF;

    -- =========================================================================
    -- STAGE 2: INVENTORY ADVANCEMENT VALIDATION
    -- =========================================================================
    IF v_current_stage = 'inventory' THEN
        IF p_next_stage != 'cutting' THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', format('Invalid transition. Inventory must advance to Cutting, received: %s', p_next_stage)
            );
        END IF;

        WITH required_combinations AS (
            SELECT
                item_name,
                style_id,
                style_name,
                color
            FROM public.requirement_items
            WHERE requirement_id = v_requirement_id
              AND quantity > 0
            GROUP BY item_name, style_id, style_name, color
        )
        SELECT COUNT(*)
        INTO v_missing_items_count
        FROM required_combinations rc
        LEFT JOIN public.order_inventory_materials oim ON (
            oim.order_id = p_order_id
            AND lower(trim(oim.item_name)) = lower(trim(rc.item_name))
            AND COALESCE(oim.style_id::text, 'no_style_id') = COALESCE(rc.style_id::text, 'no_style_id')
            AND COALESCE(lower(trim(oim.style_name)), 'no_style_name') = COALESCE(lower(trim(rc.style_name)), 'no_style_name')
            AND COALESCE(lower(trim(oim.color)), 'no_color') = COALESCE(lower(trim(rc.color)), 'no_color')
        )
        WHERE oim.id IS NULL OR oim.gram_per_piece <= 0;

        IF v_missing_items_count > 0 THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', format('Cannot advance to Cutting. Missing Gram / Piece configuration for %s item style/color combination(s). Every style and color combination must have a positive Gram / Piece value saved.', v_missing_items_count)
            );
        END IF;

        UPDATE public.order_production_workflows
        SET status = 'completed',
            completed_at = COALESCE(completed_at, now()),
            updated_at = now()
        WHERE order_id = p_order_id AND sequence_order = 1 AND status != 'completed';

        UPDATE public.order_production_workflows
        SET status = 'completed',
            completed_at = now(),
            updated_at = now()
        WHERE order_id = p_order_id AND sequence_order = 2;

        UPDATE public.order_production_workflows
        SET status = 'in_progress',
            started_at = now(),
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
            'inventory',
            'cutting',
            COALESCE(p_note, 'Advanced from Inventory Material Requirement to Cutting'),
            v_user_id
        );

        RETURN jsonb_build_object(
            'success', true,
            'from_stage', 'inventory',
            'to_stage', 'cutting'
        );
    END IF;

    -- =========================================================================
    -- STAGE 3: CUTTING ADVANCEMENT / COMPLETION VALIDATION
    -- =========================================================================
    IF v_current_stage = 'cutting' THEN
        IF p_next_stage = 'cutting_completed' OR p_next_stage IN ('stitching', 'printing', 'embroidering') THEN
            WITH required_sizes AS (
                SELECT
                    item_name,
                    style_id,
                    style_name,
                    color,
                    size
                FROM public.requirement_items
                WHERE requirement_id = v_requirement_id
                  AND quantity > 0
                GROUP BY item_name, style_id, style_name, color, size
            )
            SELECT COUNT(*)
            INTO v_missing_cutting_count
            FROM required_sizes rs
            LEFT JOIN public.order_cutting_items oci ON (
                oci.order_id = p_order_id
                AND lower(trim(oci.item_name)) = lower(trim(rs.item_name))
                AND COALESCE(oci.style_id::text, 'no_style_id') = COALESCE(rs.style_id::text, 'no_style_id')
                AND COALESCE(lower(trim(oci.style_name)), 'no_style_name') = COALESCE(lower(trim(rs.style_name)), 'no_style_name')
                AND COALESCE(lower(trim(oci.color)), 'no_color') = COALESCE(lower(trim(rs.color)), 'no_color')
                AND lower(trim(oci.size)) = lower(trim(rs.size))
            )
            WHERE oci.id IS NULL OR oci.cut_quantity IS NULL;

            IF v_missing_cutting_count > 0 THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'error', 'Enter cut quantity for all required sizes before completing Cutting.'
                );
            END IF;

            -- Mark Cutting stage (sequence 3) completed
            UPDATE public.order_production_workflows
            SET status = 'completed',
                completed_at = now(),
                updated_at = now()
            WHERE order_id = p_order_id AND sequence_order = 3;

            -- Authoritatively resolve next stage dynamically from sequence_order = 4
            SELECT stage_key INTO v_next_stage_key
            FROM public.order_production_workflows
            WHERE order_id = p_order_id AND sequence_order = 4;

            IF v_next_stage_key IS NULL THEN
                v_next_stage_key := CASE 
                    WHEN p_next_stage IN ('stitching', 'printing', 'embroidering') THEN p_next_stage
                    ELSE 'stitching'
                END;
            END IF;

            UPDATE public.production_records
            SET stage = 'cutting',
                remarks = COALESCE(p_note, remarks),
                updated_at = now()
            WHERE id = v_prod_id;

            -- Insert stage history with canonical next stage (dynamic stage 4)
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
                v_next_stage_key,
                COALESCE(p_note, format('Cutting stage completed. Next stage is %s.', v_next_stage_key)),
                v_user_id
            );

            RETURN jsonb_build_object(
                'success', true,
                'from_stage', 'cutting',
                'to_stage', v_next_stage_key,
                'cutting_completed', true
            );
        END IF;
    END IF;

    -- =========================================================================
    -- MIDDLE & FINAL STAGES (Sequences 4 through 8)
    -- =========================================================================
    SELECT sequence_order INTO v_current_seq
    FROM public.order_production_workflows
    WHERE order_id = p_order_id AND stage_key = v_current_stage;

    IF v_current_seq IS NOT NULL THEN
        -- If current stage is a middle stage (4, 5, 6), ensure all required sizes have actual mistaked quantity entered
        IF v_current_seq >= 4 AND v_current_seq <= 6 THEN
            v_prev_seq := v_current_seq - 1;
            SELECT stage_key INTO v_prev_stage_key
            FROM public.order_production_workflows
            WHERE order_id = p_order_id AND sequence_order = v_prev_seq;

            IF v_prev_seq = 3 THEN
                SELECT COUNT(*)
                INTO v_middle_missing
                FROM public.order_cutting_items oci
                LEFT JOIN public.order_stage_items osi ON (
                    osi.order_id = p_order_id
                    AND osi.stage_key = v_current_stage
                    AND lower(trim(osi.item_name)) = lower(trim(oci.item_name))
                    AND COALESCE(osi.style_id::text, 'no_style_id') = COALESCE(oci.style_id::text, 'no_style_id')
                    AND COALESCE(lower(trim(osi.style_name)), 'no_style_name') = COALESCE(lower(trim(oci.style_name)), 'no_style_name')
                    AND COALESCE(lower(trim(osi.color)), 'no_color') = COALESCE(lower(trim(oci.color)), 'no_color')
                    AND lower(trim(osi.size)) = lower(trim(oci.size))
                )
                WHERE oci.order_id = p_order_id
                  AND (osi.id IS NULL OR osi.actual_quantity IS NULL);
            ELSE
                SELECT COUNT(*)
                INTO v_middle_missing
                FROM public.order_stage_items prev_osi
                LEFT JOIN public.order_stage_items curr_osi ON (
                    curr_osi.order_id = p_order_id
                    AND curr_osi.stage_key = v_current_stage
                    AND lower(trim(curr_osi.item_name)) = lower(trim(prev_osi.item_name))
                    AND COALESCE(curr_osi.style_id::text, 'no_style_id') = COALESCE(prev_osi.style_id::text, 'no_style_id')
                    AND COALESCE(lower(trim(curr_osi.style_name)), 'no_style_name') = COALESCE(lower(trim(prev_osi.style_name)), 'no_style_name')
                    AND COALESCE(lower(trim(curr_osi.color)), 'no_color') = COALESCE(lower(trim(prev_osi.color)), 'no_color')
                    AND lower(trim(curr_osi.size)) = lower(trim(prev_osi.size))
                )
                WHERE prev_osi.order_id = p_order_id
                  AND prev_osi.stage_key = v_prev_stage_key
                  AND (curr_osi.id IS NULL OR curr_osi.actual_quantity IS NULL);
            END IF;

            IF v_middle_missing > 0 THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'error', 'Enter actual quantity for all required sizes before completing this stage.'
                );
            END IF;
        END IF;

        UPDATE public.order_production_workflows
        SET status = 'completed',
            completed_at = now(),
            updated_at = now()
        WHERE order_id = p_order_id AND sequence_order = v_current_seq;

        IF p_next_stage != 'production_completed' THEN
            SELECT sequence_order INTO v_next_seq
            FROM public.order_production_workflows
            WHERE order_id = p_order_id AND stage_key = p_next_stage;

            IF v_next_seq IS NOT NULL THEN
                UPDATE public.order_production_workflows
                SET status = 'in_progress',
                    started_at = now(),
                    updated_at = now()
                WHERE order_id = p_order_id AND sequence_order = v_next_seq;
            END IF;
        END IF;
    END IF;

    -- Update production record stage
    UPDATE public.production_records
    SET stage = p_next_stage,
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
        v_current_stage,
        p_next_stage,
        p_note,
        v_user_id
    );

    RETURN jsonb_build_object(
        'success', true,
        'from_stage', v_current_stage,
        'to_stage', p_next_stage
    );
END;
$$;

-- 3. Update save_order_production_workflow to prevent duplicate history records
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
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
    END IF;

    SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
    IF v_role != 'evenvibe_admin' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized. EvenVibe Admin required.');
    END IF;

    SELECT status INTO v_order_status
    FROM public.orders
    WHERE id = p_order_id;

    IF v_order_status IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found');
    END IF;

    -- Stage-driven gate: Stock Sizes, Inventory, and Cutting must all be completed
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

    -- Locking checks
    IF v_order_status IN ('quality_check', 'packed', 'dispatched', 'in_transit', 'delivered', 'cancelled') THEN
        v_is_locked := true;
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.order_production_workflows
        WHERE order_id = p_order_id
          AND sequence_order >= 4
          AND status IN ('in_progress', 'completed')
    ) THEN
        v_is_locked := true;
    END IF;

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

    IF array_length(p_stage_keys, 1) IS DISTINCT FROM 8 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Production workflow must contain exactly 8 stages.');
    END IF;

    IF p_stage_keys[1] != 'stock_sizes' OR p_stage_keys[2] != 'inventory' OR p_stage_keys[3] != 'cutting' OR
       p_stage_keys[7] != 'checking' OR p_stage_keys[8] != 'ironing_packing' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Fixed stages (1, 2, 3, 7, 8) cannot be reordered.');
    END IF;

    IF NOT (p_stage_keys[4] IN ('stitching', 'printing', 'embroidering')) OR
       NOT (p_stage_keys[5] IN ('stitching', 'printing', 'embroidering')) OR
       NOT (p_stage_keys[6] IN ('stitching', 'printing', 'embroidering')) OR
       p_stage_keys[4] = p_stage_keys[5] OR
       p_stage_keys[4] = p_stage_keys[6] OR
       p_stage_keys[5] = p_stage_keys[6] THEN
        RETURN jsonb_build_object('success', false, 'error', 'Stages 4, 5, and 6 must strictly contain a unique permutation of Stitching, Printing, and Embroidering.');
    END IF;

    -- Update sequence_order for stages 4, 5, 6
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

    -- Activate stage 4
    UPDATE public.order_production_workflows
    SET status = 'in_progress',
        started_at = COALESCE(started_at, now()),
        updated_at = now()
    WHERE order_id = p_order_id AND sequence_order = 4;

    -- Keep stages 5, 6, 7, 8 as pending
    UPDATE public.order_production_workflows
    SET status = 'pending',
        completed_at = NULL,
        updated_at = now()
    WHERE order_id = p_order_id AND sequence_order IN (5, 6, 7, 8);

    -- Synchronize production_records stage to the new stage 4
    IF v_prod_id IS NOT NULL THEN
        UPDATE public.production_records
        SET stage = p_stage_keys[4],
            updated_at = now()
        WHERE id = v_prod_id;

        -- Record sequence arrangement in history without creating duplicate rows
        IF NOT EXISTS (
            SELECT 1 FROM public.production_stage_history
            WHERE order_id = p_order_id
              AND from_stage = 'cutting'
              AND to_stage = p_stage_keys[4]
        ) THEN
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
        ELSE
            UPDATE public.production_stage_history
            SET note = 'Cutting completed. Sequence arranged: ' || p_stage_keys[4] || ' -> ' || p_stage_keys[5] || ' -> ' || p_stage_keys[6],
                created_at = now()
            WHERE id = (
                SELECT id FROM public.production_stage_history
                WHERE order_id = p_order_id
                  AND from_stage = 'cutting'
                  AND to_stage = p_stage_keys[4]
                ORDER BY created_at DESC
                LIMIT 1
            );
        END IF;
    END IF;

    RETURN jsonb_build_object('success', true, 'message', 'Production workflow saved successfully.');
END;
$$;

COMMIT;
