-- Migration: 20261014000000_order_inventory_materials.sql
-- Production Stage 2: Inventory Material Weight Calculation Table & Server-Side Enforcement

-- 1. Create order_inventory_materials table
CREATE TABLE IF NOT EXISTS public.order_inventory_materials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    item_name TEXT NOT NULL,
    style_id UUID REFERENCES public.uniform_styles(id) ON DELETE SET NULL,
    style_name TEXT NULL,
    color TEXT NULL,
    gram_per_piece NUMERIC(10,2) NOT NULL CHECK (gram_per_piece > 0),
    quantity INTEGER NOT NULL CHECK (quantity >= 0),
    total_grams NUMERIC(14,2) NOT NULL CHECK (total_grams >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Create unique index to guarantee 1 entry per order + item + style + color
CREATE UNIQUE INDEX IF NOT EXISTS idx_order_inventory_materials_unique ON public.order_inventory_materials (
    order_id,
    item_name,
    COALESCE(style_id::text, 'no_style_id'),
    COALESCE(style_name, 'no_style_name'),
    COALESCE(color, 'no_color')
);

CREATE INDEX IF NOT EXISTS idx_order_inventory_materials_order_id 
    ON public.order_inventory_materials(order_id);

-- 3. Trigger for updated_at
DROP TRIGGER IF EXISTS update_order_inventory_materials_modtime ON public.order_inventory_materials;
CREATE TRIGGER update_order_inventory_materials_modtime
    BEFORE UPDATE ON public.order_inventory_materials
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- 4. Enable RLS & Security Policies
ALTER TABLE public.order_inventory_materials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage order inventory materials" ON public.order_inventory_materials;
CREATE POLICY "Admins can manage order inventory materials"
    ON public.order_inventory_materials
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'evenvibe_admin'
        )
    );

DROP POLICY IF EXISTS "School Admins can view own order inventory materials" ON public.order_inventory_materials;
CREATE POLICY "School Admins can view own order inventory materials"
    ON public.order_inventory_materials
    FOR SELECT
    USING (
        order_id IN (
            SELECT id FROM public.orders WHERE school_id = public.get_my_school_id()
        )
        AND public.get_my_role() = 'school_admin'
    );

GRANT ALL ON public.order_inventory_materials TO authenticated, service_role;

-- 5. Update advance_production_stage to enforce that Inventory cannot be marked completed without valid gram values
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
        -- Check for any required combination in requirement_items that is missing or has gram_per_piece <= 0 in order_inventory_materials
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

    -- 2. Handle Cutting completion transition
    IF v_current_seq = 3 THEN
        -- Current stage is Cutting
        IF p_next_stage IN ('cutting_completed', 'complete_cutting') THEN
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

-- 6. RPC to save/upsert order inventory materials with server-side validation and quantity derivation
CREATE OR REPLACE FUNCTION public.save_order_inventory_materials(
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
    v_gram NUMERIC(10,2);
    v_qty INTEGER;
    v_total_grams NUMERIC(14,2);
    v_count INTEGER := 0;
BEGIN
    -- 1. Verify user role
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
    END IF;

    SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
    IF v_role != 'evenvibe_admin' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized. EvenVibe Admin required.');
    END IF;

    -- 2. Verify order
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

        -- Validate gram_per_piece
        v_gram := (v_item->>'gram_per_piece')::numeric;
        IF v_gram IS NULL OR v_gram <= 0 OR v_gram > 50000 THEN
            RETURN jsonb_build_object('success', false, 'error', format('Invalid gram per piece (%s). Must be greater than 0.', v_item->>'gram_per_piece'));
        END IF;

        -- Authoritative quantity from requirement_items snapshot
        SELECT COALESCE(SUM(quantity), 0)
        INTO v_qty
        FROM public.requirement_items
        WHERE requirement_id = v_requirement_id
          AND item_name = v_item_name
          AND COALESCE(style_id::text, 'no_style_id') = COALESCE(v_style_id::text, 'no_style_id')
          AND COALESCE(style_name, 'no_style_name') = COALESCE(v_style_name, 'no_style_name')
          AND COALESCE(color, 'no_color') = COALESCE(v_color, 'no_color');

        v_total_grams := ROUND(v_gram * v_qty, 2);

        -- Upsert into order_inventory_materials
        INSERT INTO public.order_inventory_materials (
            order_id,
            item_name,
            style_id,
            style_name,
            color,
            gram_per_piece,
            quantity,
            total_grams,
            updated_at
        ) VALUES (
            p_order_id,
            v_item_name,
            v_style_id,
            v_style_name,
            v_color,
            v_gram,
            v_qty,
            v_total_grams,
            now()
        )
        ON CONFLICT (
            order_id,
            item_name,
            COALESCE(style_id::text, 'no_style_id'),
            COALESCE(style_name, 'no_style_name'),
            COALESCE(color, 'no_color')
        )
        DO UPDATE SET
            gram_per_piece = EXCLUDED.gram_per_piece,
            quantity = EXCLUDED.quantity,
            total_grams = EXCLUDED.total_grams,
            updated_at = now();

        v_count := v_count + 1;
    END LOOP;

    RETURN jsonb_build_object('success', true, 'saved_count', v_count);
END;
$$;

