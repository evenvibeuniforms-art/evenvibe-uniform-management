-- Migration: 20260928000000_allow_multiple_orders_after_delivery.sql
-- Description: Allow multiple orders per school after previous order is delivered.
-- Preserves historical delivered orders, active order duplicate protection, and student size tracking.

-- 1. Update status check constraint on public.requirements to support full order lifecycle
ALTER TABLE public.requirements DROP CONSTRAINT IF EXISTS requirements_status_check;
ALTER TABLE public.requirements ADD CONSTRAINT requirements_status_check
    CHECK (status IN (
        'draft',
        'submitted',
        'under_review',
        'confirmed',
        'production',
        'quality_check',
        'packed',
        'dispatched',
        'in_transit',
        'delivered',
        'cancelled'
    ));

-- 2. Trigger to sync order status to linked requirement
CREATE OR REPLACE FUNCTION public.sync_order_status_to_requirement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.requirements
    SET status = NEW.status,
        updated_at = now()
    WHERE id = NEW.requirement_id;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_order_status_to_requirement ON public.orders;
CREATE TRIGGER trg_sync_order_status_to_requirement
    AFTER INSERT OR UPDATE OF status ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_order_status_to_requirement();

-- 3. One-time retroactive backfill: sync requirements.status with existing orders
UPDATE public.requirements r
SET status = o.status,
    updated_at = now()
FROM public.orders o
WHERE o.requirement_id = r.id
  AND r.status != o.status;

-- 4. Update zero-argument submit_requirement() RPC (used by School Admin UI)
CREATE OR REPLACE FUNCTION public.submit_requirement()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_profile_id UUID;
    v_role TEXT;
    v_school_id UUID;
    v_req_id UUID;
    v_req_number TEXT;
    v_total_students INTEGER;
    v_regular_students INTEGER;
    v_tshirt_students INTEGER;
    v_order_id UUID;
    v_order_number TEXT;
    v_inserted_items INTEGER;
BEGIN
    -- 1. Authentication and Authorization
    v_profile_id := auth.uid();
    IF v_profile_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT role, school_id INTO v_role, v_school_id
    FROM public.profiles
    WHERE id = v_profile_id;

    IF v_role != 'school_admin' OR v_school_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Must be a school admin';
    END IF;

    -- 2. Check for active orders for this school
    -- In-flight orders block duplicate concurrent submissions. Terminal orders ('delivered', 'cancelled') do NOT block new orders.
    IF EXISTS (
        SELECT 1 FROM public.orders
        WHERE school_id = v_school_id
          AND status IN ('submitted', 'under_review', 'confirmed', 'production', 'quality_check', 'packed', 'dispatched', 'in_transit')
    ) THEN
        RAISE EXCEPTION 'An active order already exists for this school. You must wait for it to be delivered before submitting a new order.';
    END IF;

    -- Check for unlinked active requirements
    IF EXISTS (
        SELECT 1 FROM public.requirements r
        LEFT JOIN public.orders o ON o.requirement_id = r.id
        WHERE r.school_id = v_school_id
          AND o.id IS NULL
          AND r.status IN ('submitted', 'under_review', 'confirmed')
    ) THEN
        RAISE EXCEPTION 'An active requirement has already been submitted for this school.';
    END IF;

    -- 3. Identify eligible completed students safely
    CREATE TEMP TABLE temp_eligible_students ON COMMIT DROP AS
    SELECT s.id, sus.uniform_type
    FROM public.students s
    JOIN public.student_uniform_sizes sus ON s.id = sus.student_id
    WHERE s.school_id = v_school_id
      AND sus.is_complete = true
      AND NOT EXISTS (
          SELECT 1
          FROM public.school_uniform_configurations c
          JOIN public.school_uniform_configuration_classes cc ON cc.configuration_id = c.id
          JOIN public.school_uniform_configuration_items ci ON ci.configuration_id = c.id
          WHERE c.school_id = v_school_id
            AND c.is_active = true
            AND c.gender = s.gender
            AND cc.class_name = s.class_name
            AND ci.is_required = true
            AND (sus.dynamic_sizes IS NULL OR NOT (sus.dynamic_sizes ? ci.id::text) OR (sus.dynamic_sizes->>ci.id::text) = '')
      );

    SELECT count(*) INTO v_total_students FROM temp_eligible_students;

    -- ZERO-STUDENT PROTECTION
    IF v_total_students = 0 THEN
        RAISE EXCEPTION 'No completed student sizes are available to submit.';
    END IF;

    SELECT 
        COUNT(id) FILTER (WHERE uniform_type = 'regular'),
        COUNT(id) FILTER (WHERE uniform_type = 'tshirt')
    INTO v_regular_students, v_tshirt_students
    FROM temp_eligible_students;

    -- 4. Create Requirement
    v_req_number := 'EV-REQ-' || to_char(now(), 'YYYY') || '-' || upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 6));

    INSERT INTO public.requirements (
        school_id, requirement_number, status, total_students, 
        regular_uniform_students, tshirt_uniform_students, submitted_at, tracking_mode
    ) VALUES (
        v_school_id, v_req_number, 'submitted', v_total_students, 
        COALESCE(v_regular_students, 0), COALESCE(v_tshirt_students, 0), now(), 'tracked'
    ) RETURNING id INTO v_req_id;

    -- 5. Track ONLY eligible completed students
    INSERT INTO public.requirement_students (requirement_id, student_id)
    SELECT v_req_id, id FROM temp_eligible_students;

    -- 6. Insert Requirement Items Dynamically from eligible students only
    INSERT INTO public.requirement_items (requirement_id, class_name, section_name, gender, item_name, size, quantity)
    SELECT 
        v_req_id,
        s.class_name,
        s.section,
        s.gender,
        ci.item_name,
        d.value AS size,
        count(*) AS quantity
    FROM temp_eligible_students ts
    JOIN public.students s ON s.id = ts.id
    JOIN public.student_uniform_sizes sus ON s.id = sus.student_id
    JOIN LATERAL jsonb_each_text(sus.dynamic_sizes) d(key, value) ON true
    JOIN public.school_uniform_configuration_items ci ON ci.id::text = d.key
    JOIN public.school_uniform_configurations c ON c.id = ci.configuration_id
    WHERE s.school_id = v_school_id
      AND d.value IS NOT NULL
      AND d.value != ''
    GROUP BY s.class_name, s.section, s.gender, ci.item_name, d.value;

    GET DIAGNOSTICS v_inserted_items = ROW_COUNT;
    IF v_inserted_items = 0 THEN
        RAISE EXCEPTION 'Cannot submit: Aggregation produced 0 valid items.';
    END IF;

    -- 7. Create Order
    v_order_number := 'EV-ORD-' || to_char(now(), 'YYYY') || '-' || upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 6));

    INSERT INTO public.orders (
        school_id, requirement_id, order_number, status, created_at
    ) VALUES (
        v_school_id, v_req_id, v_order_number, 'submitted', now()
    ) RETURNING id INTO v_order_id;

    -- 8. Record History
    INSERT INTO public.order_status_history (
        order_id, status, note, created_at
    ) VALUES (
        v_order_id, 'submitted', 'Requirement submitted successfully with ' || v_total_students || ' students', now()
    );

    RETURN json_build_object(
        'success', true,
        'requirement_id', v_req_id,
        'requirement_number', v_req_number,
        'order_id', v_order_id,
        'order_number', v_order_number
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object(
            'success', false,
            'error', SQLERRM
        );
END;
$$;

-- 5. Update overloaded submit_requirement(p_school_id UUID) RPC
CREATE OR REPLACE FUNCTION public.submit_requirement(p_school_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_profile_id UUID;
    v_role TEXT;
    v_req_id UUID;
    v_order_id UUID;
    v_req_number TEXT;
    v_order_number TEXT;
    v_total_students INTEGER;
    v_regular_count INTEGER;
    v_tshirt_count INTEGER;
BEGIN
    v_profile_id := auth.uid();
    IF v_profile_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT role INTO v_role
    FROM public.profiles
    WHERE id = v_profile_id;

    IF v_role != 'school_admin' THEN
        RAISE EXCEPTION 'Unauthorized: Only school admins can submit requirements';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.orders 
        WHERE school_id = p_school_id 
          AND status IN ('submitted', 'under_review', 'confirmed', 'production', 'quality_check', 'packed', 'dispatched', 'in_transit')
    ) THEN
        RAISE EXCEPTION 'An active order already exists for this school. You must wait for it to be delivered before submitting a new one.';
    END IF;

    v_req_number := 'REQ-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substring(md5(random()::text) from 1 for 6));

    CREATE TEMP TABLE temp_eligible_students_uuid ON COMMIT DROP AS
    SELECT s.id, sus.uniform_type
    FROM public.students s
    JOIN public.student_uniform_sizes sus ON s.id = sus.student_id
    WHERE s.school_id = p_school_id
      AND sus.is_complete = true
      AND NOT EXISTS (
          SELECT 1
          FROM public.school_uniform_configurations c
          JOIN public.school_uniform_configuration_classes cc ON cc.configuration_id = c.id
          JOIN public.school_uniform_configuration_items ci ON ci.configuration_id = c.id
          WHERE c.school_id = p_school_id
            AND c.is_active = true
            AND c.gender = s.gender
            AND cc.class_name = s.class_name
            AND ci.is_required = true
            AND (sus.dynamic_sizes IS NULL OR NOT (sus.dynamic_sizes ? ci.id::text) OR (sus.dynamic_sizes->>ci.id::text) = '')
      );

    SELECT count(*) INTO v_total_students FROM temp_eligible_students_uuid;

    IF v_total_students = 0 THEN
        RAISE EXCEPTION 'No completed student sizes are available to submit.';
    END IF;

    SELECT 
        count(*) FILTER (WHERE uniform_type = 'regular'),
        count(*) FILTER (WHERE uniform_type = 'tshirt')
    INTO v_regular_count, v_tshirt_count
    FROM temp_eligible_students_uuid;

    INSERT INTO public.requirements (
        school_id, requirement_number, status, total_students,
        regular_uniform_students, tshirt_uniform_students,
        submitted_at, tracking_mode
    ) VALUES (
        p_school_id, v_req_number, 'submitted', v_total_students,
        v_regular_count, v_tshirt_count,
        now(), 'tracked'
    ) RETURNING id INTO v_req_id;

    INSERT INTO public.requirement_students (requirement_id, student_id)
    SELECT v_req_id, id FROM temp_eligible_students_uuid;

    INSERT INTO public.requirement_items (requirement_id, class_name, section_name, gender, item_name, size, quantity)
    SELECT 
        v_req_id,
        s.class_name,
        s.section,
        s.gender,
        ci.item_name,
        d.value AS size,
        count(*) AS quantity
    FROM temp_eligible_students_uuid ts
    JOIN public.students s ON s.id = ts.id
    JOIN public.student_uniform_sizes sus ON s.id = sus.student_id
    JOIN LATERAL jsonb_each_text(sus.dynamic_sizes) d(key, value) ON true
    JOIN public.school_uniform_configuration_items ci ON ci.id::text = d.key
    JOIN public.school_uniform_configurations c ON c.id = ci.configuration_id
    WHERE s.school_id = p_school_id
      AND d.value IS NOT NULL
      AND d.value != ''
    GROUP BY s.class_name, s.section, s.gender, ci.item_name, d.value;

    v_order_number := 'ORD-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substring(md5(random()::text) from 1 for 6));

    INSERT INTO public.orders (
        school_id, requirement_id, order_number, status, created_at
    ) VALUES (
        p_school_id, v_req_id, v_order_number, 'submitted', now()
    ) RETURNING id INTO v_order_id;

    INSERT INTO public.order_status_history (
        order_id, status, note, created_at
    ) VALUES (
        v_order_id, 'submitted', 'Tracked requirement submitted with ' || v_total_students || ' students', now()
    );

    RETURN v_order_id;
END;
$$;

-- 6. Permissions
GRANT EXECUTE ON FUNCTION public.submit_requirement() TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_requirement() TO service_role;
GRANT EXECUTE ON FUNCTION public.submit_requirement(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_requirement(UUID) TO service_role;
