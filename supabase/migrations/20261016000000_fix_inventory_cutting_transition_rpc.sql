-- Migration: Fix production stage transitions for Stock Sizes -> Inventory -> Cutting
-- Ensures order_production_workflows sequence is strictly synchronized with production_records.stage

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

        -- Ensure stage 1 is marked completed
        UPDATE public.order_production_workflows
        SET status = 'completed',
            completed_at = COALESCE(completed_at, now()),
            updated_at = now()
        WHERE order_id = p_order_id AND sequence_order = 1 AND status != 'completed';

        -- Mark stage 2 (inventory) completed
        UPDATE public.order_production_workflows
        SET status = 'completed',
            completed_at = now(),
            updated_at = now()
        WHERE order_id = p_order_id AND sequence_order = 2;

        -- Mark stage 3 (cutting) in_progress
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
        IF p_next_stage = 'cutting_completed' THEN
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
                'cutting_completed',
                COALESCE(p_note, 'Cutting stage completed. Ready for production sequence arrangement.'),
                v_user_id
            );

            RETURN jsonb_build_object(
                'success', true,
                'from_stage', 'cutting',
                'to_stage', 'cutting_completed'
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

-- One-time repair for any existing orders where production_records.stage is 'inventory' or 'cutting'
-- to ensure order_production_workflows is in perfect sync
UPDATE public.order_production_workflows opw
SET status = 'completed',
    completed_at = COALESCE(opw.completed_at, now()),
    updated_at = now()
FROM public.production_records pr
WHERE pr.order_id = opw.order_id
  AND pr.stage IN ('inventory', 'cutting', 'cutting_completed', 'stitching', 'printing', 'embroidering', 'checking', 'ironing_packing', 'production_completed')
  AND opw.sequence_order = 1
  AND opw.status != 'completed';

UPDATE public.order_production_workflows opw
SET status = 'in_progress',
    started_at = COALESCE(opw.started_at, now()),
    updated_at = now()
FROM public.production_records pr
WHERE pr.order_id = opw.order_id
  AND pr.stage = 'inventory'
  AND opw.sequence_order = 2
  AND opw.status != 'in_progress';

UPDATE public.order_production_workflows opw
SET status = 'completed',
    completed_at = COALESCE(opw.completed_at, now()),
    updated_at = now()
FROM public.production_records pr
WHERE pr.order_id = opw.order_id
  AND pr.stage IN ('cutting', 'cutting_completed', 'stitching', 'printing', 'embroidering', 'checking', 'ironing_packing', 'production_completed')
  AND opw.sequence_order = 2
  AND opw.status != 'completed';

UPDATE public.order_production_workflows opw
SET status = 'in_progress',
    started_at = COALESCE(opw.started_at, now()),
    updated_at = now()
FROM public.production_records pr
WHERE pr.order_id = opw.order_id
  AND pr.stage = 'cutting'
  AND opw.sequence_order = 3
  AND opw.status != 'in_progress';
