-- Migration: 20260929000000_selected_students_only_requirement.sql
-- Description: Allow School Admin to select only specific students when submitting a new requirement / order.
-- Aggregates requirement_items and tracks requirement_students ONLY for explicitly selected students.
-- Preserves multiple-orders per school and allows same student in multiple orders over time.

DROP FUNCTION IF EXISTS public.submit_requirement();
DROP FUNCTION IF EXISTS public.submit_requirement(UUID[]);

CREATE OR REPLACE FUNCTION public.submit_requirement(p_student_ids UUID[] DEFAULT NULL)
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
    v_selected_count INTEGER;
    v_valid_students_count INTEGER;
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

    -- 2. Check for active in-flight orders for this school
    -- Terminal orders ('delivered', 'cancelled') do NOT block new orders.
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

    -- 3. Student selection validation
    IF p_student_ids IS NOT NULL THEN
        v_selected_count := array_length(p_student_ids, 1);
        IF v_selected_count IS NULL OR v_selected_count = 0 THEN
            RAISE EXCEPTION 'Please select at least one student for this order.';
        END IF;

        -- Deduplicate and verify all selected students belong to this school
        SELECT count(DISTINCT id) INTO v_valid_students_count
        FROM public.students
        WHERE school_id = v_school_id
          AND id = ANY(p_student_ids);

        IF v_valid_students_count != v_selected_count THEN
            RAISE EXCEPTION 'One or more selected students are invalid or do not belong to your school.';
        END IF;
    END IF;

    -- 4. Identify eligible completed students safely (filtered by selected students if provided)
    CREATE TEMP TABLE temp_eligible_students ON COMMIT DROP AS
    SELECT s.id, sus.uniform_type
    FROM public.students s
    JOIN public.student_uniform_sizes sus ON s.id = sus.student_id
    WHERE s.school_id = v_school_id
      AND (p_student_ids IS NULL OR s.id = ANY(p_student_ids))
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

    -- ZERO-STUDENT OR INCOMPLETE PROTECTION
    IF v_total_students = 0 THEN
        RAISE EXCEPTION 'No completed student sizes are available to submit.';
    END IF;

    IF p_student_ids IS NOT NULL AND v_total_students != v_selected_count THEN
        RAISE EXCEPTION 'Some selected students have incomplete uniform sizes. Please complete their sizes before submitting.';
    END IF;

    SELECT 
        COUNT(id) FILTER (WHERE uniform_type = 'regular'),
        COUNT(id) FILTER (WHERE uniform_type = 'tshirt')
    INTO v_regular_students, v_tshirt_students
    FROM temp_eligible_students;

    -- 5. Create Requirement
    v_req_number := 'EV-REQ-' || to_char(now(), 'YYYY') || '-' || upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 6));

    INSERT INTO public.requirements (
        school_id, requirement_number, status, total_students, 
        regular_uniform_students, tshirt_uniform_students, submitted_at, tracking_mode
    ) VALUES (
        v_school_id, v_req_number, 'submitted', v_total_students, 
        COALESCE(v_regular_students, 0), COALESCE(v_tshirt_students, 0), now(), 'tracked'
    ) RETURNING id INTO v_req_id;

    -- 6. Track ONLY selected eligible students
    INSERT INTO public.requirement_students (requirement_id, student_id)
    SELECT v_req_id, id FROM temp_eligible_students;

    -- 7. Insert Requirement Items Dynamically from selected students only
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

    -- 8. Create Order
    v_order_number := 'EV-ORD-' || to_char(now(), 'YYYY') || '-' || upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 6));

    INSERT INTO public.orders (
        school_id, requirement_id, order_number, status, created_at
    ) VALUES (
        v_school_id, v_req_id, v_order_number, 'submitted', now()
    ) RETURNING id INTO v_order_id;

    -- 9. Record History
    INSERT INTO public.order_status_history (
        order_id, status, note, created_at
    ) VALUES (
        v_order_id, 'submitted', 'Requirement submitted successfully with ' || v_total_students || ' selected students', now()
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

GRANT EXECUTE ON FUNCTION public.submit_requirement(UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_requirement(UUID[]) TO service_role;
