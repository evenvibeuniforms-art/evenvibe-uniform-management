-- Migration to support Legacy Order persistent tracking mode and explicit student additions

-- 1. Add tracking_mode to requirements
ALTER TABLE public.requirements
ADD COLUMN IF NOT EXISTS tracking_mode TEXT DEFAULT 'legacy' CHECK (tracking_mode IN ('tracked', 'legacy'));

-- Determine legacy vs tracked based on current requirement_students count
UPDATE public.requirements r
SET tracking_mode = 'tracked'
WHERE r.total_students = (SELECT count(*) FROM public.requirement_students rs WHERE rs.requirement_id = r.id);

-- Update submit_requirement to create tracked orders
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

    CREATE TEMP TABLE temp_eligible_students ON COMMIT DROP AS
    SELECT s.id, sus.uniform_type
    FROM public.students s
    JOIN public.student_uniform_sizes sus ON s.id = sus.student_id
    WHERE s.school_id = p_school_id
      AND sus.is_complete = true
      AND NOT EXISTS (
          SELECT 1
          FROM public.school_uniform_configurations c
          JOIN public.school_uniform_configuration_items ci ON ci.configuration_id = c.id
          WHERE c.school_id = p_school_id
            AND c.is_active = true
            AND c.gender = s.gender
            AND ci.is_required = true
            AND (sus.dynamic_sizes IS NULL OR NOT (sus.dynamic_sizes ? ci.id::text) OR (sus.dynamic_sizes->>ci.id::text) = '')
      );

    SELECT count(*) INTO v_total_students FROM temp_eligible_students;
    
    IF v_total_students = 0 THEN
        RAISE EXCEPTION 'No students with complete uniform sizes found for submission.';
    END IF;

    SELECT 
        COUNT(id) FILTER (WHERE uniform_type = 'regular'),
        COUNT(id) FILTER (WHERE uniform_type = 'tshirt')
    INTO v_regular_count, v_tshirt_count
    FROM temp_eligible_students;

    INSERT INTO public.requirements (
        school_id, requirement_number, status, total_students, 
        regular_uniform_students, tshirt_uniform_students, tracking_mode
    ) VALUES (
        p_school_id, v_req_number, 'submitted', v_total_students, 
        COALESCE(v_regular_count, 0), COALESCE(v_tshirt_count, 0), 'tracked'
    ) RETURNING id INTO v_req_id;

    INSERT INTO public.requirement_students (requirement_id, student_id)
    SELECT v_req_id, id FROM temp_eligible_students;

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
    WHERE s.school_id = p_school_id
      AND d.value IS NOT NULL
      AND d.value != ''
    GROUP BY s.class_name, s.section, s.gender, ci.item_name, d.value;

    v_order_number := 'EV-ORD-' || to_char(now(), 'YYYY') || '-' || upper(substring(md5(random()::text) from 1 for 6));
    
    INSERT INTO public.orders (
        school_id, requirement_id, order_number, status
    ) VALUES (
        p_school_id, v_req_id, v_order_number, 'submitted'
    ) RETURNING id INTO v_order_id;

    INSERT INTO public.order_status_history (
        order_id, status, note
    ) VALUES (
        v_order_id, 'submitted', 'Order submitted and awaiting review'
    );

    RETURN v_order_id;
END;
$$;


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
    v_req_total_students INTEGER;
    v_tracking_mode TEXT;
    
    v_tracked_count INTEGER;
    v_total_students_count INTEGER;
    v_completed_eligible_count INTEGER;
    
    v_ready_to_add_count INTEGER;
    v_pending_count INTEGER;
    v_is_legacy BOOLEAN;
    
    v_legacy_eligible_students JSON;
BEGIN
    v_profile_id := auth.uid();
    IF v_profile_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT role, school_id INTO v_role, v_user_school_id
    FROM public.profiles
    WHERE id = v_profile_id;

    -- Fetch order and requirement info
    SELECT o.school_id, o.requirement_id, r.total_students, r.tracking_mode
    INTO v_order_school_id, v_req_id, v_req_total_students, v_tracking_mode
    FROM public.orders o
    JOIN public.requirements r ON o.requirement_id = r.id
    WHERE o.id = p_order_id;

    IF v_order_school_id IS NULL THEN
        RAISE EXCEPTION 'Order not found';
    END IF;

    IF v_role = 'school_admin' AND v_order_school_id != v_user_school_id THEN
        RAISE EXCEPTION 'Unauthorized: Access denied to this order';
    END IF;

    -- Count how many students are tracked for this requirement
    SELECT count(*) INTO v_tracked_count
    FROM public.requirement_students 
    WHERE requirement_id = v_req_id;

    IF v_tracking_mode = 'legacy' THEN
        v_is_legacy := true;
        v_ready_to_add_count := 0;
        v_pending_count := 0;
        
        -- For legacy orders, find all students in the school who are complete and NOT tracked
        SELECT COALESCE(json_agg(
            json_build_object(
                'id', s.id,
                'first_name', s.first_name,
                'last_name', s.last_name,
                'class_name', s.class_name,
                'section', s.section,
                'gender', s.gender
            )
        ), '[]'::json)
        INTO v_legacy_eligible_students
        FROM public.students s
        JOIN public.student_uniform_sizes sus ON s.id = sus.student_id
        WHERE s.school_id = v_order_school_id
          AND sus.is_complete = true
          AND NOT EXISTS (
              SELECT 1 FROM public.requirement_students rs WHERE rs.requirement_id = v_req_id AND rs.student_id = s.id
          )
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
          
    ELSE
        v_is_legacy := false;
        v_legacy_eligible_students := '[]'::json;
        
        -- Get ALL active students in the school
        SELECT count(*) INTO v_total_students_count
        FROM public.students
        WHERE school_id = v_order_school_id;
        
        -- Count all eligible students in the school whose sizes are COMPLETE
        SELECT count(*) INTO v_completed_eligible_count
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

        v_ready_to_add_count := GREATEST(0, v_completed_eligible_count - v_tracked_count);
        v_pending_count := GREATEST(0, v_total_students_count - v_completed_eligible_count);
    END IF;

    RETURN json_build_object(
        'is_legacy', v_is_legacy,
        'tracking_mode', COALESCE(v_tracking_mode, 'legacy'),
        'tracked_count', v_tracked_count,
        'ready_to_add_count', v_ready_to_add_count,
        'pending_count', v_pending_count,
        'legacy_eligible_students', v_legacy_eligible_students
    );
END;
$$;


-- Create add_legacy_students_to_order RPC
CREATE OR REPLACE FUNCTION public.add_legacy_students_to_order(p_order_id UUID, p_student_ids UUID[])
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
    v_tracking_mode TEXT;
    
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
    SELECT o.requirement_id, o.status, r.tracking_mode
    INTO v_req_id, v_order_status, v_tracking_mode
    FROM public.orders o
    JOIN public.requirements r ON o.requirement_id = r.id
    WHERE o.id = p_order_id AND o.school_id = v_school_id;

    IF v_req_id IS NULL THEN
        RAISE EXCEPTION 'Order not found or access denied.';
    END IF;

    IF v_order_status NOT IN ('submitted', 'under_review') THEN
        RAISE EXCEPTION 'Adding remaining sizes is not allowed for order status: %', v_order_status;
    END IF;

    IF v_tracking_mode != 'legacy' THEN
        RAISE EXCEPTION 'This order is fully tracked. Please use the standard Add Remaining Sizes function.';
    END IF;

    -- Find eligible new students from the provided list
    CREATE TEMP TABLE temp_legacy_new_students ON COMMIT DROP AS
    SELECT s.id, sus.uniform_type
    FROM public.students s
    JOIN public.student_uniform_sizes sus ON s.id = sus.student_id
    WHERE s.school_id = v_school_id
      AND s.id = ANY(p_student_ids)
      AND sus.is_complete = true
      AND NOT EXISTS (
          SELECT 1 FROM public.requirement_students rs WHERE rs.requirement_id = v_req_id AND rs.student_id = s.id
      )
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

    SELECT count(*) INTO v_new_tracked_students FROM temp_legacy_new_students;

    IF v_new_tracked_students = 0 THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Selected students are already added or not eligible.'
        );
    END IF;

    -- Insert into requirement_students
    INSERT INTO public.requirement_students (requirement_id, student_id)
    SELECT v_req_id, id FROM temp_legacy_new_students;

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
    FROM temp_legacy_new_students ts
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
    FROM temp_legacy_new_students;

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
        p_order_id, v_order_status, 'Added ' || v_new_tracked_students || ' students to legacy order', now()
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

-- Secure the RPCs
REVOKE EXECUTE ON FUNCTION public.add_legacy_students_to_order(UUID, UUID[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.add_legacy_students_to_order(UUID, UUID[]) TO authenticated, service_role;
