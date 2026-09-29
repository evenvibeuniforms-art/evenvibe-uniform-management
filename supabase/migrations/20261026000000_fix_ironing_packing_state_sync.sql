-- Migration: 20261026000000_fix_ironing_packing_state_sync.sql
-- Description: Fix Stage 8 Ironing & Packing state synchronization and locking condition.
-- 1. Updates save_order_ironing_items to auto-set ironing_completed_at when all operational checking rows are 100% ironed.
-- 2. Updates complete_order_ironing_step to match (stage_key = 'ironing_packing' OR sequence_order = 8).
-- 3. Updates save_order_packing_items to check ironing_completed_at and auto-heal if operational ironing rows are complete.
-- 4. Updates complete_order_packing_step to check ironing_completed_at and auto-heal if operational ironing rows are complete.
-- 5. Backfills ironing_completed_at for any existing orders with 100% complete operational ironing items.

BEGIN;

-- =========================================================================
-- 1. RPC: save_order_ironing_items
-- =========================================================================
CREATE OR REPLACE FUNCTION public.save_order_ironing_items(
    p_order_id UUID,
    p_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_user_id UUID;
    v_role TEXT;
    v_item JSONB;
    v_item_name TEXT;
    v_style_id UUID;
    v_style_name TEXT;
    v_color TEXT;
    v_size TEXT;
    v_remarks TEXT;
    v_ironed_qty INTEGER;
    v_auth_input_qty INTEGER;
    v_client_input_qty INTEGER;
    v_pending_qty INTEGER;
    v_row_status TEXT;
    v_op_checking_count INTEGER := 0;
    v_completed_ironing_count INTEGER := 0;
    v_is_ironing_completed BOOLEAN := false;
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

    -- 2. Process each item
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_item_name := trim(v_item->>'item_name');
        v_style_id := NULLIF(trim(v_item->>'style_id'), '')::UUID;
        v_style_name := NULLIF(trim(v_item->>'style_name'), '');
        v_color := NULLIF(trim(v_item->>'color'), '');
        v_size := trim(v_item->>'size');
        v_remarks := NULLIF(trim(v_item->>'remarks'), '');

        IF v_item_name IS NULL OR v_item_name = '' OR v_size IS NULL OR v_size = '' THEN
            RETURN jsonb_build_object('success', false, 'error', 'Item name and size are required for all rows.');
        END IF;

        -- Extract ironed quantity (0 is strictly valid)
        IF v_item->>'actual_quantity' IS NULL OR trim(v_item->>'actual_quantity') = '' THEN
            RETURN jsonb_build_object(
                'success', false, 
                'error', format('Enter ironed quantity for %s (%s).', v_item_name, v_size)
            );
        END IF;

        BEGIN
            v_ironed_qty := (v_item->>'actual_quantity')::INTEGER;
        EXCEPTION WHEN OTHERS THEN
            RETURN jsonb_build_object('success', false, 'error', format('Invalid ironed quantity for %s (%s).', v_item_name, v_size));
        END;

        IF v_ironed_qty < 0 THEN
            RETURN jsonb_build_object('success', false, 'error', 'Ironed quantity cannot be negative.');
        END IF;

        -- Derive Authoritative Input from Checking Passed Quantity
        SELECT passed_quantity INTO v_auth_input_qty
        FROM public.order_checking_items
        WHERE order_id = p_order_id
          AND lower(trim(item_name)) = lower(v_item_name)
          AND COALESCE(NULLIF(trim(style_id::text), ''), 'no_style_id') = COALESCE(NULLIF(trim(v_style_id::text), ''), 'no_style_id')
          AND COALESCE(NULLIF(lower(trim(style_name)), ''), 'no_style_name') = COALESCE(NULLIF(lower(trim(v_style_name)), ''), 'no_style_name')
          AND COALESCE(NULLIF(lower(trim(color)), ''), 'no_color') = COALESCE(NULLIF(lower(trim(v_color)), ''), 'no_color')
          AND lower(trim(size)) = lower(v_size);

        IF v_auth_input_qty IS NULL THEN
            RETURN jsonb_build_object(
                'success', false, 
                'error', format('No checking record found for %s (%s).', v_item_name, v_size)
            );
        END IF;

        -- ZERO-OUTPUT FILTER: Ironing rows cannot exist if Checking Passed quantity was 0
        IF v_auth_input_qty <= 0 THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', format('Cannot iron %s (%s) because passed checking quantity is 0.', v_item_name, v_size)
            );
        END IF;

        -- Client input validation: reject if client attempts to falsify input quantity
        IF v_item->>'input_quantity' IS NOT NULL THEN
            BEGIN
                v_client_input_qty := (v_item->>'input_quantity')::INTEGER;
                IF v_client_input_qty != v_auth_input_qty THEN
                    RETURN jsonb_build_object('success', false, 'error', 'Ironing input quantity does not match Checking passed quantity.');
                END IF;
            EXCEPTION WHEN OTHERS THEN
                RETURN jsonb_build_object('success', false, 'error', 'Ironing input quantity does not match Checking passed quantity.');
            END;
        END IF;

        -- IRONED > INPUT VALIDATION
        IF v_ironed_qty > v_auth_input_qty THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Ironed quantity cannot be greater than input quantity.'
            );
        END IF;

        -- PENDING CALCULATION: Pending = Input - Ironed
        v_pending_qty := v_auth_input_qty - v_ironed_qty;
        v_row_status := CASE WHEN v_pending_qty = 0 THEN 'complete' ELSE 'pending' END;

        -- Upsert record into order_ironing_packing_items with stage_key = 'ironing'
        INSERT INTO public.order_ironing_packing_items (
            order_id,
            stage_key,
            item_name,
            style_id,
            style_name,
            color,
            size,
            input_quantity,
            actual_quantity,
            pending_quantity,
            remarks,
            status,
            updated_at
        ) VALUES (
            p_order_id,
            'ironing',
            v_item_name,
            v_style_id,
            v_style_name,
            v_color,
            v_size,
            v_auth_input_qty,
            v_ironed_qty,
            v_pending_qty,
            v_remarks,
            v_row_status,
            now()
        )
        ON CONFLICT (
            order_id,
            stage_key,
            lower(trim(item_name)),
            COALESCE(NULLIF(trim(style_id::text), ''), 'no_style_id'),
            COALESCE(NULLIF(lower(trim(style_name)), ''), 'no_style_name'),
            COALESCE(NULLIF(lower(trim(color)), ''), 'no_color'),
            lower(trim(size))
        )
        DO UPDATE SET
            input_quantity = EXCLUDED.input_quantity,
            actual_quantity = EXCLUDED.actual_quantity,
            pending_quantity = EXCLUDED.pending_quantity,
            remarks = COALESCE(EXCLUDED.remarks, public.order_ironing_packing_items.remarks),
            status = EXCLUDED.status,
            updated_at = now();
    END LOOP;

    -- 3. Check if all operational checking rows are fully ironed for this order
    SELECT COUNT(*) INTO v_op_checking_count
    FROM public.order_checking_items
    WHERE order_id = p_order_id AND passed_quantity > 0;

    SELECT COUNT(*) INTO v_completed_ironing_count
    FROM public.order_checking_items oci
    JOIN public.order_ironing_packing_items oipi ON (
        oipi.order_id = p_order_id
        AND oipi.stage_key = 'ironing'
        AND lower(trim(oipi.item_name)) = lower(trim(oci.item_name))
        AND COALESCE(NULLIF(trim(oipi.style_id::text), ''), 'no_style_id') = COALESCE(NULLIF(trim(oci.style_id::text), ''), 'no_style_id')
        AND COALESCE(NULLIF(lower(trim(oipi.style_name)), ''), 'no_style_name') = COALESCE(NULLIF(lower(trim(oci.style_name)), ''), 'no_style_name')
        AND COALESCE(NULLIF(lower(trim(oipi.color)), ''), 'no_color') = COALESCE(NULLIF(lower(trim(oci.color)), ''), 'no_color')
        AND lower(trim(oipi.size)) = lower(trim(oci.size))
    )
    WHERE oci.order_id = p_order_id
      AND oci.passed_quantity > 0
      AND oipi.actual_quantity = oci.passed_quantity
      AND oipi.pending_quantity = 0;

    IF v_op_checking_count > 0 AND v_op_checking_count = v_completed_ironing_count THEN
        UPDATE public.order_production_workflows
        SET ironing_completed_at = COALESCE(ironing_completed_at, now()),
            updated_at = now()
        WHERE order_id = p_order_id AND (stage_key = 'ironing_packing' OR sequence_order = 8);
        v_is_ironing_completed := true;
    ELSE
        v_is_ironing_completed := false;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'is_ironing_completed', v_is_ironing_completed
    );
END;
$$;

-- =========================================================================
-- 2. RPC: complete_order_ironing_step
-- =========================================================================
CREATE OR REPLACE FUNCTION public.complete_order_ironing_step(
    p_order_id UUID,
    p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_user_id UUID;
    v_role TEXT;
    v_prod_id UUID;
    v_total_operational INTEGER := 0;
    v_missing_count INTEGER := 0;
    v_pending_count INTEGER := 0;
    v_invalid_count INTEGER := 0;
    v_now TIMESTAMPTZ := now();
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

    -- 3. Verify Operational Rows from Checking (passed_quantity > 0)
    SELECT COUNT(*)
    INTO v_total_operational
    FROM public.order_checking_items
    WHERE order_id = p_order_id AND passed_quantity > 0;

    IF v_total_operational = 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'No pieces are available for ironing.'
        );
    END IF;

    -- 4. Check if any operational checking row is missing from Ironing
    SELECT COUNT(*)
    INTO v_missing_count
    FROM public.order_checking_items oci
    LEFT JOIN public.order_ironing_packing_items oipi ON (
        oipi.order_id = p_order_id
        AND oipi.stage_key = 'ironing'
        AND lower(trim(oipi.item_name)) = lower(trim(oci.item_name))
        AND COALESCE(NULLIF(trim(oipi.style_id::text), ''), 'no_style_id') = COALESCE(NULLIF(trim(oci.style_id::text), ''), 'no_style_id')
        AND COALESCE(NULLIF(lower(trim(oipi.style_name)), ''), 'no_style_name') = COALESCE(NULLIF(lower(trim(oci.style_name)), ''), 'no_style_name')
        AND COALESCE(NULLIF(lower(trim(oipi.color)), ''), 'no_color') = COALESCE(NULLIF(lower(trim(oci.color)), ''), 'no_color')
        AND lower(trim(oipi.size)) = lower(trim(oci.size))
    )
    WHERE oci.order_id = p_order_id
      AND oci.passed_quantity > 0
      AND (oipi.id IS NULL OR oipi.actual_quantity IS NULL);

    IF v_missing_count > 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Complete ironing for all required quantities before continuing.'
        );
    END IF;

    -- 5. Check if any row has invalid quantity: ironed < 0 or ironed > passed_quantity
    SELECT COUNT(*)
    INTO v_invalid_count
    FROM public.order_checking_items oci
    JOIN public.order_ironing_packing_items oipi ON (
        oipi.order_id = p_order_id
        AND oipi.stage_key = 'ironing'
        AND lower(trim(oipi.item_name)) = lower(trim(oci.item_name))
        AND COALESCE(NULLIF(trim(oipi.style_id::text), ''), 'no_style_id') = COALESCE(NULLIF(trim(oci.style_id::text), ''), 'no_style_id')
        AND COALESCE(NULLIF(lower(trim(oipi.style_name)), ''), 'no_style_name') = COALESCE(NULLIF(lower(trim(oci.style_name)), ''), 'no_style_name')
        AND COALESCE(NULLIF(lower(trim(oipi.color)), ''), 'no_color') = COALESCE(NULLIF(lower(trim(oci.color)), ''), 'no_color')
        AND lower(trim(oipi.size)) = lower(trim(oci.size))
    )
    WHERE oci.order_id = p_order_id
      AND oci.passed_quantity > 0
      AND (
          oipi.actual_quantity < 0
          OR oipi.actual_quantity > oci.passed_quantity
      );

    IF v_invalid_count > 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Ironed quantity cannot be greater than input quantity.'
        );
    END IF;

    -- 6. Check for partial ironing (Pending > 0)
    SELECT COUNT(*)
    INTO v_pending_count
    FROM public.order_checking_items oci
    JOIN public.order_ironing_packing_items oipi ON (
        oipi.order_id = p_order_id
        AND oipi.stage_key = 'ironing'
        AND lower(trim(oipi.item_name)) = lower(trim(oci.item_name))
        AND COALESCE(NULLIF(trim(oipi.style_id::text), ''), 'no_style_id') = COALESCE(NULLIF(trim(oci.style_id::text), ''), 'no_style_id')
        AND COALESCE(NULLIF(lower(trim(oipi.style_name)), ''), 'no_style_name') = COALESCE(NULLIF(lower(trim(oci.style_name)), ''), 'no_style_name')
        AND COALESCE(NULLIF(lower(trim(oipi.color)), ''), 'no_color') = COALESCE(NULLIF(lower(trim(oci.color)), ''), 'no_color')
        AND lower(trim(oipi.size)) = lower(trim(oci.size))
    )
    WHERE oci.order_id = p_order_id
      AND oci.passed_quantity > 0
      AND (
          oipi.actual_quantity != oci.passed_quantity
          OR oipi.pending_quantity > 0
      );

    IF v_pending_count > 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Complete ironing for all required quantities before continuing.'
        );
    END IF;

    -- 7. Record Ironing Completed on workflow record (matching stage_key OR sequence_order)
    UPDATE public.order_production_workflows
    SET ironing_completed_at = v_now,
        updated_at = v_now
    WHERE order_id = p_order_id AND (stage_key = 'ironing_packing' OR sequence_order = 8);

    -- 8. Add stage history
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
        'ironing_packing',
        'ironing_packing',
        COALESCE(p_note, 'Ironing step completed successfully. Packing operation unlocked.'),
        v_user_id
    );

    RETURN jsonb_build_object(
        'success', true,
        'is_ironing_completed', true,
        'ironing_completed_at', v_now
    );
END;
$$;

-- =========================================================================
-- 3. RPC: save_order_packing_items
-- =========================================================================
CREATE OR REPLACE FUNCTION public.save_order_packing_items(
    p_order_id UUID,
    p_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_user_id UUID;
    v_role TEXT;
    v_ironing_completed_at TIMESTAMPTZ;
    v_op_checking_count INTEGER := 0;
    v_completed_ironing_count INTEGER := 0;
    v_item JSONB;
    v_item_name TEXT;
    v_style_id UUID;
    v_style_name TEXT;
    v_color TEXT;
    v_size TEXT;
    v_remarks TEXT;
    v_packed_qty INTEGER;
    v_auth_input_qty INTEGER;
    v_client_input_qty INTEGER;
    v_pending_qty INTEGER;
    v_row_status TEXT;
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

    -- 2. Verify Ironing step is completed
    SELECT ironing_completed_at INTO v_ironing_completed_at
    FROM public.order_production_workflows
    WHERE order_id = p_order_id AND (stage_key = 'ironing_packing' OR sequence_order = 8);

    IF v_ironing_completed_at IS NULL THEN
        -- Check if all operational checking rows are in fact fully ironed
        SELECT COUNT(*) INTO v_op_checking_count
        FROM public.order_checking_items
        WHERE order_id = p_order_id AND passed_quantity > 0;

        SELECT COUNT(*) INTO v_completed_ironing_count
        FROM public.order_checking_items oci
        JOIN public.order_ironing_packing_items oipi ON (
            oipi.order_id = p_order_id
            AND oipi.stage_key = 'ironing'
            AND lower(trim(oipi.item_name)) = lower(trim(oci.item_name))
            AND COALESCE(NULLIF(trim(oipi.style_id::text), ''), 'no_style_id') = COALESCE(NULLIF(trim(oci.style_id::text), ''), 'no_style_id')
            AND COALESCE(NULLIF(lower(trim(oipi.style_name)), ''), 'no_style_name') = COALESCE(NULLIF(lower(trim(oci.style_name)), ''), 'no_style_name')
            AND COALESCE(NULLIF(lower(trim(oipi.color)), ''), 'no_color') = COALESCE(NULLIF(lower(trim(oci.color)), ''), 'no_color')
            AND lower(trim(oipi.size)) = lower(trim(oci.size))
        )
        WHERE oci.order_id = p_order_id
          AND oci.passed_quantity > 0
          AND oipi.actual_quantity = oci.passed_quantity
          AND oipi.pending_quantity = 0;

        IF v_op_checking_count > 0 AND v_op_checking_count = v_completed_ironing_count THEN
            v_ironing_completed_at := now();
            UPDATE public.order_production_workflows
            SET ironing_completed_at = v_ironing_completed_at,
                updated_at = now()
            WHERE order_id = p_order_id AND (stage_key = 'ironing_packing' OR sequence_order = 8);
        ELSE
            RETURN jsonb_build_object('success', false, 'error', 'Packing is locked until Ironing is completed.');
        END IF;
    END IF;

    -- 3. Process each packing item
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_item_name := trim(v_item->>'item_name');
        v_style_id := NULLIF(trim(v_item->>'style_id'), '')::UUID;
        v_style_name := NULLIF(trim(v_item->>'style_name'), '');
        v_color := NULLIF(trim(v_item->>'color'), '');
        v_size := trim(v_item->>'size');
        v_remarks := NULLIF(trim(v_item->>'remarks'), '');

        IF v_item_name IS NULL OR v_item_name = '' OR v_size IS NULL OR v_size = '' THEN
            RETURN jsonb_build_object('success', false, 'error', 'Item name and size are required for all rows.');
        END IF;

        -- Extract packed quantity (0 is strictly valid)
        IF v_item->>'actual_quantity' IS NULL OR trim(v_item->>'actual_quantity') = '' THEN
            RETURN jsonb_build_object(
                'success', false, 
                'error', format('Enter packed quantity for %s (%s).', v_item_name, v_size)
            );
        END IF;

        BEGIN
            v_packed_qty := (v_item->>'actual_quantity')::INTEGER;
        EXCEPTION WHEN OTHERS THEN
            RETURN jsonb_build_object('success', false, 'error', format('Invalid packed quantity for %s (%s).', v_item_name, v_size));
        END;

        IF v_packed_qty < 0 THEN
            RETURN jsonb_build_object('success', false, 'error', 'Packed quantity cannot be negative.');
        END IF;

        -- Derive Authoritative Input from Ironing Actual Output
        SELECT actual_quantity INTO v_auth_input_qty
        FROM public.order_ironing_packing_items
        WHERE order_id = p_order_id
          AND stage_key = 'ironing'
          AND lower(trim(item_name)) = lower(v_item_name)
          AND COALESCE(NULLIF(trim(style_id::text), ''), 'no_style_id') = COALESCE(NULLIF(trim(v_style_id::text), ''), 'no_style_id')
          AND COALESCE(NULLIF(lower(trim(style_name)), ''), 'no_style_name') = COALESCE(NULLIF(lower(trim(v_style_name)), ''), 'no_style_name')
          AND COALESCE(NULLIF(lower(trim(color)), ''), 'no_color') = COALESCE(NULLIF(lower(trim(v_color)), ''), 'no_color')
          AND lower(trim(size)) = lower(v_size);

        IF v_auth_input_qty IS NULL THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', format('No Ironing record found for %s (%s).', v_item_name, v_size)
            );
        END IF;

        -- ZERO-OUTPUT FILTER: Packing rows cannot exist if Ironed quantity was 0
        IF v_auth_input_qty <= 0 THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', format('Cannot pack %s (%s) because Ironed quantity is 0.', v_item_name, v_size)
            );
        END IF;

        -- Client input validation: reject if client attempts to falsify input quantity
        IF v_item->>'input_quantity' IS NOT NULL THEN
            BEGIN
                v_client_input_qty := (v_item->>'input_quantity')::INTEGER;
                IF v_client_input_qty != v_auth_input_qty THEN
                    RETURN jsonb_build_object('success', false, 'error', 'Packing input quantity does not match Ironing output.');
                END IF;
            EXCEPTION WHEN OTHERS THEN
                RETURN jsonb_build_object('success', false, 'error', 'Packing input quantity does not match Ironing output.');
            END;
        END IF;

        -- PACKED > INPUT VALIDATION
        IF v_packed_qty > v_auth_input_qty THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Packed quantity cannot be greater than input quantity.'
            );
        END IF;

        -- PENDING CALCULATION: Pending = Input - Packed
        v_pending_qty := v_auth_input_qty - v_packed_qty;
        v_row_status := CASE WHEN v_pending_qty = 0 THEN 'complete' ELSE 'pending' END;

        -- Upsert record into order_ironing_packing_items with stage_key = 'packing'
        INSERT INTO public.order_ironing_packing_items (
            order_id,
            stage_key,
            item_name,
            style_id,
            style_name,
            color,
            size,
            input_quantity,
            actual_quantity,
            pending_quantity,
            remarks,
            status,
            updated_at
        ) VALUES (
            p_order_id,
            'packing',
            v_item_name,
            v_style_id,
            v_style_name,
            v_color,
            v_size,
            v_auth_input_qty,
            v_packed_qty,
            v_pending_qty,
            v_remarks,
            v_row_status,
            now()
        )
        ON CONFLICT (
            order_id,
            stage_key,
            lower(trim(item_name)),
            COALESCE(NULLIF(trim(style_id::text), ''), 'no_style_id'),
            COALESCE(NULLIF(lower(trim(style_name)), ''), 'no_style_name'),
            COALESCE(NULLIF(lower(trim(color)), ''), 'no_color'),
            lower(trim(size))
        )
        DO UPDATE SET
            input_quantity = EXCLUDED.input_quantity,
            actual_quantity = EXCLUDED.actual_quantity,
            pending_quantity = EXCLUDED.pending_quantity,
            remarks = COALESCE(EXCLUDED.remarks, public.order_ironing_packing_items.remarks),
            status = EXCLUDED.status,
            updated_at = now();
    END LOOP;

    RETURN jsonb_build_object('success', true);
END;
$$;

-- =========================================================================
-- 4. RPC: complete_order_packing_step
-- =========================================================================
CREATE OR REPLACE FUNCTION public.complete_order_packing_step(
    p_order_id UUID,
    p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_user_id UUID;
    v_role TEXT;
    v_prod_id UUID;
    v_ironing_completed_at TIMESTAMPTZ;
    v_op_checking_count INTEGER := 0;
    v_completed_ironing_count INTEGER := 0;
    v_total_operational INTEGER := 0;
    v_missing_count INTEGER := 0;
    v_pending_count INTEGER := 0;
    v_invalid_count INTEGER := 0;
    v_total_packed INTEGER := 0;
    v_current_order_status TEXT;
    v_now TIMESTAMPTZ := now();
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

    -- 3. Verify Ironing step was completed
    SELECT ironing_completed_at INTO v_ironing_completed_at
    FROM public.order_production_workflows
    WHERE order_id = p_order_id AND (stage_key = 'ironing_packing' OR sequence_order = 8);

    IF v_ironing_completed_at IS NULL THEN
        -- Check if all operational checking rows are in fact fully ironed
        SELECT COUNT(*) INTO v_op_checking_count
        FROM public.order_checking_items
        WHERE order_id = p_order_id AND passed_quantity > 0;

        SELECT COUNT(*) INTO v_completed_ironing_count
        FROM public.order_checking_items oci
        JOIN public.order_ironing_packing_items oipi ON (
            oipi.order_id = p_order_id
            AND oipi.stage_key = 'ironing'
            AND lower(trim(oipi.item_name)) = lower(trim(oci.item_name))
            AND COALESCE(NULLIF(trim(oipi.style_id::text), ''), 'no_style_id') = COALESCE(NULLIF(trim(oci.style_id::text), ''), 'no_style_id')
            AND COALESCE(NULLIF(lower(trim(oipi.style_name)), ''), 'no_style_name') = COALESCE(NULLIF(lower(trim(oci.style_name)), ''), 'no_style_name')
            AND COALESCE(NULLIF(lower(trim(oipi.color)), ''), 'no_color') = COALESCE(NULLIF(lower(trim(oci.color)), ''), 'no_color')
            AND lower(trim(oipi.size)) = lower(trim(oci.size))
        )
        WHERE oci.order_id = p_order_id
          AND oci.passed_quantity > 0
          AND oipi.actual_quantity = oci.passed_quantity
          AND oipi.pending_quantity = 0;

        IF v_op_checking_count > 0 AND v_op_checking_count = v_completed_ironing_count THEN
            v_ironing_completed_at := v_now;
            UPDATE public.order_production_workflows
            SET ironing_completed_at = v_ironing_completed_at,
                updated_at = v_now
            WHERE order_id = p_order_id AND (stage_key = 'ironing_packing' OR sequence_order = 8);
        ELSE
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Ironing must be completed before Packing can be completed.'
            );
        END IF;
    END IF;

    -- 4. Count operational rows from Ironing where actual_quantity > 0
    SELECT COUNT(*)
    INTO v_total_operational
    FROM public.order_ironing_packing_items iron
    WHERE iron.order_id = p_order_id
      AND iron.stage_key = 'ironing'
      AND iron.actual_quantity > 0;

    IF v_total_operational = 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'No pieces are available for packing.'
        );
    END IF;

    -- 5. Check if any operational row is missing from Packing
    SELECT COUNT(*)
    INTO v_missing_count
    FROM public.order_ironing_packing_items iron
    LEFT JOIN public.order_ironing_packing_items pack ON (
        pack.order_id = p_order_id
        AND pack.stage_key = 'packing'
        AND lower(trim(pack.item_name)) = lower(trim(iron.item_name))
        AND COALESCE(NULLIF(trim(pack.style_id::text), ''), 'no_style_id') = COALESCE(NULLIF(trim(iron.style_id::text), ''), 'no_style_id')
        AND COALESCE(NULLIF(lower(trim(pack.style_name)), ''), 'no_style_name') = COALESCE(NULLIF(lower(trim(iron.style_name)), ''), 'no_style_name')
        AND COALESCE(NULLIF(lower(trim(pack.color)), ''), 'no_color') = COALESCE(NULLIF(lower(trim(iron.color)), ''), 'no_color')
        AND lower(trim(pack.size)) = lower(trim(iron.size))
    )
    WHERE iron.order_id = p_order_id
      AND iron.stage_key = 'ironing'
      AND iron.actual_quantity > 0
      AND (pack.id IS NULL OR pack.actual_quantity IS NULL);

    IF v_missing_count > 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Complete packing for all required quantities before continuing.'
        );
    END IF;

    -- 6. Check for invalid quantities: packed < 0 or packed > input
    SELECT COUNT(*)
    INTO v_invalid_count
    FROM public.order_ironing_packing_items iron
    JOIN public.order_ironing_packing_items pack ON (
        pack.order_id = p_order_id
        AND pack.stage_key = 'packing'
        AND lower(trim(pack.item_name)) = lower(trim(iron.item_name))
        AND COALESCE(NULLIF(trim(pack.style_id::text), ''), 'no_style_id') = COALESCE(NULLIF(trim(iron.style_id::text), ''), 'no_style_id')
        AND COALESCE(NULLIF(lower(trim(pack.style_name)), ''), 'no_style_name') = COALESCE(NULLIF(lower(trim(iron.style_name)), ''), 'no_style_name')
        AND COALESCE(NULLIF(lower(trim(pack.color)), ''), 'no_color') = COALESCE(NULLIF(lower(trim(iron.color)), ''), 'no_color')
        AND lower(trim(pack.size)) = lower(trim(iron.size))
    )
    WHERE iron.order_id = p_order_id
      AND iron.stage_key = 'ironing'
      AND iron.actual_quantity > 0
      AND (
          pack.actual_quantity < 0
          OR pack.actual_quantity > iron.actual_quantity
      );

    IF v_invalid_count > 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Packed quantity cannot be greater than input quantity.'
        );
    END IF;

    -- 7. Check for partial packing (pending > 0 or packed != input)
    SELECT COUNT(*)
    INTO v_pending_count
    FROM public.order_ironing_packing_items iron
    JOIN public.order_ironing_packing_items pack ON (
        pack.order_id = p_order_id
        AND pack.stage_key = 'packing'
        AND lower(trim(pack.item_name)) = lower(trim(iron.item_name))
        AND COALESCE(NULLIF(trim(pack.style_id::text), ''), 'no_style_id') = COALESCE(NULLIF(trim(iron.style_id::text), ''), 'no_style_id')
        AND COALESCE(NULLIF(lower(trim(pack.style_name)), ''), 'no_style_name') = COALESCE(NULLIF(lower(trim(iron.style_name)), ''), 'no_style_name')
        AND COALESCE(NULLIF(lower(trim(pack.color)), ''), 'no_color') = COALESCE(NULLIF(lower(trim(iron.color)), ''), 'no_color')
        AND lower(trim(pack.size)) = lower(trim(iron.size))
    )
    WHERE iron.order_id = p_order_id
      AND iron.stage_key = 'ironing'
      AND iron.actual_quantity > 0
      AND (
          pack.actual_quantity != iron.actual_quantity
          OR pack.pending_quantity > 0
      );

    IF v_pending_count > 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Complete packing for all required quantities before continuing.'
        );
    END IF;

    -- 8. Compute total packed pieces
    SELECT COALESCE(SUM(actual_quantity), 0) INTO v_total_packed
    FROM public.order_ironing_packing_items
    WHERE order_id = p_order_id AND stage_key = 'packing';

    -- 9. Mark Stage 8 (Ironing and Packing) as completed
    UPDATE public.order_production_workflows
    SET status = 'completed',
        completed_at = v_now,
        updated_at = v_now
    WHERE order_id = p_order_id AND (stage_key = 'ironing_packing' OR sequence_order = 8);

    -- 10. Mark Production Record as completed
    UPDATE public.production_records
    SET stage = 'production_completed',
        completed_quantity = v_total_packed,
        completed_at = v_now,
        remarks = COALESCE(p_note, remarks),
        updated_at = v_now
    WHERE id = v_prod_id;

    -- 11. Update Order Status to 'packed'
    SELECT status INTO v_current_order_status
    FROM public.orders
    WHERE id = p_order_id;

    UPDATE public.orders
    SET status = 'packed',
        updated_at = v_now
    WHERE id = p_order_id;

    -- 12. Add stage history
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
        'ironing_packing',
        'production_completed',
        COALESCE(p_note, format('Ironing and Packing completed (%s packed). Order status updated to Packed.', v_total_packed)),
        v_user_id
    );

    -- 13. Add order status history
    INSERT INTO public.order_status_history (
        order_id,
        status,
        note
    ) VALUES (
        p_order_id,
        'packed',
        COALESCE(p_note, format('Production manufacturing finished. Total packed: %s.', v_total_packed))
    );

    RETURN jsonb_build_object(
        'success', true,
        'completed_stage', 'ironing_packing',
        'order_status', 'packed',
        'total_packed', v_total_packed
    );
END;
$$;

-- =========================================================================
-- 5. Backfill/Heal: Auto-complete Ironing for orders where all operational rows are ironed
-- =========================================================================
UPDATE public.order_production_workflows opw
SET ironing_completed_at = COALESCE(opw.ironing_completed_at, now()),
    updated_at = now()
WHERE (opw.stage_key = 'ironing_packing' OR opw.sequence_order = 8)
  AND opw.ironing_completed_at IS NULL
  AND EXISTS (
      SELECT 1 FROM public.order_checking_items oci
      WHERE oci.order_id = opw.order_id AND oci.passed_quantity > 0
  )
  AND NOT EXISTS (
      SELECT 1 FROM public.order_checking_items oci
      LEFT JOIN public.order_ironing_packing_items oipi ON (
          oipi.order_id = oci.order_id
          AND oipi.stage_key = 'ironing'
          AND lower(trim(oipi.item_name)) = lower(trim(oci.item_name))
          AND COALESCE(NULLIF(trim(oipi.style_id::text), ''), 'no_style_id') = COALESCE(NULLIF(trim(oci.style_id::text), ''), 'no_style_id')
          AND COALESCE(NULLIF(lower(trim(oipi.style_name)), ''), 'no_style_name') = COALESCE(NULLIF(lower(trim(oci.style_name)), ''), 'no_style_name')
          AND COALESCE(NULLIF(lower(trim(oipi.color)), ''), 'no_color') = COALESCE(NULLIF(lower(trim(oci.color)), ''), 'no_color')
          AND lower(trim(oipi.size)) = lower(trim(oci.size))
      )
      WHERE oci.order_id = opw.order_id
        AND oci.passed_quantity > 0
        AND (
            oipi.id IS NULL
            OR oipi.actual_quantity != oci.passed_quantity
            OR oipi.pending_quantity > 0
        )
  );

COMMIT;
