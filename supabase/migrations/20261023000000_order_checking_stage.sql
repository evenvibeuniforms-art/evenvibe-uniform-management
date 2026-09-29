-- Migration: 20261023000000_order_checking_stage.sql
-- Description: Implement Stage 7 — Quality Checking module.
-- 1. Creates public.order_checking_items table for order-specific Item + Style + Color + Size checking.
-- 2. Implements save_order_checking_items RPC with authoritative final dynamic stage input derivation.
-- 3. Implements complete_order_checking_stage RPC validating Passed + Rework + Reject = Input.
-- 4. Updates complete_order_stage and advance_production_stage to seamlessly support checking completion and unlocking Stage 8 (Ironing & Packing).

BEGIN;

-- =========================================================================
-- 1. Table: public.order_checking_items
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.order_checking_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    item_name TEXT NOT NULL,
    style_id UUID REFERENCES public.uniform_styles(id) ON DELETE SET NULL,
    style_name TEXT NULL,
    color TEXT NULL,
    size TEXT NOT NULL,
    input_quantity INTEGER NOT NULL CHECK (input_quantity >= 0),
    passed_quantity INTEGER NOT NULL DEFAULT 0 CHECK (passed_quantity >= 0),
    rework_quantity INTEGER NOT NULL DEFAULT 0 CHECK (rework_quantity >= 0),
    reject_quantity INTEGER NOT NULL DEFAULT 0 CHECK (reject_quantity >= 0),
    remarks TEXT NULL,
    status TEXT NOT NULL DEFAULT 'completed',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_checking_quantities_sum CHECK (passed_quantity + rework_quantity + reject_quantity <= input_quantity)
);

-- Unique index to guarantee 1 entry per order + item + style + color + size
CREATE UNIQUE INDEX IF NOT EXISTS idx_order_checking_items_unique ON public.order_checking_items (
    order_id,
    item_name,
    COALESCE(style_id::text, 'no_style_id'),
    COALESCE(style_name, 'no_style_name'),
    COALESCE(color, 'no_color'),
    size
);

CREATE INDEX IF NOT EXISTS idx_order_checking_items_order_id 
    ON public.order_checking_items(order_id);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_order_checking_items_modtime ON public.order_checking_items;
CREATE TRIGGER update_order_checking_items_modtime
    BEFORE UPDATE ON public.order_checking_items
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- RLS
ALTER TABLE public.order_checking_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage order checking items" ON public.order_checking_items;
CREATE POLICY "Admins can manage order checking items"
    ON public.order_checking_items FOR ALL
    USING (public.get_my_role() = 'evenvibe_admin')
    WITH CHECK (public.get_my_role() = 'evenvibe_admin');

DROP POLICY IF EXISTS "School Admins can view own order checking items" ON public.order_checking_items;
CREATE POLICY "School Admins can view own order checking items"
    ON public.order_checking_items
    FOR SELECT
    USING (
        order_id IN (
            SELECT id FROM public.orders WHERE school_id = public.get_my_school_id()
        )
        AND public.get_my_role() = 'school_admin'
    );

GRANT ALL ON public.order_checking_items TO authenticated, service_role;


-- =========================================================================
-- 2. RPC: save_order_checking_items
-- =========================================================================
CREATE OR REPLACE FUNCTION public.save_order_checking_items(
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
    v_final_dynamic_stage TEXT;
    v_final_dynamic_status TEXT;
    v_item JSONB;
    v_item_name TEXT;
    v_style_id UUID;
    v_style_name TEXT;
    v_color TEXT;
    v_size TEXT;
    v_passed_qty INTEGER;
    v_rework_qty INTEGER;
    v_reject_qty INTEGER;
    v_remarks TEXT;
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

    -- 3. Resolve the final dynamic production stage (Sequence 6)
    SELECT stage_key, status INTO v_final_dynamic_stage, v_final_dynamic_status
    FROM public.order_production_workflows
    WHERE order_id = p_order_id AND sequence_order = 6;

    IF v_final_dynamic_stage IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Final dynamic production stage (Stage 6) not found.');
    END IF;

    IF v_final_dynamic_status != 'completed' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', format('Final dynamic stage (%s) must be completed before saving Checking items.', v_final_dynamic_stage)
        );
    END IF;

    -- 4. Process and validate each checking item
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
        v_remarks := NULLIF(trim(v_item->>'remarks'), '');

        IF v_item_name IS NULL OR v_item_name = '' OR v_size IS NULL OR v_size = '' THEN
            RETURN jsonb_build_object('success', false, 'error', 'Item name and size are required for all rows.');
        END IF;

        -- Extract passed, rework, reject quantities (0 is strictly valid)
        BEGIN
            v_passed_qty := (v_item->>'passed_quantity')::INTEGER;
            v_rework_qty := (v_item->>'rework_quantity')::INTEGER;
            v_reject_qty := (v_item->>'reject_quantity')::INTEGER;
        EXCEPTION WHEN OTHERS THEN
            RETURN jsonb_build_object('success', false, 'error', format('Invalid quantities for %s (%s).', v_item_name, v_size));
        END;

        IF v_passed_qty IS NULL OR v_passed_qty < 0 OR
           v_rework_qty IS NULL OR v_rework_qty < 0 OR
           v_reject_qty IS NULL OR v_reject_qty < 0 THEN
            RETURN jsonb_build_object('success', false, 'error', format('Passed, Rework, and Reject quantities for %s (%s) must be 0 or greater.', v_item_name, v_size));
        END IF;

        -- Derive Authoritative Final Stage Output (which is Checking's Input)
        SELECT (input_quantity - actual_quantity) INTO v_auth_input_qty
        FROM public.order_stage_items
        WHERE order_id = p_order_id
          AND stage_key = v_final_dynamic_stage
          AND lower(trim(item_name)) = lower(v_item_name)
          AND COALESCE(NULLIF(trim(style_id::text), ''), 'no_style_id') = COALESCE(NULLIF(trim(v_style_id::text), ''), 'no_style_id')
          AND COALESCE(NULLIF(lower(trim(style_name)), ''), 'no_style_name') = COALESCE(NULLIF(lower(trim(v_style_name)), ''), 'no_style_name')
          AND COALESCE(NULLIF(lower(trim(color)), ''), 'no_color') = COALESCE(NULLIF(lower(trim(v_color)), ''), 'no_color')
          AND lower(trim(size)) = lower(v_size);

        IF v_auth_input_qty IS NULL THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', format('No previous stage output found for %s (%s) from %s.', v_item_name, v_size, v_final_dynamic_stage)
            );
        END IF;

        -- ZERO-OUTPUT FILTER: Checking rows cannot exist if final dynamic stage produced 0 output
        IF v_auth_input_qty <= 0 THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', format('Cannot check %s (%s) because previous stage produced 0 output.', v_item_name, v_size)
            );
        END IF;

        -- OVER-ALLOCATION PROTECTION
        IF (v_passed_qty + v_rework_qty + v_reject_qty) > v_auth_input_qty THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', format('Total checking quantities (%s) exceed input quantity (%s) for %s (%s).', 
                    v_passed_qty + v_rework_qty + v_reject_qty, v_auth_input_qty, v_item_name, v_size)
            );
        END IF;

        -- Client input validation
        IF v_item->>'input_quantity' IS NOT NULL THEN
            BEGIN
                v_client_input_qty := (v_item->>'input_quantity')::INTEGER;
                IF v_client_input_qty != v_auth_input_qty THEN
                    RETURN jsonb_build_object('success', false, 'error', 'Checking input quantity does not match final stage output.');
                END IF;
            EXCEPTION WHEN OTHERS THEN
                RETURN jsonb_build_object('success', false, 'error', 'Checking input quantity does not match final stage output.');
            END;
        END IF;

        -- Upsert record into order_checking_items
        INSERT INTO public.order_checking_items (
            order_id,
            item_name,
            style_id,
            style_name,
            color,
            size,
            input_quantity,
            passed_quantity,
            rework_quantity,
            reject_quantity,
            remarks,
            status,
            updated_at
        ) VALUES (
            p_order_id,
            v_item_name,
            v_style_id,
            v_style_name,
            v_color,
            v_size,
            v_auth_input_qty,
            v_passed_qty,
            v_rework_qty,
            v_reject_qty,
            v_remarks,
            'completed',
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
            input_quantity = EXCLUDED.input_quantity,
            passed_quantity = EXCLUDED.passed_quantity,
            rework_quantity = EXCLUDED.rework_quantity,
            reject_quantity = EXCLUDED.reject_quantity,
            remarks = EXCLUDED.remarks,
            status = 'completed',
            updated_at = now();

        v_count := v_count + 1;
    END LOOP;

    RETURN jsonb_build_object('success', true, 'saved_count', v_count);
END;
$$;


-- =========================================================================
-- 3. RPC: complete_order_checking_stage
-- =========================================================================
CREATE OR REPLACE FUNCTION public.complete_order_checking_stage(
    p_order_id UUID,
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
    v_final_dynamic_stage TEXT;
    v_total_operational INTEGER := 0;
    v_missing_or_invalid_count INTEGER := 0;
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

    -- 3. Resolve the final dynamic stage (sequence 6)
    SELECT stage_key INTO v_final_dynamic_stage
    FROM public.order_production_workflows
    WHERE order_id = p_order_id AND sequence_order = 6;

    IF v_final_dynamic_stage IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Final dynamic stage not found for this order.');
    END IF;

    -- 4. Count total operational rows from stage 6 where output > 0
    SELECT COUNT(*)
    INTO v_total_operational
    FROM public.order_stage_items prev_osi
    WHERE prev_osi.order_id = p_order_id
      AND prev_osi.stage_key = v_final_dynamic_stage
      AND (prev_osi.input_quantity - prev_osi.actual_quantity) > 0;

    IF v_total_operational = 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'No pieces are available for checking.'
        );
    END IF;

    -- 5. Validate that every operational row satisfies Passed + Rework + Reject = Input
    SELECT COUNT(*)
    INTO v_missing_or_invalid_count
    FROM public.order_stage_items prev_osi
    LEFT JOIN public.order_checking_items oci ON (
        oci.order_id = p_order_id
        AND lower(trim(oci.item_name)) = lower(trim(prev_osi.item_name))
        AND COALESCE(NULLIF(trim(oci.style_id::text), ''), 'no_style_id') = COALESCE(NULLIF(trim(prev_osi.style_id::text), ''), 'no_style_id')
        AND COALESCE(NULLIF(lower(trim(oci.style_name)), ''), 'no_style_name') = COALESCE(NULLIF(lower(trim(prev_osi.style_name)), ''), 'no_style_name')
        AND COALESCE(NULLIF(lower(trim(oci.color)), ''), 'no_color') = COALESCE(NULLIF(lower(trim(prev_osi.color)), ''), 'no_color')
        AND lower(trim(oci.size)) = lower(trim(prev_osi.size))
    )
    WHERE prev_osi.order_id = p_order_id
      AND prev_osi.stage_key = v_final_dynamic_stage
      AND (prev_osi.input_quantity - prev_osi.actual_quantity) > 0
      AND (
          oci.id IS NULL
          OR oci.passed_quantity IS NULL
          OR oci.rework_quantity IS NULL
          OR oci.reject_quantity IS NULL
          OR (oci.passed_quantity + oci.rework_quantity + oci.reject_quantity) != (prev_osi.input_quantity - prev_osi.actual_quantity)
      );

    IF v_missing_or_invalid_count > 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Passed + Rework + Reject must equal the checking input quantity for all required sizes before completing this stage.'
        );
    END IF;

    -- 6. Mark Stage 7 (Checking) as completed
    UPDATE public.order_production_workflows
    SET status = 'completed',
        completed_at = now(),
        updated_at = now()
    WHERE order_id = p_order_id AND sequence_order = 7;

    -- 7. Advance Stage 8 (Ironing & Packing) to in_progress
    UPDATE public.order_production_workflows
    SET status = 'in_progress',
        started_at = now(),
        updated_at = now()
    WHERE order_id = p_order_id AND sequence_order = 8;

    -- 8. Update production record stage to ironing_packing
    UPDATE public.production_records
    SET stage = 'ironing_packing',
        remarks = COALESCE(p_note, remarks),
        updated_at = now()
    WHERE id = v_prod_id;

    -- 9. Add stage history
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
        'checking',
        'ironing_packing',
        COALESCE(p_note, 'Checking completed. Advanced to Ironing & Packing.'),
        v_user_id
    );

    RETURN jsonb_build_object(
        'success', true,
        'completed_stage', 'checking',
        'next_stage', 'ironing_packing'
    );
END;
$$;


-- =========================================================================
-- 4. Update complete_order_stage to support checking stage completion
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
    -- Special routing for checking stage
    IF p_stage_key = 'checking' THEN
        RETURN public.complete_order_checking_stage(p_order_id, p_note);
    END IF;

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

GRANT EXECUTE ON FUNCTION public.save_order_checking_items(UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_order_checking_items(UUID, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_order_checking_stage(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_order_checking_stage(UUID, TEXT) TO service_role;

COMMIT;
