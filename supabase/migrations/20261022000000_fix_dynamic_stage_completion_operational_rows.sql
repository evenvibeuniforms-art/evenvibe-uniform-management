-- Migration: 20261022000000_fix_dynamic_stage_completion_operational_rows.sql
-- Description: Fix dynamic stage completion validation to authoritative current stage operational rows.
-- 1. Only rows with previous_stage_output > 0 are operational rows required for completion.
-- 2. Zero-output rows from previous stages (cut_quantity <= 0 or prev output <= 0) are excluded from completion validation.
-- 3. Actual mistaked quantity = 0 is strictly complete (0 IS NOT NULL).
-- 4. Normalizes style_id, style_name, and color to prevent false validation mismatches.
-- 5. Updates complete_order_stage, advance_production_stage, and save_order_stage_items.

BEGIN;

-- =========================================================================
-- 1. RPC: save_order_stage_items
-- =========================================================================
CREATE OR REPLACE FUNCTION public.save_order_stage_items(
    p_order_id UUID,
    p_stage_key TEXT,
    p_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_role TEXT;
    v_order_status TEXT;
    v_seq_order INTEGER;
    v_prev_seq INTEGER;
    v_prev_stage_key TEXT;
    v_prev_stage_status TEXT;
    v_item JSONB;
    v_item_name TEXT;
    v_style_id UUID;
    v_style_name TEXT;
    v_color TEXT;
    v_size TEXT;
    v_actual_qty INTEGER;
    v_client_input_qty INTEGER;
    v_auth_input_qty INTEGER;
    v_count INTEGER := 0;
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

    -- 2. Verify Order
    SELECT status INTO v_order_status FROM public.orders WHERE id = p_order_id;
    IF v_order_status IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found');
    END IF;

    -- 3. Resolve sequence order of p_stage_key
    SELECT sequence_order INTO v_seq_order
    FROM public.order_production_workflows
    WHERE order_id = p_order_id AND stage_key = p_stage_key;

    IF v_seq_order IS NULL OR v_seq_order < 4 OR v_seq_order > 7 THEN
        RETURN jsonb_build_object('success', false, 'error', format('Invalid dynamic stage key: %s', p_stage_key));
    END IF;

    -- 4. Verify previous stage is completed
    v_prev_seq := v_seq_order - 1;
    SELECT stage_key, status INTO v_prev_stage_key, v_prev_stage_status
    FROM public.order_production_workflows
    WHERE order_id = p_order_id AND sequence_order = v_prev_seq;

    IF v_prev_stage_status != 'completed' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', format('Previous stage (%s) must be completed before saving %s.', v_prev_stage_key, p_stage_key)
        );
    END IF;

    -- 5. Process and validate each item
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_item_name := trim(v_item->>'item_name');
        IF v_item->>'style_id' IS NOT NULL AND v_item->>'style_id' != '' THEN
            v_style_id := (v_item->>'style_id')::UUID;
        ELSE
            v_style_id := NULL;
        END IF;
        v_style_name := NULLIF(trim(v_item->>'style_name'), '');
        v_color := NULLIF(trim(v_item->>'color'), '');
        v_size := trim(v_item->>'size');

        IF v_item_name IS NULL OR v_item_name = '' OR v_size IS NULL OR v_size = '' THEN
            RETURN jsonb_build_object('success', false, 'error', 'Item name and size are required for all rows.');
        END IF;

        -- Extract actual mistaked quantity (0 is completely valid)
        BEGIN
            v_actual_qty := (v_item->>'actual_quantity')::INTEGER;
        EXCEPTION WHEN OTHERS THEN
            RETURN jsonb_build_object('success', false, 'error', format('Invalid actual quantity for %s (%s).', v_item_name, v_size));
        END;

        IF v_actual_qty IS NULL OR v_actual_qty < 0 THEN
            RETURN jsonb_build_object('success', false, 'error', format('Actual mistaked quantity for %s (%s) must be 0 or greater.', v_item_name, v_size));
        END IF;

        -- Derive Authoritative Previous Stage Output (which is this stage's input)
        IF v_prev_seq = 3 THEN
            -- Previous stage is Cutting: output is Cut Quantity (cut_quantity) from order_cutting_items
            SELECT cut_quantity INTO v_auth_input_qty
            FROM public.order_cutting_items
            WHERE order_id = p_order_id
              AND lower(trim(item_name)) = lower(v_item_name)
              AND COALESCE(NULLIF(trim(style_id::text), ''), 'no_style_id') = COALESCE(NULLIF(trim(v_style_id::text), ''), 'no_style_id')
              AND COALESCE(NULLIF(lower(trim(style_name)), ''), 'no_style_name') = COALESCE(NULLIF(lower(trim(v_style_name)), ''), 'no_style_name')
              AND COALESCE(NULLIF(lower(trim(color)), ''), 'no_color') = COALESCE(NULLIF(lower(trim(v_color)), ''), 'no_color')
              AND lower(trim(size)) = lower(v_size);
        ELSE
            -- Previous stage is middle stage (4, 5, or 6): output is result_quantity (input_quantity - actual_quantity)
            SELECT (input_quantity - actual_quantity) INTO v_auth_input_qty
            FROM public.order_stage_items
            WHERE order_id = p_order_id
              AND stage_key = v_prev_stage_key
              AND lower(trim(item_name)) = lower(v_item_name)
              AND COALESCE(NULLIF(trim(style_id::text), ''), 'no_style_id') = COALESCE(NULLIF(trim(v_style_id::text), ''), 'no_style_id')
              AND COALESCE(NULLIF(lower(trim(style_name)), ''), 'no_style_name') = COALESCE(NULLIF(lower(trim(v_style_name)), ''), 'no_style_name')
              AND COALESCE(NULLIF(lower(trim(color)), ''), 'no_color') = COALESCE(NULLIF(lower(trim(v_color)), ''), 'no_color')
              AND lower(trim(size)) = lower(v_size);
        END IF;

        IF v_auth_input_qty IS NULL THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', format('No previous stage output found for %s (%s) from %s.', v_item_name, v_size, v_prev_stage_key)
            );
        END IF;

        -- ZERO-OUTPUT FILTER PROTECTION:
        -- Operational rows cannot be created if previous stage output is <= 0
        IF v_auth_input_qty <= 0 THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', format('Cannot save operational row for %s (%s) because previous stage produced 0 output.', v_item_name, v_size)
            );
        END IF;

        -- NEGATIVE OUTPUT PROTECTION:
        -- Actual mistaked quantity cannot exceed authoritative input quantity
        IF v_actual_qty > v_auth_input_qty THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', format('Actual mistaked quantity (%s) cannot exceed input quantity (%s) for %s (%s).', v_actual_qty, v_auth_input_qty, v_item_name, v_size)
            );
        END IF;

        -- Client input validation: reject fabricated input quantity
        IF v_item->>'input_quantity' IS NOT NULL THEN
            BEGIN
                v_client_input_qty := (v_item->>'input_quantity')::INTEGER;
                IF v_client_input_qty != v_auth_input_qty THEN
                    RETURN jsonb_build_object(
                        'success', false,
                        'error', 'Stage input does not match the previous stage output.'
                    );
                END IF;
            EXCEPTION WHEN OTHERS THEN
                RETURN jsonb_build_object('success', false, 'error', 'Stage input does not match the previous stage output.');
            END;
        END IF;

        -- Upsert record into order_stage_items
        INSERT INTO public.order_stage_items (
            order_id,
            stage_key,
            sequence_order,
            item_name,
            style_id,
            style_name,
            color,
            size,
            input_quantity,
            actual_quantity,
            status,
            updated_at
        ) VALUES (
            p_order_id,
            p_stage_key,
            v_seq_order,
            v_item_name,
            v_style_id,
            v_style_name,
            v_color,
            v_size,
            v_auth_input_qty,
            v_actual_qty,
            'completed',
            now()
        )
        ON CONFLICT (
            order_id,
            stage_key,
            item_name,
            COALESCE(style_id::text, 'no_style_id'),
            COALESCE(style_name, 'no_style_name'),
            COALESCE(color, 'no_color'),
            size
        )
        DO UPDATE SET
            input_quantity = EXCLUDED.input_quantity,
            actual_quantity = EXCLUDED.actual_quantity,
            status = 'completed',
            updated_at = now();

        v_count := v_count + 1;
    END LOOP;

    RETURN jsonb_build_object('success', true, 'saved_count', v_count);
END;
$$;


-- =========================================================================
-- 2. RPC: complete_order_stage
-- =========================================================================
CREATE OR REPLACE FUNCTION public.complete_order_stage(
    p_order_id UUID,
    p_stage_key TEXT,
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
    v_seq_order INTEGER;
    v_prev_seq INTEGER;
    v_prev_stage_key TEXT;
    v_next_seq INTEGER;
    v_next_stage_key TEXT;
    v_total_operational INTEGER := 0;
    v_missing_count INTEGER := 0;
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

    -- 3. Resolve sequence order of p_stage_key
    SELECT sequence_order INTO v_seq_order
    FROM public.order_production_workflows
    WHERE order_id = p_order_id AND stage_key = p_stage_key;

    IF v_seq_order IS NULL OR v_seq_order < 4 OR v_seq_order > 7 THEN
        RETURN jsonb_build_object('success', false, 'error', format('Invalid dynamic stage key: %s', p_stage_key));
    END IF;

    -- 4. Check that every OPERATIONAL row (previous stage output > 0) has an actual mistaked quantity entered
    v_prev_seq := v_seq_order - 1;
    SELECT stage_key INTO v_prev_stage_key
    FROM public.order_production_workflows
    WHERE order_id = p_order_id AND sequence_order = v_prev_seq;

    IF v_prev_seq = 3 THEN
        -- Check total operational rows available from Cutting (cut_quantity > 0)
        SELECT COUNT(*)
        INTO v_total_operational
        FROM public.order_cutting_items oci
        WHERE oci.order_id = p_order_id
          AND oci.cut_quantity > 0;

        IF v_total_operational = 0 THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'No operational pieces available from the previous stage.'
            );
        END IF;

        -- Previous stage is Cutting: validate ONLY rows where cut_quantity > 0
        -- Zero-output cutting rows (cut_quantity <= 0) are NOT required operational rows.
        -- 0 actual_quantity is strictly complete (0 IS NOT NULL).
        SELECT COUNT(*)
        INTO v_missing_count
        FROM public.order_cutting_items oci
        LEFT JOIN public.order_stage_items osi ON (
            osi.order_id = p_order_id
            AND osi.stage_key = p_stage_key
            AND lower(trim(osi.item_name)) = lower(trim(oci.item_name))
            AND COALESCE(NULLIF(trim(osi.style_id::text), ''), 'no_style_id') = COALESCE(NULLIF(trim(oci.style_id::text), ''), 'no_style_id')
            AND COALESCE(NULLIF(lower(trim(osi.style_name)), ''), 'no_style_name') = COALESCE(NULLIF(lower(trim(oci.style_name)), ''), 'no_style_name')
            AND COALESCE(NULLIF(lower(trim(osi.color)), ''), 'no_color') = COALESCE(NULLIF(lower(trim(oci.color)), ''), 'no_color')
            AND lower(trim(osi.size)) = lower(trim(oci.size))
        )
        WHERE oci.order_id = p_order_id
          AND oci.cut_quantity > 0
          AND (osi.id IS NULL OR osi.actual_quantity IS NULL);
    ELSE
        -- Check total operational rows available from previous dynamic stage (output > 0)
        SELECT COUNT(*)
        INTO v_total_operational
        FROM public.order_stage_items prev_osi
        WHERE prev_osi.order_id = p_order_id
          AND prev_osi.stage_key = v_prev_stage_key
          AND (prev_osi.input_quantity - prev_osi.actual_quantity) > 0;

        IF v_total_operational = 0 THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'No operational pieces available from the previous stage.'
            );
        END IF;

        -- Previous stage is middle stage (4, 5, 6): validate ONLY rows where previous output > 0
        -- Zero-output rows from previous stage are NOT required operational rows.
        -- 0 actual_quantity is strictly complete (0 IS NOT NULL).
        SELECT COUNT(*)
        INTO v_missing_count
        FROM public.order_stage_items prev_osi
        LEFT JOIN public.order_stage_items curr_osi ON (
            curr_osi.order_id = p_order_id
            AND curr_osi.stage_key = p_stage_key
            AND lower(trim(curr_osi.item_name)) = lower(trim(prev_osi.item_name))
            AND COALESCE(NULLIF(trim(curr_osi.style_id::text), ''), 'no_style_id') = COALESCE(NULLIF(trim(prev_osi.style_id::text), ''), 'no_style_id')
            AND COALESCE(NULLIF(lower(trim(curr_osi.style_name)), ''), 'no_style_name') = COALESCE(NULLIF(lower(trim(prev_osi.style_name)), ''), 'no_style_name')
            AND COALESCE(NULLIF(lower(trim(curr_osi.color)), ''), 'no_color') = COALESCE(NULLIF(lower(trim(prev_osi.color)), ''), 'no_color')
            AND lower(trim(curr_osi.size)) = lower(trim(prev_osi.size))
        )
        WHERE prev_osi.order_id = p_order_id
          AND prev_osi.stage_key = v_prev_stage_key
          AND (prev_osi.input_quantity - prev_osi.actual_quantity) > 0
          AND (curr_osi.id IS NULL OR curr_osi.actual_quantity IS NULL);
    END IF;

    IF v_missing_count > 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Enter actual quantity for all required sizes before completing this stage.'
        );
    END IF;

    -- 5. Mark current stage completed
    UPDATE public.order_production_workflows
    SET status = 'completed',
        completed_at = now(),
        updated_at = now()
    WHERE order_id = p_order_id AND sequence_order = v_seq_order;

    -- 6. Advance next stage
    v_next_seq := v_seq_order + 1;
    IF v_next_seq <= 8 THEN
        SELECT stage_key INTO v_next_stage_key
        FROM public.order_production_workflows
        WHERE order_id = p_order_id AND sequence_order = v_next_seq;

        UPDATE public.order_production_workflows
        SET status = 'in_progress',
            started_at = now(),
            updated_at = now()
        WHERE order_id = p_order_id AND sequence_order = v_next_seq;

        UPDATE public.production_records
        SET stage = v_next_stage_key,
            remarks = COALESCE(p_note, remarks),
            updated_at = now()
        WHERE id = v_prod_id;
    ELSE
        v_next_stage_key := 'production_completed';
        UPDATE public.production_records
        SET stage = 'production_completed',
            completed_at = now(),
            remarks = COALESCE(p_note, remarks),
            updated_at = now()
        WHERE id = v_prod_id;
    END IF;

    -- 7. Add stage history
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
        p_stage_key,
        v_next_stage_key,
        COALESCE(p_note, format('%s completed. Advanced to %s.', p_stage_key, v_next_stage_key)),
        v_user_id
    );

    RETURN jsonb_build_object(
        'success', true,
        'completed_stage', p_stage_key,
        'next_stage', v_next_stage_key
    );
END;
$$;


-- =========================================================================
-- 3. RPC: advance_production_stage
-- =========================================================================
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
    v_total_operational INTEGER := 0;
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
    -- INVENTORY -> CUTTING TRANSITION (Stage 2 -> Stage 3)
    -- =========================================================================
    IF v_current_stage = 'inventory' AND p_next_stage = 'cutting' THEN
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
            AND COALESCE(NULLIF(trim(oim.style_id::text), ''), 'no_style_id') = COALESCE(NULLIF(trim(rc.style_id::text), ''), 'no_style_id')
            AND COALESCE(NULLIF(lower(trim(oim.style_name)), ''), 'no_style_name') = COALESCE(NULLIF(lower(trim(rc.style_name)), ''), 'no_style_name')
            AND COALESCE(NULLIF(lower(trim(oim.color)), ''), 'no_color') = COALESCE(NULLIF(lower(trim(rc.color)), ''), 'no_color')
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
            COALESCE(p_note, 'Advanced from Inventory to Cutting with complete Gram/Piece configuration.'),
            v_user_id
        );

        RETURN jsonb_build_object(
            'success', true,
            'from_stage', 'inventory',
            'to_stage', 'cutting'
        );
    END IF;

    -- =========================================================================
    -- CUTTING COMPLETION (Stage 3 -> Dynamic Stage 4)
    -- =========================================================================
    IF v_current_stage = 'cutting' THEN
        SELECT COUNT(*)
        INTO v_missing_cutting_count
        FROM public.requirement_items ri
        LEFT JOIN public.order_cutting_items oci ON (
            oci.order_id = p_order_id
            AND lower(trim(oci.item_name)) = lower(trim(ri.item_name))
            AND COALESCE(NULLIF(trim(oci.style_id::text), ''), 'no_style_id') = COALESCE(NULLIF(trim(ri.style_id::text), ''), 'no_style_id')
            AND COALESCE(NULLIF(lower(trim(oci.style_name)), ''), 'no_style_name') = COALESCE(NULLIF(lower(trim(ri.style_name)), ''), 'no_style_name')
            AND COALESCE(NULLIF(lower(trim(oci.color)), ''), 'no_color') = COALESCE(NULLIF(lower(trim(ri.color)), ''), 'no_color')
            AND lower(trim(oci.size)) = lower(trim(ri.size))
        )
        WHERE ri.requirement_id = v_requirement_id
          AND ri.quantity > 0
          AND (oci.id IS NULL OR oci.cut_quantity IS NULL);

        IF v_missing_cutting_count > 0 THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', format('Cannot advance. Missing cut quantity for %s required item sizes. All sizes must have cut quantities saved.', v_missing_cutting_count)
            );
        END IF;

        IF p_next_stage = 'cutting_completed' OR p_next_stage = 'arrange_sequence' THEN
            UPDATE public.order_production_workflows
            SET status = 'completed',
                completed_at = now(),
                updated_at = now()
            WHERE order_id = p_order_id AND sequence_order = 3;

            SELECT stage_key INTO v_next_stage_key
            FROM public.order_production_workflows
            WHERE order_id = p_order_id AND sequence_order = 4;

            IF v_next_stage_key IS NULL THEN
                v_next_stage_key := 'stitching';
            END IF;

            UPDATE public.production_records
            SET stage = v_next_stage_key,
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
        -- If current stage is a middle stage (4, 5, 6), ensure all OPERATIONAL sizes have actual mistaked quantity entered
        IF v_current_seq >= 4 AND v_current_seq <= 6 THEN
            v_prev_seq := v_current_seq - 1;
            SELECT stage_key INTO v_prev_stage_key
            FROM public.order_production_workflows
            WHERE order_id = p_order_id AND sequence_order = v_prev_seq;

            IF v_prev_seq = 3 THEN
                SELECT COUNT(*)
                INTO v_total_operational
                FROM public.order_cutting_items oci
                WHERE oci.order_id = p_order_id
                  AND oci.cut_quantity > 0;

                IF v_total_operational = 0 THEN
                    RETURN jsonb_build_object(
                        'success', false,
                        'error', 'No operational pieces available from the previous stage.'
                    );
                END IF;

                SELECT COUNT(*)
                INTO v_middle_missing
                FROM public.order_cutting_items oci
                LEFT JOIN public.order_stage_items osi ON (
                    osi.order_id = p_order_id
                    AND osi.stage_key = v_current_stage
                    AND lower(trim(osi.item_name)) = lower(trim(oci.item_name))
                    AND COALESCE(NULLIF(trim(osi.style_id::text), ''), 'no_style_id') = COALESCE(NULLIF(trim(oci.style_id::text), ''), 'no_style_id')
                    AND COALESCE(NULLIF(lower(trim(osi.style_name)), ''), 'no_style_name') = COALESCE(NULLIF(lower(trim(oci.style_name)), ''), 'no_style_name')
                    AND COALESCE(NULLIF(lower(trim(osi.color)), ''), 'no_color') = COALESCE(NULLIF(lower(trim(oci.color)), ''), 'no_color')
                    AND lower(trim(osi.size)) = lower(trim(oci.size))
                )
                WHERE oci.order_id = p_order_id
                  AND oci.cut_quantity > 0
                  AND (osi.id IS NULL OR osi.actual_quantity IS NULL);
            ELSE
                SELECT COUNT(*)
                INTO v_total_operational
                FROM public.order_stage_items prev_osi
                WHERE prev_osi.order_id = p_order_id
                  AND prev_osi.stage_key = v_prev_stage_key
                  AND (prev_osi.input_quantity - prev_osi.actual_quantity) > 0;

                IF v_total_operational = 0 THEN
                    RETURN jsonb_build_object(
                        'success', false,
                        'error', 'No operational pieces available from the previous stage.'
                    );
                END IF;

                SELECT COUNT(*)
                INTO v_middle_missing
                FROM public.order_stage_items prev_osi
                LEFT JOIN public.order_stage_items curr_osi ON (
                    curr_osi.order_id = p_order_id
                    AND curr_osi.stage_key = v_current_stage
                    AND lower(trim(curr_osi.item_name)) = lower(trim(prev_osi.item_name))
                    AND COALESCE(NULLIF(trim(curr_osi.style_id::text), ''), 'no_style_id') = COALESCE(NULLIF(trim(prev_osi.style_id::text), ''), 'no_style_id')
                    AND COALESCE(NULLIF(lower(trim(curr_osi.style_name)), ''), 'no_style_name') = COALESCE(NULLIF(lower(trim(prev_osi.style_name)), ''), 'no_style_name')
                    AND COALESCE(NULLIF(lower(trim(curr_osi.color)), ''), 'no_color') = COALESCE(NULLIF(lower(trim(prev_osi.color)), ''), 'no_color')
                    AND lower(trim(curr_osi.size)) = lower(trim(prev_osi.size))
                )
                WHERE prev_osi.order_id = p_order_id
                  AND prev_osi.stage_key = v_prev_stage_key
                  AND (prev_osi.input_quantity - prev_osi.actual_quantity) > 0
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
        COALESCE(p_note, format('Advanced from %s to %s.', v_current_stage, p_next_stage)),
        v_user_id
    );

    RETURN jsonb_build_object(
        'success', true,
        'from_stage', v_current_stage,
        'to_stage', p_next_stage
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_order_stage_items(UUID, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_order_stage_items(UUID, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_order_stage(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_order_stage(UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.advance_production_stage(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.advance_production_stage(UUID, TEXT, TEXT) TO service_role;

COMMIT;
