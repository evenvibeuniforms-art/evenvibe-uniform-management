-- Migration: Fix partial requirements and add order tracking stats RPC

-- 1. Redefine submit_requirement() to allow partial submission
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
    v_active_req_count INTEGER;
    v_inserted_items INTEGER;
    v_tracked_students INTEGER;
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

    -- 2. Check for existing active requirements
    SELECT count(*) INTO v_active_req_count
    FROM public.requirements
    WHERE school_id = v_school_id AND status IN ('submitted', 'under_review', 'confirmed');

    IF v_active_req_count > 0 THEN
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
          JOIN public.school_uniform_configuration_items ci ON ci.configuration_id = c.id
          WHERE c.school_id = v_school_id
            AND c.is_active = true
            AND c.gender = s.gender
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
        regular_uniform_students, tshirt_uniform_students, submitted_at
    ) VALUES (
        v_school_id, v_req_number, 'submitted', v_total_students, 
        COALESCE(v_regular_students, 0), COALESCE(v_tshirt_students, 0), now()
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

-- 2. Create get_order_tracking_stats RPC for secure UI fetching
CREATE OR REPLACE FUNCTION public.get_order_tracking_stats(p_order_id UUID)
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
    
    v_tracked_count INTEGER;
    v_eligible_count INTEGER;
    v_pending_count INTEGER;
    v_is_legacy BOOLEAN;
BEGIN
    v_profile_id := auth.uid();
    IF v_profile_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT role, school_id INTO v_role, v_user_school_id
    FROM public.profiles
    WHERE id = v_profile_id;

    -- Fetch order and ensure it belongs to the caller's school if school_admin
    SELECT school_id, requirement_id INTO v_order_school_id, v_req_id
    FROM public.orders
    WHERE id = p_order_id;

    IF v_order_school_id IS NULL THEN
        RAISE EXCEPTION 'Order not found';
    END IF;

    IF v_role = 'school_admin' AND v_order_school_id != v_user_school_id THEN
        RAISE EXCEPTION 'Unauthorized: Access denied to this order';
    END IF;

    -- Check legacy status
    SELECT count(*) INTO v_tracked_count
    FROM public.requirement_students 
    WHERE requirement_id = v_req_id;

    IF v_tracked_count = 0 THEN
        v_is_legacy := true;
        v_pending_count := 0;
        v_eligible_count := 0;
    ELSE
        v_is_legacy := false;
        
        -- Count all eligible students in the school
        SELECT count(*) INTO v_eligible_count
        FROM public.students s
        JOIN public.student_uniform_sizes sus ON s.id = sus.student_id
        WHERE s.school_id = v_order_school_id
          AND sus.is_complete = true
          AND NOT EXISTS (
              SELECT 1
              FROM public.school_uniform_configurations c
              JOIN public.school_uniform_configuration_items ci ON ci.configuration_id = c.id
              WHERE c.school_id = v_order_school_id
                AND c.is_active = true
                AND c.gender = s.gender
                AND ci.is_required = true
                AND (sus.dynamic_sizes IS NULL OR NOT (sus.dynamic_sizes ? ci.id::text) OR (sus.dynamic_sizes->>ci.id::text) = '')
          );

        -- Pending count is safely > 0
        v_pending_count := GREATEST(0, v_eligible_count - v_tracked_count);
    END IF;

    RETURN json_build_object(
        'is_legacy', v_is_legacy,
        'tracked_count', v_tracked_count,
        'eligible_count', v_eligible_count,
        'pending_count', v_pending_count
    );
END;
$$;

-- Secure the RPC
REVOKE EXECUTE ON FUNCTION public.get_order_tracking_stats(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_order_tracking_stats(UUID) TO authenticated, service_role;

-- 3. Make sure add_remaining_sizes uses exact same logic
CREATE OR REPLACE FUNCTION public.add_remaining_sizes(p_order_id UUID)
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
    v_order_status TEXT;
    v_is_legacy BOOLEAN;
    
    v_new_tracked_students INTEGER;
    v_new_regular_students INTEGER;
    v_new_tshirt_students INTEGER;
BEGIN
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

    -- Validate order ownership and status
    SELECT requirement_id, status INTO v_req_id, v_order_status
    FROM public.orders
    WHERE id = p_order_id AND school_id = v_school_id;

    IF v_req_id IS NULL THEN
        RAISE EXCEPTION 'Order not found or access denied.';
    END IF;

    IF v_order_status NOT IN ('submitted', 'under_review') THEN
        RAISE EXCEPTION 'Adding remaining sizes is not allowed for order status: %', v_order_status;
    END IF;

    -- Determine if legacy
    SELECT NOT EXISTS (
        SELECT 1 FROM public.requirement_students WHERE requirement_id = v_req_id
    ) INTO v_is_legacy;

    IF v_is_legacy THEN
        RAISE EXCEPTION 'Cannot add remaining sizes to a legacy order. Additional student details are not available.';
    END IF;

    -- Find eligible new students who are complete and NOT already tracked
    CREATE TEMP TABLE temp_new_students ON COMMIT DROP AS
    SELECT s.id, sus.uniform_type
    FROM public.students s
    JOIN public.student_uniform_sizes sus ON s.id = sus.student_id
    WHERE s.school_id = v_school_id
      AND sus.is_complete = true
      AND NOT EXISTS (
          SELECT 1 FROM public.requirement_students rs WHERE rs.requirement_id = v_req_id AND rs.student_id = s.id
      )
      -- Ensure no pending configurations for newly completed students
      AND NOT EXISTS (
          SELECT 1
          FROM public.school_uniform_configurations c
          JOIN public.school_uniform_configuration_items ci ON ci.configuration_id = c.id
          WHERE c.school_id = v_school_id
            AND c.is_active = true
            AND c.gender = s.gender
            AND ci.is_required = true
            AND (sus.dynamic_sizes IS NULL OR NOT (sus.dynamic_sizes ? ci.id::text) OR (sus.dynamic_sizes->>ci.id::text) = '')
      );

    SELECT count(*) INTO v_new_tracked_students FROM temp_new_students;

    IF v_new_tracked_students = 0 THEN
        RETURN json_build_object(
            'success', false,
            'error', 'All available student sizes have already been added.'
        );
    END IF;

    -- Insert into requirement_students
    INSERT INTO public.requirement_students (requirement_id, student_id)
    SELECT v_req_id, id FROM temp_new_students;

    -- Aggregate and Insert/Update requirement_items
    INSERT INTO public.requirement_items (requirement_id, class_name, section_name, gender, item_name, size, quantity)
    SELECT 
        v_req_id,
        s.class_name,
        s.section,
        s.gender,
        ci.item_name,
        d.value AS size,
        count(*) AS quantity
    FROM temp_new_students ts
    JOIN public.students s ON s.id = ts.id
    JOIN public.student_uniform_sizes sus ON s.id = sus.student_id
    JOIN LATERAL jsonb_each_text(sus.dynamic_sizes) d(key, value) ON true
    JOIN public.school_uniform_configuration_items ci ON ci.id::text = d.key
    JOIN public.school_uniform_configurations c ON c.id = ci.configuration_id
    WHERE s.school_id = v_school_id
      AND d.value IS NOT NULL
      AND d.value != ''
    GROUP BY s.class_name, s.section, s.gender, ci.item_name, d.value
    ON CONFLICT (requirement_id, COALESCE(class_name, 'Legacy'), COALESCE(section_name, 'Legacy'), COALESCE(gender, 'Legacy'), COALESCE(item_name, 'Legacy'), size)
    DO UPDATE SET quantity = public.requirement_items.quantity + EXCLUDED.quantity;

    -- Update requirement totals
    SELECT 
        COUNT(id) FILTER (WHERE uniform_type = 'regular'),
        COUNT(id) FILTER (WHERE uniform_type = 'tshirt')
    INTO v_new_regular_students, v_new_tshirt_students
    FROM temp_new_students;

    UPDATE public.requirements
    SET total_students = total_students + v_new_tracked_students,
        regular_uniform_students = regular_uniform_students + COALESCE(v_new_regular_students, 0),
        tshirt_uniform_students = tshirt_uniform_students + COALESCE(v_new_tshirt_students, 0),
        updated_at = now()
    WHERE id = v_req_id;

    -- Insert order history note
    INSERT INTO public.order_status_history (
        order_id, status, note, created_at
    ) VALUES (
        p_order_id, v_order_status, 'Added remaining sizes for ' || v_new_tracked_students || ' students', now()
    );

    RETURN json_build_object(
        'success', true,
        'added_students', v_new_tracked_students
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object(
            'success', false,
            'error', SQLERRM
        );
END;
$$;
