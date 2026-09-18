-- Migration: Fix available_sizes array containment in add students RPCs

CREATE OR REPLACE FUNCTION public.get_eligible_students_for_order(p_order_id UUID)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_profile_id UUID;
    v_role TEXT;
    v_user_school_id UUID;
    v_order_school_id UUID;
    v_req_id UUID;
    v_order_status TEXT;
    v_eligible_students JSON;
BEGIN
    -- Auth check
    v_profile_id := auth.uid();
    IF v_profile_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT role, school_id INTO v_role, v_user_school_id
    FROM public.profiles
    WHERE id = v_profile_id;

    IF v_role != 'school_admin' OR v_user_school_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Must be a school admin';
    END IF;

    -- Order check
    SELECT o.school_id, o.requirement_id, o.status
    INTO v_order_school_id, v_req_id, v_order_status
    FROM public.orders o
    WHERE o.id = p_order_id;

    IF v_order_school_id IS NULL THEN
        RAISE EXCEPTION 'Order not found';
    END IF;

    IF v_order_school_id != v_user_school_id THEN
        RAISE EXCEPTION 'Unauthorized: Access denied to this order';
    END IF;

    -- If order is not submitted or under_review, additions are locked
    IF v_order_status NOT IN ('submitted', 'under_review') THEN
        RETURN json_build_object(
            'can_add', false,
            'reason', 'Students can no longer be added at this stage.',
            'students', '[]'::json
        );
    END IF;

    -- Query eligible students
    SELECT COALESCE(json_agg(
        json_build_object(
            'id', s.id,
            'student_name', s.student_name,
            'admission_number', s.admission_number,
            'class_name', s.class_name,
            'section', s.section,
            'gender', s.gender,
            'is_complete', sus.is_complete
        ) ORDER BY s.admission_number, s.student_name
    ), '[]'::json)
    INTO v_eligible_students
    FROM public.students s
    JOIN public.student_uniform_sizes sus ON s.id = sus.student_id
    WHERE s.school_id = v_order_school_id
      AND s.is_active = true
      AND sus.is_complete = true
      -- Not already included in this requirement
      AND NOT EXISTS (
          SELECT 1 FROM public.requirement_students rs 
          WHERE rs.requirement_id = v_req_id AND rs.student_id = s.id
      )
      -- Has active matching configuration for exact gender and class
      AND EXISTS (
          SELECT 1 
          FROM public.school_uniform_configurations c
          JOIN public.school_uniform_configuration_classes cc ON cc.configuration_id = c.id
          WHERE c.school_id = v_order_school_id
            AND c.is_active = true
            AND lower(c.gender) = lower(s.gender)
            AND cc.class_name = s.class_name
      )
      -- Satisfies all required active configuration items
      AND NOT EXISTS (
          SELECT 1
          FROM public.school_uniform_configurations c
          JOIN public.school_uniform_configuration_classes cc ON cc.configuration_id = c.id
          JOIN public.school_uniform_configuration_items ci ON ci.configuration_id = c.id
          WHERE c.school_id = v_order_school_id
            AND c.is_active = true
            AND lower(c.gender) = lower(s.gender)
            AND cc.class_name = s.class_name
            AND ci.is_active = true
            AND ci.is_required = true
            AND (
                sus.dynamic_sizes IS NULL 
                OR NOT (sus.dynamic_sizes ? ci.id::text) 
                OR (sus.dynamic_sizes->>ci.id::text) IS NULL
                OR (sus.dynamic_sizes->>ci.id::text) = ''
                OR (
                    ci.available_sizes IS NOT NULL 
                    AND NOT ((sus.dynamic_sizes->>ci.id::text) = ANY(ci.available_sizes))
                )
            )
      );

    RETURN json_build_object(
        'can_add', true,
        'order_status', v_order_status,
        'students', v_eligible_students
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.add_students_to_existing_order(
    p_order_id UUID,
    p_student_ids UUID[]
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_profile_id UUID;
    v_role TEXT;
    v_user_school_id UUID;
    v_order_school_id UUID;
    v_req_id UUID;
    v_order_status TEXT;
    v_input_count INTEGER;
    v_eligible_count INTEGER;
    v_new_regular_students INTEGER;
    v_new_tshirt_students INTEGER;
    v_history_note TEXT;
BEGIN
    -- 1. Authentication
    v_profile_id := auth.uid();
    IF v_profile_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT role, school_id INTO v_role, v_user_school_id
    FROM public.profiles
    WHERE id = v_profile_id;

    IF v_role != 'school_admin' OR v_user_school_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Must be a school admin';
    END IF;

    -- 2. Input validation
    IF p_student_ids IS NULL OR array_length(p_student_ids, 1) IS NULL OR array_length(p_student_ids, 1) = 0 THEN
        RETURN json_build_object('success', false, 'error', 'No students selected.');
    END IF;

    -- Deduplicate input IDs
    SELECT array_agg(DISTINCT id) INTO p_student_ids
    FROM unnest(p_student_ids) AS id;

    v_input_count := array_length(p_student_ids, 1);

    -- 3. Order & Requirement lookup
    SELECT o.school_id, o.requirement_id, o.status
    INTO v_order_school_id, v_req_id, v_order_status
    FROM public.orders o
    WHERE o.id = p_order_id;

    IF v_order_school_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Order not found.');
    END IF;

    IF v_order_school_id != v_user_school_id THEN
        RETURN json_build_object('success', false, 'error', 'Unauthorized: Access denied to this order.');
    END IF;

    IF v_order_status NOT IN ('submitted', 'under_review') THEN
        RETURN json_build_object(
            'success', false, 
            'error', 'Students can no longer be added because this order has moved to the ' || v_order_status || ' stage.'
        );
    END IF;

    -- 4. Validate ALL selected students
    CREATE TEMP TABLE temp_valid_add_students ON COMMIT DROP AS
    SELECT s.id, s.class_name, s.section, s.gender, sus.uniform_type, sus.dynamic_sizes
    FROM public.students s
    JOIN public.student_uniform_sizes sus ON s.id = sus.student_id
    WHERE s.id = ANY(p_student_ids)
      AND s.school_id = v_order_school_id
      AND s.is_active = true
      AND sus.is_complete = true
      -- Must not already be tracked
      AND NOT EXISTS (
          SELECT 1 FROM public.requirement_students rs 
          WHERE rs.requirement_id = v_req_id AND rs.student_id = s.id
      )
      -- Must match active configuration
      AND EXISTS (
          SELECT 1 
          FROM public.school_uniform_configurations c
          JOIN public.school_uniform_configuration_classes cc ON cc.configuration_id = c.id
          WHERE c.school_id = v_order_school_id
            AND c.is_active = true
            AND lower(c.gender) = lower(s.gender)
            AND cc.class_name = s.class_name
      )
      -- Must satisfy all required items
      AND NOT EXISTS (
          SELECT 1
          FROM public.school_uniform_configurations c
          JOIN public.school_uniform_configuration_classes cc ON cc.configuration_id = c.id
          JOIN public.school_uniform_configuration_items ci ON ci.configuration_id = c.id
          WHERE c.school_id = v_order_school_id
            AND c.is_active = true
            AND lower(c.gender) = lower(s.gender)
            AND cc.class_name = s.class_name
            AND ci.is_active = true
            AND ci.is_required = true
            AND (
                sus.dynamic_sizes IS NULL 
                OR NOT (sus.dynamic_sizes ? ci.id::text) 
                OR (sus.dynamic_sizes->>ci.id::text) IS NULL
                OR (sus.dynamic_sizes->>ci.id::text) = ''
                OR (
                    ci.available_sizes IS NOT NULL 
                    AND NOT ((sus.dynamic_sizes->>ci.id::text) = ANY(ci.available_sizes))
                )
            )
      );

    SELECT count(*) INTO v_eligible_count FROM temp_valid_add_students;

    -- Strict check: every single requested student must be valid
    IF v_eligible_count != v_input_count THEN
        RETURN json_build_object(
            'success', false, 
            'error', 'One or more selected students are invalid, already included, or have incomplete sizes.'
        );
    END IF;

    -- 5. Insert into requirement_students
    INSERT INTO public.requirement_students (requirement_id, student_id)
    SELECT v_req_id, id FROM temp_valid_add_students;

    -- 6. Increment requirement_items quantities atomically
    INSERT INTO public.requirement_items (requirement_id, class_name, section_name, gender, item_name, size, quantity)
    SELECT 
        v_req_id,
        ts.class_name,
        ts.section,
        ts.gender,
        ci.item_name,
        d.value AS size,
        count(*) AS quantity
    FROM temp_valid_add_students ts
    JOIN LATERAL jsonb_each_text(ts.dynamic_sizes) d(key, value) ON true
    JOIN public.school_uniform_configuration_items ci ON ci.id::text = d.key
    JOIN public.school_uniform_configurations c ON c.id = ci.configuration_id
    WHERE c.school_id = v_order_school_id
      AND c.is_active = true
      AND ci.is_active = true
      AND d.value IS NOT NULL
      AND d.value != ''
    GROUP BY ts.class_name, ts.section, ts.gender, ci.item_name, d.value
    ON CONFLICT (requirement_id, COALESCE(class_name, 'Legacy'), COALESCE(section_name, 'Legacy'), COALESCE(gender, 'Legacy'), COALESCE(item_name, 'Legacy'), size)
    DO UPDATE SET quantity = public.requirement_items.quantity + EXCLUDED.quantity;

    -- 7. Update requirement totals
    SELECT 
        COUNT(id) FILTER (WHERE uniform_type = 'regular'),
        COUNT(id) FILTER (WHERE uniform_type = 'tshirt')
    INTO v_new_regular_students, v_new_tshirt_students
    FROM temp_valid_add_students;

    UPDATE public.requirements
    SET total_students = total_students + v_eligible_count,
        regular_uniform_students = regular_uniform_students + COALESCE(v_new_regular_students, 0),
        tshirt_uniform_students = tshirt_uniform_students + COALESCE(v_new_tshirt_students, 0),
        updated_at = now()
    WHERE id = v_req_id;

    -- 8. Record user-friendly order status history
    v_history_note := v_eligible_count || ' additional students added to this order.';

    INSERT INTO public.order_status_history (
        order_id, status, note, created_at
    ) VALUES (
        p_order_id, v_order_status, v_history_note, now()
    );

    RETURN json_build_object(
        'success', true,
        'added_students', v_eligible_count,
        'order_id', p_order_id
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object(
            'success', false,
            'error', SQLERRM
        );
END;
$$;
