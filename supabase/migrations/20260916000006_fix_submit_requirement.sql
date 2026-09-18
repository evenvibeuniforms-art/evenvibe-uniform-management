-- Fix submit_requirement RPC to enforce dynamic size validation and reject partial orphans
-- Recalculate regular/tshirt counts using existing uniform_type column

CREATE OR REPLACE FUNCTION public.submit_requirement()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_profile_id UUID;
    v_role TEXT;
    v_school_id UUID;
    v_school_active BOOLEAN;
    v_req_id UUID;
    v_req_number TEXT;
    v_total_students INTEGER;
    v_pending_students INTEGER;
    v_regular_students INTEGER;
    v_tshirt_students INTEGER;
    v_order_id UUID;
    v_order_number TEXT;
    
    v_active_req_count INTEGER;
    
    v_expected_items INTEGER;
    v_valid_items INTEGER;
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

    -- Check if school is active
    SELECT is_active INTO v_school_active
    FROM public.schools
    WHERE id = v_school_id;

    IF v_school_active IS NOT TRUE THEN
        RAISE EXCEPTION 'Unauthorized: School is not active';
    END IF;

    -- 2. Check for existing active requirements
    SELECT count(*) INTO v_active_req_count
    FROM public.requirements
    WHERE school_id = v_school_id AND status IN ('submitted', 'under_review', 'confirmed');

    IF v_active_req_count > 0 THEN
        RAISE EXCEPTION 'An active requirement has already been submitted for this school.';
    END IF;

    -- 3. Verify students and completeness
    SELECT count(*) INTO v_total_students
    FROM public.students
    WHERE school_id = v_school_id;

    IF v_total_students = 0 THEN
        RAISE EXCEPTION 'No students found for this school.';
    END IF;

    -- 3a. Verify pending students (missing size record, incomplete, or missing a required configuration item)
    SELECT count(s.id) INTO v_pending_students
    FROM public.students s
    LEFT JOIN public.student_uniform_sizes sus ON s.id = sus.student_id
    WHERE s.school_id = v_school_id 
      AND (
          sus.id IS NULL 
          OR sus.is_complete = false
          OR EXISTS (
              SELECT 1
              FROM public.school_uniform_configurations c
              JOIN public.school_uniform_configuration_items ci ON ci.configuration_id = c.id
              WHERE c.school_id = v_school_id
                AND c.is_active = true
                AND c.gender = s.gender
                AND ci.is_required = true
                AND (sus.dynamic_sizes IS NULL OR NOT (sus.dynamic_sizes ? ci.id::text) OR (sus.dynamic_sizes->>ci.id::text) = '')
          )
      );

    IF v_pending_students > 0 THEN
        RAISE EXCEPTION 'Cannot submit: % students have incomplete sizes or are missing required uniform items.', v_pending_students;
    END IF;

    -- 3b. Verify no orphaned, invalid, or cross-school UUIDs in dynamic_sizes
    SELECT count(*)
    INTO v_expected_items
    FROM public.students s
    JOIN public.student_uniform_sizes sus ON s.id = sus.student_id
    JOIN LATERAL jsonb_each_text(sus.dynamic_sizes) d(key, value) ON true
    WHERE s.school_id = v_school_id
      AND d.value IS NOT NULL 
      AND d.value != '';

    IF v_expected_items = 0 THEN
        RAISE EXCEPTION 'Cannot submit: No dynamic sizes found (legacy sizing data is not supported for dynamic submission).';
    END IF;

    SELECT count(*)
    INTO v_valid_items
    FROM public.students s
    JOIN public.student_uniform_sizes sus ON s.id = sus.student_id
    JOIN LATERAL jsonb_each_text(sus.dynamic_sizes) d(key, value) ON true
    JOIN public.school_uniform_configuration_items ci ON ci.id::text = d.key
    JOIN public.school_uniform_configurations c ON c.id = ci.configuration_id
    WHERE s.school_id = v_school_id
      AND c.school_id = v_school_id
      AND c.is_active = true
      AND d.value IS NOT NULL 
      AND d.value != ''
      AND d.value = ANY(ci.available_sizes);
      
    IF v_valid_items < v_expected_items THEN
        RAISE EXCEPTION 'Cannot submit: Found % orphaned/invalid sizes. Please update student sizes to match the current active configuration.', (v_expected_items - v_valid_items);
    END IF;

    -- Calculate regular and tshirt counts from student_uniform_sizes
    SELECT 
        COUNT(s.id) FILTER (WHERE sus.uniform_type = 'regular'),
        COUNT(s.id) FILTER (WHERE sus.uniform_type = 'tshirt')
    INTO v_regular_students, v_tshirt_students
    FROM public.students s
    JOIN public.student_uniform_sizes sus ON s.id = sus.student_id
    WHERE s.school_id = v_school_id;

    -- 4. Create Requirement Record
    v_req_number := 'EV-REQ-' || to_char(now(), 'YYYY') || '-' || upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 6));

    INSERT INTO public.requirements (
        school_id, requirement_number, status, total_students, 
        regular_uniform_students, tshirt_uniform_students, submitted_at
    ) VALUES (
        v_school_id, v_req_number, 'submitted', v_total_students, 
        COALESCE(v_regular_students, 0), COALESCE(v_tshirt_students, 0), now()
    ) RETURNING id INTO v_req_id;

    -- 5. Insert Requirement Items Dynamically
    INSERT INTO public.requirement_items (requirement_id, gender, item_name, size, quantity)
    SELECT 
        v_req_id,
        c.gender,
        ci.item_name,
        d.value AS size,
        count(*) AS quantity
    FROM public.students s
    JOIN public.student_uniform_sizes sus ON s.id = sus.student_id
    JOIN LATERAL jsonb_each_text(sus.dynamic_sizes) d(key, value) ON true
    JOIN public.school_uniform_configuration_items ci ON ci.id::text = d.key
    JOIN public.school_uniform_configurations c ON c.id = ci.configuration_id
    WHERE s.school_id = v_school_id
      AND d.value IS NOT NULL
      AND d.value != ''
    GROUP BY c.gender, ci.item_name, d.value;

    GET DIAGNOSTICS v_inserted_items = ROW_COUNT;
    IF v_inserted_items = 0 THEN
        RAISE EXCEPTION 'Cannot submit: Aggregation produced 0 valid items. Verify student size data.';
    END IF;

    -- 6. Create Order Record
    v_order_number := 'EV-ORD-' || to_char(now(), 'YYYY') || '-' || upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 6));

    INSERT INTO public.orders (
        school_id, requirement_id, order_number, status, created_at
    ) VALUES (
        v_school_id, v_req_id, v_order_number, 'submitted', now()
    ) RETURNING id INTO v_order_id;

    -- 7. Insert Initial Order Status History
    INSERT INTO public.order_status_history (
        order_id, status, note, created_at
    ) VALUES (
        v_order_id, 'submitted', 'Requirement submitted successfully', now()
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
