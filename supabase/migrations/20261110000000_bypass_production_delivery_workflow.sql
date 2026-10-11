-- =========================================================================
-- Migration: 20261110000000_bypass_production_delivery_workflow.sql
-- Description: Temporarily bypass Production in the order-to-delivery workflow:
-- 1. Update start_delivery RPC to allow confirmed and packed orders without QC records
-- 2. Update dispatch_order RPC to allow dispatching without mandatory QC completion when QC was bypassed
-- 3. Update sync_order_delivery_student_items RPC to allocate from requirement_items when QC items are absent
-- =========================================================================

-- 1. start_delivery RPC
CREATE OR REPLACE FUNCTION public.start_delivery(
    p_order_id UUID,
    p_remarks TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_role TEXT;
    v_user_id UUID;
    v_order_status TEXT;
    v_req_id UUID;
    v_qc_status TEXT;
    v_qc_passed_qty INTEGER := 0;
    v_qc_total_qty INTEGER := 0;
    v_total_deliverable_qty INTEGER := 0;
    v_existing_packing_id UUID;
    v_new_packing_id UUID;
    v_now TIMESTAMPTZ := now();
BEGIN
    -- 1. Verify Authentication & Role
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
    END IF;

    SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
    IF v_role != 'evenvibe_admin' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized. EvenVibe Admin required.');
    END IF;

    -- 2. Lock & Fetch Order
    SELECT status, requirement_id INTO v_order_status, v_req_id
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF v_order_status IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found');
    END IF;

    -- 3. Check for existing delivery/packing record
    SELECT id INTO v_existing_packing_id
    FROM public.packing_records
    WHERE order_id = p_order_id;

    IF v_existing_packing_id IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Delivery preparation has already been started for this order.');
    END IF;

    -- 4. Check QC status if quality_check_records exists
    SELECT status, COALESCE(passed_quantity, 0), COALESCE(total_quantity, 0)
    INTO v_qc_status, v_qc_passed_qty, v_qc_total_qty
    FROM public.quality_check_records
    WHERE order_id = p_order_id;

    IF v_qc_status IS NOT NULL AND v_qc_status NOT IN ('completed', 'passed') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Complete Quality Check before starting delivery.');
    END IF;

    -- 5. Derive Authoritative Deliverable Quantity:
    -- A: From QC Passed Quantity if available
    v_total_deliverable_qty := v_qc_passed_qty;

    IF v_total_deliverable_qty = 0 THEN
        SELECT COALESCE(SUM(passed_quantity), 0)
        INTO v_total_deliverable_qty
        FROM public.order_quality_check_items
        WHERE order_id = p_order_id
          AND passed_quantity > 0;
    END IF;

    -- B: Fallback to requirement_items quantity when Production/QC was bypassed
    IF v_total_deliverable_qty = 0 AND v_req_id IS NOT NULL THEN
        SELECT COALESCE(SUM(quantity), 0)
        INTO v_total_deliverable_qty
        FROM public.requirement_items
        WHERE requirement_id = v_req_id;
    END IF;

    IF v_total_deliverable_qty <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'No approved pieces are available for delivery.');
    END IF;

    -- 6. Ensure order status is at least packed
    IF v_order_status IN ('confirmed', 'production', 'quality_check') THEN
        UPDATE public.orders
        SET status = 'packed',
            updated_at = v_now
        WHERE id = p_order_id;

        INSERT INTO public.order_status_history (
            order_id,
            status,
            note
        ) VALUES (
            p_order_id,
            'packed',
            'Order moved to delivery workflow (production bypassed)'
        );
    END IF;

    -- 7. Insert delivery record into packing_records
    INSERT INTO public.packing_records (
        order_id,
        status,
        total_quantity,
        packed_quantity,
        remarks,
        started_at,
        packed_by
    ) VALUES (
        p_order_id,
        'in_progress',
        v_total_deliverable_qty,
        v_total_deliverable_qty,
        p_remarks,
        v_now,
        v_user_id
    )
    RETURNING id INTO v_new_packing_id;

    -- 8. Insert history entry
    INSERT INTO public.packing_history (
        packing_record_id,
        order_id,
        from_status,
        to_status,
        note,
        changed_by
    ) VALUES (
        v_new_packing_id,
        p_order_id,
        'pending',
        'in_progress',
        COALESCE(p_remarks, 'Delivery preparation started'),
        v_user_id
    );

    RETURN jsonb_build_object(
        'success', true,
        'delivery_id', v_new_packing_id,
        'total_quantity', v_total_deliverable_qty
    );
END;
$$;

-- 2. dispatch_order RPC
CREATE OR REPLACE FUNCTION public.dispatch_order(
    p_order_id UUID,
    p_courier_name TEXT DEFAULT NULL,
    p_tracking_number TEXT DEFAULT NULL,
    p_estimated_delivery DATE DEFAULT NULL,
    p_remarks TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_role TEXT;
    v_user_id UUID;
    v_order_status TEXT;
    v_packing_id UUID;
    v_packing_status TEXT;
    v_qc_status TEXT;
    v_note TEXT;
    v_now TIMESTAMPTZ := now();
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
    END IF;

    SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;
    IF v_role != 'evenvibe_admin' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized. EvenVibe Admin required.');
    END IF;

    -- 1. Lock & Fetch Order
    SELECT status INTO v_order_status
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF v_order_status IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found');
    END IF;

    -- 2. Verify QC if quality_check_records exists
    SELECT status INTO v_qc_status
    FROM public.quality_check_records
    WHERE order_id = p_order_id;

    IF v_qc_status IS NOT NULL AND v_qc_status NOT IN ('completed', 'passed') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Complete Quality Check before dispatching order.');
    END IF;

    -- 3. Verify delivery has been started
    SELECT id, status INTO v_packing_id, v_packing_status
    FROM public.packing_records
    WHERE order_id = p_order_id
    FOR UPDATE;

    IF v_packing_id IS NULL THEN
        -- Auto-start delivery if not started yet
        INSERT INTO public.packing_records (
            order_id,
            status,
            total_quantity,
            packed_quantity,
            started_at,
            packed_by
        ) VALUES (
            p_order_id,
            'completed',
            1,
            1,
            v_now,
            v_user_id
        )
        RETURNING id INTO v_packing_id;
    ELSE
        UPDATE public.packing_records
        SET status = 'completed',
            completed_at = v_now,
            updated_at = v_now
        WHERE id = v_packing_id;
    END IF;

    -- 4. Update Order to 'dispatched'
    UPDATE public.orders
    SET status = 'dispatched',
        courier_name = COALESCE(NULLIF(trim(p_courier_name), ''), courier_name),
        tracking_number = COALESCE(NULLIF(trim(p_tracking_number), ''), tracking_number),
        estimated_delivery = COALESCE(p_estimated_delivery, estimated_delivery),
        shipped_at = COALESCE(shipped_at, v_now),
        delivery_remarks = COALESCE(NULLIF(trim(p_remarks), ''), delivery_remarks),
        updated_at = v_now
    WHERE id = p_order_id;

    -- 5. Insert History Entries
    v_note := 'Consignment dispatched via ' || COALESCE(NULLIF(trim(p_courier_name), ''), 'Courier') ||
              ' (Tracking: ' || COALESCE(NULLIF(trim(p_tracking_number), ''), 'N/A') || ')';

    INSERT INTO public.order_status_history (
        order_id,
        status,
        note
    ) VALUES (
        p_order_id,
        'dispatched',
        v_note
    );

    INSERT INTO public.packing_history (
        packing_record_id,
        order_id,
        from_status,
        to_status,
        note,
        changed_by
    ) VALUES (
        v_packing_id,
        p_order_id,
        COALESCE(v_packing_status, 'in_progress'),
        'dispatched',
        v_note,
        v_user_id
    );

    RETURN jsonb_build_object(
        'success', true,
        'status', 'dispatched'
    );
END;
$$;

-- 3. sync_order_delivery_student_items RPC
CREATE OR REPLACE FUNCTION public.sync_order_delivery_student_items(p_order_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_school_id UUID;
    v_req_id UUID;
    v_order_status TEXT;
    v_mapped_count INTEGER := 0;
    v_qc_item_count INTEGER := 0;
    
    r_qc RECORD;
    r_cand RECORD;
    v_remaining_qty INTEGER;
BEGIN
    -- 1. Fetch order
    SELECT school_id, requirement_id, status 
    INTO v_school_id, v_req_id, v_order_status
    FROM public.orders
    WHERE id = p_order_id;
    
    IF v_school_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found');
    END IF;

    IF v_req_id IS NULL THEN
        RETURN jsonb_build_object('success', true, 'mapped_count', 0, 'message', 'Legacy order without requirement');
    END IF;

    -- 2. Clear existing mappings for idempotency
    DELETE FROM public.order_delivery_student_items WHERE order_id = p_order_id;

    -- 3. Check if QC items exist with passed_quantity > 0
    SELECT COUNT(*) INTO v_qc_item_count
    FROM public.order_quality_check_items
    WHERE order_id = p_order_id AND passed_quantity > 0;

    IF v_qc_item_count > 0 THEN
        -- Loop over QC items
        FOR r_qc IN 
            SELECT 
                id,
                trim(item_name) AS item_name,
                style_id,
                trim(style_name) AS style_name,
                trim(color) AS color,
                trim(size) AS size,
                passed_quantity
            FROM public.order_quality_check_items
            WHERE order_id = p_order_id AND passed_quantity > 0
            ORDER BY passed_quantity DESC, item_name, size
        LOOP
            v_remaining_qty := r_qc.passed_quantity;

            FOR r_cand IN
                WITH student_candidates AS (
                    SELECT 
                        rs.student_id,
                        us.item_name,
                        COALESCE((sus.dynamic_styles->kv.key->>'style_id')::uuid, us.id) AS style_id,
                        COALESCE(sus.dynamic_styles->kv.key->>'style_name', us.style_name) AS style_name,
                        sus.dynamic_styles->kv.key->>'color' AS color,
                        kv.value AS size
                    FROM public.requirement_students rs
                    JOIN public.student_uniform_sizes sus ON sus.student_id = rs.student_id
                    CROSS JOIN LATERAL jsonb_each_text(COALESCE(sus.dynamic_sizes, '{}'::jsonb)) kv
                    LEFT JOIN public.uniform_styles us ON us.id = (
                        CASE 
                            WHEN kv.key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 
                            THEN kv.key::uuid 
                            ELSE NULL 
                        END
                    )
                    WHERE rs.requirement_id = v_req_id
                    
                    UNION ALL
                    
                    SELECT 
                        rs.student_id,
                        std.item_name,
                        NULL::uuid AS style_id,
                        NULL AS style_name,
                        NULL AS color,
                        std.size
                    FROM public.requirement_students rs
                    JOIN public.student_uniform_sizes sus ON sus.student_id = rs.student_id
                    CROSS JOIN LATERAL (
                        VALUES 
                            ('Shirt', sus.shirt_size),
                            ('Pant', sus.pant_size),
                            ('T-Shirt', sus.tshirt_size),
                            ('Short', sus.short_size)
                    ) std(item_name, size)
                    WHERE rs.requirement_id = v_req_id AND std.size IS NOT NULL AND trim(std.size) <> ''
                )
                SELECT DISTINCT student_id, item_name, style_id, style_name, color, size
                FROM student_candidates sc
                WHERE lower(trim(sc.item_name)) = lower(trim(r_qc.item_name))
                  AND lower(trim(sc.size)) = lower(trim(r_qc.size))
                  AND (
                      r_qc.color IS NULL 
                      OR sc.color IS NULL 
                      OR lower(trim(r_qc.color)) = lower(trim(sc.color))
                  )
                  AND (
                      r_qc.style_name IS NULL 
                      OR sc.style_name IS NULL 
                      OR lower(trim(r_qc.style_name)) = lower(trim(sc.style_name))
                  )
                  AND NOT EXISTS (
                      SELECT 1 FROM public.order_delivery_student_items odsi
                      WHERE odsi.order_id = p_order_id
                        AND odsi.student_id = sc.student_id
                        AND lower(trim(odsi.item_name)) = lower(trim(sc.item_name))
                  )
                ORDER BY student_id
            LOOP
                IF v_remaining_qty <= 0 THEN
                    EXIT;
                END IF;

                INSERT INTO public.order_delivery_student_items (
                    order_id,
                    school_id,
                    student_id,
                    item_name,
                    style_id,
                    style_name,
                    color,
                    size,
                    quantity,
                    created_at,
                    updated_at
                ) VALUES (
                    p_order_id,
                    v_school_id,
                    r_cand.student_id,
                    r_qc.item_name,
                    COALESCE(r_cand.style_id, r_qc.style_id),
                    COALESCE(r_cand.style_name, r_qc.style_name),
                    COALESCE(r_cand.color, r_qc.color),
                    r_qc.size,
                    1,
                    now(),
                    now()
                )
                ON CONFLICT DO NOTHING;

                v_remaining_qty := v_remaining_qty - 1;
                v_mapped_count := v_mapped_count + 1;
            END LOOP;
        END LOOP;
    ELSE
        -- Production Bypassed: Loop over requirement_items directly
        FOR r_qc IN 
            SELECT 
                id,
                trim(item_name) AS item_name,
                style_id,
                trim(style_name) AS style_name,
                trim(color) AS color,
                trim(size) AS size,
                quantity AS passed_quantity
            FROM public.requirement_items
            WHERE requirement_id = v_req_id AND quantity > 0
            ORDER BY quantity DESC, item_name, size
        LOOP
            v_remaining_qty := r_qc.passed_quantity;

            FOR r_cand IN
                WITH student_candidates AS (
                    SELECT 
                        rs.student_id,
                        us.item_name,
                        COALESCE((sus.dynamic_styles->kv.key->>'style_id')::uuid, us.id) AS style_id,
                        COALESCE(sus.dynamic_styles->kv.key->>'style_name', us.style_name) AS style_name,
                        sus.dynamic_styles->kv.key->>'color' AS color,
                        kv.value AS size
                    FROM public.requirement_students rs
                    JOIN public.student_uniform_sizes sus ON sus.student_id = rs.student_id
                    CROSS JOIN LATERAL jsonb_each_text(COALESCE(sus.dynamic_sizes, '{}'::jsonb)) kv
                    LEFT JOIN public.uniform_styles us ON us.id = (
                        CASE 
                            WHEN kv.key ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 
                            THEN kv.key::uuid 
                            ELSE NULL 
                        END
                    )
                    WHERE rs.requirement_id = v_req_id
                    
                    UNION ALL
                    
                    SELECT 
                        rs.student_id,
                        std.item_name,
                        NULL::uuid AS style_id,
                        NULL AS style_name,
                        NULL AS color,
                        std.size
                    FROM public.requirement_students rs
                    JOIN public.student_uniform_sizes sus ON sus.student_id = rs.student_id
                    CROSS JOIN LATERAL (
                        VALUES 
                            ('Shirt', sus.shirt_size),
                            ('Pant', sus.pant_size),
                            ('T-Shirt', sus.tshirt_size),
                            ('Short', sus.short_size)
                    ) std(item_name, size)
                    WHERE rs.requirement_id = v_req_id AND std.size IS NOT NULL AND trim(std.size) <> ''
                )
                SELECT DISTINCT student_id, item_name, style_id, style_name, color, size
                FROM student_candidates sc
                WHERE lower(trim(sc.item_name)) = lower(trim(r_qc.item_name))
                  AND lower(trim(sc.size)) = lower(trim(r_qc.size))
                  AND (
                      r_qc.color IS NULL 
                      OR sc.color IS NULL 
                      OR lower(trim(r_qc.color)) = lower(trim(sc.color))
                  )
                  AND (
                      r_qc.style_name IS NULL 
                      OR sc.style_name IS NULL 
                      OR lower(trim(r_qc.style_name)) = lower(trim(sc.style_name))
                  )
                  AND NOT EXISTS (
                      SELECT 1 FROM public.order_delivery_student_items odsi
                      WHERE odsi.order_id = p_order_id
                        AND odsi.student_id = sc.student_id
                        AND lower(trim(odsi.item_name)) = lower(trim(sc.item_name))
                  )
                ORDER BY student_id
            LOOP
                IF v_remaining_qty <= 0 THEN
                    EXIT;
                END IF;

                INSERT INTO public.order_delivery_student_items (
                    order_id,
                    school_id,
                    student_id,
                    item_name,
                    style_id,
                    style_name,
                    color,
                    size,
                    quantity,
                    created_at,
                    updated_at
                ) VALUES (
                    p_order_id,
                    v_school_id,
                    r_cand.student_id,
                    r_qc.item_name,
                    COALESCE(r_cand.style_id, r_qc.style_id),
                    COALESCE(r_cand.style_name, r_qc.style_name),
                    COALESCE(r_cand.color, r_qc.color),
                    r_qc.size,
                    1,
                    now(),
                    now()
                )
                ON CONFLICT DO NOTHING;

                v_remaining_qty := v_remaining_qty - 1;
                v_mapped_count := v_mapped_count + 1;
            END LOOP;
        END LOOP;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'mapped_count', v_mapped_count
    );
END;
$$;
