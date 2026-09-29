-- ============================================================================
-- Migration: 20261015000001_case_insensitive_cutting_snapshot_rpc.sql
-- Description: Update save_order_cutting_items and advance_production_stage
-- to perform case-insensitive, whitespace-trimmed matching against the
-- current order's requirement_items snapshot.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.save_order_cutting_items(
    p_order_id UUID,
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
    v_requirement_id UUID;
    v_item JSONB;
    v_item_name TEXT;
    v_style_id UUID;
    v_style_name TEXT;
    v_color TEXT;
    v_size TEXT;
    v_cut_qty INTEGER;
    v_req_qty INTEGER;
    v_count INTEGER := 0;
    v_raw_cut TEXT;
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
    SELECT status, requirement_id INTO v_order_status, v_requirement_id
    FROM public.orders
    WHERE id = p_order_id;

    IF v_order_status IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found');
    END IF;

    IF v_order_status != 'production' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order is not in production status');
    END IF;

    -- 3. Loop over items in p_items and upsert
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_item_name := trim(v_item->>'item_name');
        IF v_item_name IS NULL OR v_item_name = '' THEN
            RETURN jsonb_build_object('success', false, 'error', 'Item name is required for all rows');
        END IF;

        IF (v_item->>'style_id') ~ '^[0-9a-fA-F-]{36}$' THEN
            v_style_id := (v_item->>'style_id')::uuid;
        ELSE
            v_style_id := NULL;
        END IF;

        v_style_name := NULLIF(trim(v_item->>'style_name'), '');
        v_color := NULLIF(trim(v_item->>'color'), '');
        v_size := trim(v_item->>'size');

        IF v_size IS NULL OR v_size = '' THEN
            RETURN jsonb_build_object('success', false, 'error', 'Size is required for all rows');
        END IF;

        -- Validate cut_quantity strictly as non-negative integer
        v_raw_cut := trim(v_item->>'cut_quantity');
        IF v_raw_cut IS NULL OR NOT (v_raw_cut ~ '^\d+$') THEN
            RETURN jsonb_build_object('success', false, 'error', format('Invalid cut quantity (%s) for %s size %s. Must be a whole number >= 0.', v_raw_cut, v_item_name, v_size));
        END IF;

        v_cut_qty := v_raw_cut::integer;
        IF v_cut_qty < 0 THEN
            RETURN jsonb_build_object('success', false, 'error', format('Cut quantity cannot be negative for %s size %s.', v_item_name, v_size));
        END IF;

        -- Authoritative required quantity from requirement_items snapshot (read-only, derived server-side)
        -- Case-insensitive & trimmed matching ensures exact tie to the current order snapshot
        SELECT COALESCE(SUM(quantity), 0)
        INTO v_req_qty
        FROM public.requirement_items
        WHERE requirement_id = v_requirement_id
          AND lower(trim(item_name)) = lower(trim(v_item_name))
          AND COALESCE(style_id::text, 'no_style_id') = COALESCE(v_style_id::text, 'no_style_id')
          AND COALESCE(lower(trim(style_name)), 'no_style_name') = COALESCE(lower(trim(v_style_name)), 'no_style_name')
          AND COALESCE(lower(trim(color)), 'no_color') = COALESCE(lower(trim(v_color)), 'no_color')
          AND lower(trim(size)) = lower(trim(v_size));

        IF v_req_qty <= 0 THEN
            RETURN jsonb_build_object('success', false, 'error', format('Unknown or zero-requirement size row for %s - %s (%s) size %s in current order.', v_item_name, COALESCE(v_style_name, 'Standard'), COALESCE(v_color, 'None'), v_size));
        END IF;

        -- Upsert into order_cutting_items
        INSERT INTO public.order_cutting_items (
            order_id,
            item_name,
            style_id,
            style_name,
            color,
            size,
            required_quantity,
            cut_quantity,
            updated_at
        ) VALUES (
            p_order_id,
            v_item_name,
            v_style_id,
            v_style_name,
            v_color,
            v_size,
            v_req_qty,
            v_cut_qty,
            now()
        )
        ON CONFLICT (
            order_id,
            item_name,
            COALESCE(style_id::text, 'no_style_id'),
            COALESCE(style_name, 'no_style_name'),
            COALESCE(color, 'no_color'),
            size
        )
        DO UPDATE SET
            cut_quantity = EXCLUDED.cut_quantity,
            required_quantity = EXCLUDED.required_quantity,
            updated_at = now();

        v_count := v_count + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'count', v_count,
        'order_id', p_order_id
    );
END;
$$;

-- Update advance_production_stage with case-insensitive, trimmed matching for cutting completion validation
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
    v_workflow RECORD;
    v_missing_items_count INTEGER;
    v_missing_cutting_count INTEGER;
    v_requirement_id UUID;
    v_order_num TEXT;
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
    WHERE order_id = p_order_id;

    IF v_prod_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Production record not found for this order');
    END IF;

    SELECT requirement_id, order_number INTO v_requirement_id, v_order_num
    FROM public.orders
    WHERE id = p_order_id;

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

    -- Default forward transition
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
