-- Migration: 20261018000000_order_dynamic_production_stages.sql
-- Production Stages 4, 5, 6 — Full Dynamic Data Flow and Actual Mistaked Stage Quantity Implementation
-- Supports any of the 6 saved permutations of Stitching, Printing, and Embroidering.

BEGIN;

-- 1. Create order_stage_items table
CREATE TABLE IF NOT EXISTS public.order_stage_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    stage_key TEXT NOT NULL,
    sequence_order INTEGER NOT NULL CHECK (sequence_order >= 4 AND sequence_order <= 8),
    item_name TEXT NOT NULL,
    style_id UUID REFERENCES public.uniform_styles(id) ON DELETE SET NULL,
    style_name TEXT NULL,
    color TEXT NULL,
    size TEXT NOT NULL,
    input_quantity INTEGER NOT NULL CHECK (input_quantity >= 0),
    actual_quantity INTEGER NOT NULL CHECK (actual_quantity >= 0),
    result_quantity INTEGER GENERATED ALWAYS AS (input_quantity - actual_quantity) STORED,
    status TEXT NOT NULL DEFAULT 'completed',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Create unique index to guarantee 1 entry per order + stage_key + item + style + color + size
CREATE UNIQUE INDEX IF NOT EXISTS idx_order_stage_items_unique ON public.order_stage_items (
    order_id,
    stage_key,
    item_name,
    COALESCE(style_id::text, 'no_style_id'),
    COALESCE(style_name, 'no_style_name'),
    COALESCE(color, 'no_color'),
    size
);

CREATE INDEX IF NOT EXISTS idx_order_stage_items_order_id 
    ON public.order_stage_items(order_id);

CREATE INDEX IF NOT EXISTS idx_order_stage_items_order_stage 
    ON public.order_stage_items(order_id, stage_key);

-- 3. Trigger for updated_at
DROP TRIGGER IF EXISTS update_order_stage_items_modtime ON public.order_stage_items;
CREATE TRIGGER update_order_stage_items_modtime
    BEFORE UPDATE ON public.order_stage_items
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- 4. Enable RLS & Security Policies
ALTER TABLE public.order_stage_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage order stage items" ON public.order_stage_items;
CREATE POLICY "Admins can manage order stage items"
    ON public.order_stage_items
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'evenvibe_admin'
        )
    );

DROP POLICY IF EXISTS "School Admins can view own order stage items" ON public.order_stage_items;
CREATE POLICY "School Admins can view own order stage items"
    ON public.order_stage_items
    FOR SELECT
    USING (
        order_id IN (
            SELECT id FROM public.orders WHERE school_id = public.get_my_school_id()
        )
        AND public.get_my_role() = 'school_admin'
    );

GRANT ALL ON public.order_stage_items TO authenticated, service_role;

-- 5. Realtime publication
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
          AND schemaname = 'public' 
          AND tablename = 'order_stage_items'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.order_stage_items;
    END IF;
END $$;

-- 6. RPC: save_order_stage_items
-- Saves/upserts actual mistaked quantities for a dynamic stage with server-side validation against previous stage output.
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

        -- Extract actual quantity
        BEGIN
            v_actual_qty := (v_item->>'actual_quantity')::INTEGER;
        EXCEPTION WHEN OTHERS THEN
            RETURN jsonb_build_object('success', false, 'error', format('Invalid actual quantity for %s (%s).', v_item_name, v_size));
        END;

        IF v_actual_qty IS NULL OR v_actual_qty < 0 THEN
            RETURN jsonb_build_object('success', false, 'error', format('Actual quantity for %s (%s) must be 0 or greater.', v_item_name, v_size));
        END IF;

        -- Derive Authoritative Previous Stage Output (which is this stage's input)
        IF v_prev_seq = 3 THEN
            -- Previous stage is Cutting: output is cut_quantity from order_cutting_items
            SELECT cut_quantity INTO v_auth_input_qty
            FROM public.order_cutting_items
            WHERE order_id = p_order_id
              AND lower(trim(item_name)) = lower(v_item_name)
              AND COALESCE(style_id::text, 'no_style_id') = COALESCE(v_style_id::text, 'no_style_id')
              AND COALESCE(lower(trim(style_name)), 'no_style_name') = COALESCE(lower(v_style_name), 'no_style_name')
              AND COALESCE(lower(trim(color)), 'no_color') = COALESCE(lower(v_color), 'no_color')
              AND lower(trim(size)) = lower(v_size);
        ELSE
            -- Previous stage is middle stage (4, 5, or 6): output is result_quantity (input_quantity - actual_quantity) from order_stage_items
            SELECT (input_quantity - actual_quantity) INTO v_auth_input_qty
            FROM public.order_stage_items
            WHERE order_id = p_order_id
              AND stage_key = v_prev_stage_key
              AND lower(trim(item_name)) = lower(v_item_name)
              AND COALESCE(style_id::text, 'no_style_id') = COALESCE(v_style_id::text, 'no_style_id')
              AND COALESCE(lower(trim(style_name)), 'no_style_name') = COALESCE(lower(v_style_name), 'no_style_name')
              AND COALESCE(lower(trim(color)), 'no_color') = COALESCE(lower(v_color), 'no_color')
              AND lower(trim(size)) = lower(v_size);
        END IF;

        IF v_auth_input_qty IS NULL THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', format('No previous stage output found for %s (%s) from %s.', v_item_name, v_size, v_prev_stage_key)
            );
        END IF;

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

-- 7. RPC: complete_order_stage
-- Validates that every required size has actual mistaked quantity entered, then advances workflow.
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

    -- 4. Check that every required size from previous stage output has an actual mistaked quantity entered
    v_prev_seq := v_seq_order - 1;
    SELECT stage_key INTO v_prev_stage_key
    FROM public.order_production_workflows
    WHERE order_id = p_order_id AND sequence_order = v_prev_seq;

    IF v_prev_seq = 3 THEN
        -- Previous stage is Cutting: check against order_cutting_items
        SELECT COUNT(*)
        INTO v_missing_count
        FROM public.order_cutting_items oci
        LEFT JOIN public.order_stage_items osi ON (
            osi.order_id = p_order_id
            AND osi.stage_key = p_stage_key
            AND lower(trim(osi.item_name)) = lower(trim(oci.item_name))
            AND COALESCE(osi.style_id::text, 'no_style_id') = COALESCE(oci.style_id::text, 'no_style_id')
            AND COALESCE(lower(trim(osi.style_name)), 'no_style_name') = COALESCE(lower(trim(oci.style_name)), 'no_style_name')
            AND COALESCE(lower(trim(osi.color)), 'no_color') = COALESCE(lower(trim(oci.color)), 'no_color')
            AND lower(trim(osi.size)) = lower(trim(oci.size))
        )
        WHERE oci.order_id = p_order_id
          AND (osi.id IS NULL OR osi.actual_quantity IS NULL);
    ELSE
        -- Previous stage is middle stage (4, 5, 6): check against previous order_stage_items
        SELECT COUNT(*)
        INTO v_missing_count
        FROM public.order_stage_items prev_osi
        LEFT JOIN public.order_stage_items curr_osi ON (
            curr_osi.order_id = p_order_id
            AND curr_osi.stage_key = p_stage_key
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

-- 8. Update advance_production_stage to also enforce completion validation when moving out of middle stages (4..6)
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

COMMIT;
