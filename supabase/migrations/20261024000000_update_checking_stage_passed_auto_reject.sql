-- Migration: 20261024000000_update_checking_stage_passed_auto_reject.sql
-- Description: Update Stage 7 Checking to Passed + Automatic Reject calculation
-- 1. Remove rework from checking validation and table constraints.
-- 2. Update save_order_checking_items RPC to calculate reject = input - passed.
-- 3. Update complete_order_checking_stage RPC to validate 0 <= passed <= input and passed + reject = input.

BEGIN;

-- 1. Update table constraints on public.order_checking_items
ALTER TABLE public.order_checking_items
    DROP CONSTRAINT IF EXISTS chk_checking_quantities_sum;

ALTER TABLE public.order_checking_items
    DROP CONSTRAINT IF EXISTS chk_checking_quantities_passed_reject;

ALTER TABLE public.order_checking_items
    ALTER COLUMN rework_quantity DROP NOT NULL,
    ALTER COLUMN rework_quantity SET DEFAULT 0;

ALTER TABLE public.order_checking_items
    ADD CONSTRAINT chk_checking_quantities_passed_reject 
    CHECK (
        passed_quantity >= 0 
        AND reject_quantity >= 0 
        AND passed_quantity <= input_quantity
        AND (passed_quantity + reject_quantity = input_quantity)
    );

-- 2. Update save_order_checking_items RPC
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

        -- Extract passed quantity (0 is strictly valid)
        IF v_item->>'passed_quantity' IS NULL OR trim(v_item->>'passed_quantity') = '' THEN
            RETURN jsonb_build_object(
                'success', false, 
                'error', format('Enter passed quantity for %s (%s).', v_item_name, v_size)
            );
        END IF;

        BEGIN
            v_passed_qty := (v_item->>'passed_quantity')::INTEGER;
        EXCEPTION WHEN OTHERS THEN
            RETURN jsonb_build_object('success', false, 'error', format('Invalid passed quantity for %s (%s).', v_item_name, v_size));
        END;

        IF v_passed_qty < 0 THEN
            RETURN jsonb_build_object('success', false, 'error', format('Passed quantity cannot be negative for %s (%s).', v_item_name, v_size));
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

        -- Client input validation: reject if client attempts to falsify input quantity
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

        -- PASSED > INPUT VALIDATION
        IF v_passed_qty > v_auth_input_qty THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Passed quantity cannot be greater than input quantity.'
            );
        END IF;

        -- AUTOMATIC REJECT CALCULATION: Reject = Input - Passed
        v_reject_qty := v_auth_input_qty - v_passed_qty;

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
            0,
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
            rework_quantity = 0,
            reject_quantity = EXCLUDED.reject_quantity,
            remarks = EXCLUDED.remarks,
            status = 'completed',
            updated_at = now();

        v_count := v_count + 1;
    END LOOP;

    RETURN jsonb_build_object('success', true, 'saved_count', v_count);
END;
$$;


-- 3. Update complete_order_checking_stage RPC
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
    v_missing_passed_count INTEGER := 0;
    v_invalid_passed_count INTEGER := 0;
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

    -- 5. Check if any operational row is missing passed quantity
    SELECT COUNT(*)
    INTO v_missing_passed_count
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
      AND (oci.id IS NULL OR oci.passed_quantity IS NULL);

    IF v_missing_passed_count > 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Enter passed quantity for all required sizes before completing Checking.'
        );
    END IF;

    -- 6. Check for invalid passed quantity: passed < 0 OR passed > input OR reject != (input - passed)
    SELECT COUNT(*)
    INTO v_invalid_passed_count
    FROM public.order_stage_items prev_osi
    JOIN public.order_checking_items oci ON (
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
          oci.passed_quantity < 0
          OR oci.passed_quantity > (prev_osi.input_quantity - prev_osi.actual_quantity)
          OR oci.reject_quantity != ((prev_osi.input_quantity - prev_osi.actual_quantity) - oci.passed_quantity)
      );

    IF v_invalid_passed_count > 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Passed quantity cannot be greater than input quantity.'
        );
    END IF;

    -- 7. Mark Stage 7 (Checking) as completed
    UPDATE public.order_production_workflows
    SET status = 'completed',
        completed_at = now(),
        updated_at = now()
    WHERE order_id = p_order_id AND sequence_order = 7;

    -- 8. Advance Stage 8 (Ironing & Packing) to in_progress
    UPDATE public.order_production_workflows
    SET status = 'in_progress',
        started_at = now(),
        updated_at = now()
    WHERE order_id = p_order_id AND sequence_order = 8;

    -- 9. Update production record stage to ironing_packing
    UPDATE public.production_records
    SET stage = 'ironing_packing',
        remarks = COALESCE(p_note, remarks),
        updated_at = now()
    WHERE id = v_prod_id;

    -- 10. Add stage history
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

COMMIT;
