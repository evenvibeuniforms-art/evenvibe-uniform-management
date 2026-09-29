-- Migration: 20261015000000_order_cutting_items.sql
-- Production Stage 3: Cutting - Style + Color + Size Required vs Actual Cut Quantity Table & Server-Side Enforcement

BEGIN;

-- 1. Create order_cutting_items table
CREATE TABLE IF NOT EXISTS public.order_cutting_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    item_name TEXT NOT NULL,
    style_id UUID REFERENCES public.uniform_styles(id) ON DELETE SET NULL,
    style_name TEXT NULL,
    color TEXT NULL,
    size TEXT NOT NULL,
    required_quantity INTEGER NOT NULL CHECK (required_quantity >= 0),
    cut_quantity INTEGER NOT NULL CHECK (cut_quantity >= 0),
    result_quantity INTEGER GENERATED ALWAYS AS (required_quantity - cut_quantity) STORED,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Create unique index to guarantee 1 entry per order + item + style + color + size
CREATE UNIQUE INDEX IF NOT EXISTS idx_order_cutting_items_unique ON public.order_cutting_items (
    order_id,
    item_name,
    COALESCE(style_id::text, 'no_style_id'),
    COALESCE(style_name, 'no_style_name'),
    COALESCE(color, 'no_color'),
    size
);

CREATE INDEX IF NOT EXISTS idx_order_cutting_items_order_id 
    ON public.order_cutting_items(order_id);

-- 3. Trigger for updated_at
DROP TRIGGER IF EXISTS update_order_cutting_items_modtime ON public.order_cutting_items;
CREATE TRIGGER update_order_cutting_items_modtime
    BEFORE UPDATE ON public.order_cutting_items
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- 4. Enable RLS & Security Policies
ALTER TABLE public.order_cutting_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage order cutting items" ON public.order_cutting_items;
CREATE POLICY "Admins can manage order cutting items"
    ON public.order_cutting_items
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'evenvibe_admin'
        )
    );

DROP POLICY IF EXISTS "School Admins can view own order cutting items" ON public.order_cutting_items;
CREATE POLICY "School Admins can view own order cutting items"
    ON public.order_cutting_items
    FOR SELECT
    USING (
        order_id IN (
            SELECT id FROM public.orders WHERE school_id = public.get_my_school_id()
        )
        AND public.get_my_role() = 'school_admin'
    );

GRANT ALL ON public.order_cutting_items TO authenticated, service_role;

-- 5. RPC to save/upsert order cutting items with authoritative required quantity derivation & server-side validation
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
        SELECT COALESCE(SUM(quantity), 0)
        INTO v_req_qty
        FROM public.requirement_items
        WHERE requirement_id = v_requirement_id
          AND item_name = v_item_name
          AND COALESCE(style_id::text, 'no_style_id') = COALESCE(v_style_id::text, 'no_style_id')
          AND COALESCE(style_name, 'no_style_name') = COALESCE(v_style_name, 'no_style_name')
          AND COALESCE(color, 'no_color') = COALESCE(v_color, 'no_color')
          AND size = v_size;

        IF v_req_qty <= 0 THEN
            RETURN jsonb_build_object('success', false, 'error', format('Unknown or zero-requirement size row for %s - %s (%s) size %s.', v_item_name, COALESCE(v_style_name, 'Standard'), COALESCE(v_color, 'None'), v_size));
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

    RETURN jsonb_build_object('success', true, 'saved_count', v_count);
END;
$$;

-- 6. Update advance_production_stage to enforce that Cutting cannot be marked completed without all cut quantities entered
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
    v_order_status TEXT;
    v_requirement_id UUID;
    v_prod_id UUID;
    v_current_seq INTEGER;
    v_current_stage_key TEXT;
    v_next_seq INTEGER;
    v_expected_next_stage_key TEXT;
    v_total_qty INTEGER;
    v_missing_inventory_count INTEGER;
    v_missing_cutting_count INTEGER;
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
    SELECT status, requirement_id INTO v_order_status, v_requirement_id
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

    -- E. Stage-Specific Gate Enforcement

    -- 1. If currently in 'inventory', ensure all style/color combinations have valid gram_per_piece entered
    IF v_current_stage_key = 'inventory' THEN
        WITH required_combinations AS (
            SELECT 
                item_name,
                style_id,
                style_name,
                color
            FROM public.requirement_items
            WHERE requirement_id = v_requirement_id
            GROUP BY item_name, style_id, style_name, color
        )
        SELECT COUNT(*)
        INTO v_missing_inventory_count
        FROM required_combinations rc
        LEFT JOIN public.order_inventory_materials oim ON (
            oim.order_id = p_order_id
            AND oim.item_name = rc.item_name
            AND COALESCE(oim.style_id::text, 'no_style_id') = COALESCE(rc.style_id::text, 'no_style_id')
            AND COALESCE(oim.style_name, 'no_style_name') = COALESCE(rc.style_name, 'no_style_name')
            AND COALESCE(oim.color, 'no_color') = COALESCE(rc.color, 'no_color')
        )
        WHERE oim.id IS NULL OR oim.gram_per_piece IS NULL OR oim.gram_per_piece <= 0;

        IF v_missing_inventory_count > 0 THEN
            RETURN jsonb_build_object(
                'success', false, 
                'error', 'Cannot complete Inventory stage. All uniform style and color combinations must have valid Gram / Piece values entered before proceeding to Cutting.'
            );
        END IF;
    END IF;

    -- 2. Handle Cutting completion transition (sequence 3)
    IF v_current_seq = 3 THEN
        IF p_next_stage IN ('cutting_completed', 'complete_cutting') THEN
            -- Check that every required Item + Style + Color + Size combination has an actual cut quantity entered
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
                AND oci.item_name = rs.item_name
                AND COALESCE(oci.style_id::text, 'no_style_id') = COALESCE(rs.style_id::text, 'no_style_id')
                AND COALESCE(oci.style_name, 'no_style_name') = COALESCE(rs.style_name, 'no_style_name')
                AND COALESCE(oci.color, 'no_color') = COALESCE(rs.color, 'no_color')
                AND oci.size = rs.size
            )
            WHERE oci.id IS NULL OR oci.cut_quantity IS NULL;

            IF v_missing_cutting_count > 0 THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'error', format('Cannot complete Cutting stage. Missing cut quantities for %s required size(s). Every size must have an actual cut quantity entered.', v_missing_cutting_count)
                );
            END IF;

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
        v_expected_next_stage_key := 'production_completed';
    END IF;

    IF p_next_stage != v_expected_next_stage_key THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', format('Invalid next stage "%s". Expected next stage is "%s" (stage %s).', p_next_stage, v_expected_next_stage_key, v_next_seq)
        );
    END IF;

    -- Mark current stage completed
    UPDATE public.order_production_workflows
    SET status = 'completed',
        completed_at = now(),
        updated_at = now()
    WHERE order_id = p_order_id AND sequence_order = v_current_seq;

    -- Activate next stage or finalize
    IF v_current_seq < 8 THEN
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
            'sequence_order', v_next_seq
        );
    ELSE
        -- Stage 8 completed -> production completed
        UPDATE public.production_records
        SET stage = 'production_completed',
            completed_quantity = v_total_qty,
            completed_at = now(),
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
            v_current_stage_key,
            'production_completed',
            COALESCE(p_note, 'All production stages completed.'),
            v_user_id
        );

        RETURN jsonb_build_object(
            'success', true,
            'previous_stage', v_current_stage_key,
            'new_stage', 'production_completed',
            'production_completed', true
        );
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_order_cutting_items(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_order_cutting_items(UUID, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.advance_production_stage(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.advance_production_stage(UUID, TEXT, TEXT) TO service_role;

COMMIT;
