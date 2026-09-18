-- Migration: Add Remaining Sizes and Cancel Order

-- 1. Create requirement_students table for tracking
CREATE TABLE IF NOT EXISTS public.requirement_students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requirement_id UUID NOT NULL REFERENCES public.requirements(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(requirement_id, student_id)
);

CREATE INDEX IF NOT EXISTS req_students_req_idx ON public.requirement_students(requirement_id);
CREATE INDEX IF NOT EXISTS req_students_student_idx ON public.requirement_students(student_id);

ALTER TABLE public.requirement_students ENABLE ROW LEVEL SECURITY;

CREATE POLICY "School Admins can view own school's requirement students"
    ON public.requirement_students FOR SELECT
    USING (
        requirement_id IN (
            SELECT id FROM public.requirements WHERE school_id = public.get_my_school_id()
        ) AND public.get_my_role() = 'school_admin'
    );

GRANT SELECT ON public.requirement_students TO authenticated, service_role;

-- 2. Update submit_requirement to populate requirement_students
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
    v_tracked_students INTEGER;
BEGIN
    -- Authentication and Authorization
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

    SELECT is_active INTO v_school_active
    FROM public.schools
    WHERE id = v_school_id;

    IF v_school_active IS NOT TRUE THEN
        RAISE EXCEPTION 'Unauthorized: School is not active';
    END IF;

    SELECT count(*) INTO v_active_req_count
    FROM public.requirements
    WHERE school_id = v_school_id AND status IN ('submitted', 'under_review', 'confirmed');

    IF v_active_req_count > 0 THEN
        RAISE EXCEPTION 'An active requirement has already been submitted for this school.';
    END IF;

    -- Verify students and completeness
    SELECT count(*) INTO v_total_students
    FROM public.students
    WHERE school_id = v_school_id;

    IF v_total_students = 0 THEN
        RAISE EXCEPTION 'No students found for this school.';
    END IF;

    -- Verify pending students
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

    -- Verify dynamic sizes
    SELECT count(*)
    INTO v_expected_items
    FROM public.students s
    JOIN public.student_uniform_sizes sus ON s.id = sus.student_id
    JOIN LATERAL jsonb_each_text(sus.dynamic_sizes) d(key, value) ON true
    WHERE s.school_id = v_school_id
      AND d.value IS NOT NULL 
      AND d.value != '';

    IF v_expected_items = 0 THEN
        RAISE EXCEPTION 'Cannot submit: No dynamic sizes found.';
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
        RAISE EXCEPTION 'Cannot submit: Found orphaned/invalid sizes.';
    END IF;

    SELECT 
        COUNT(s.id) FILTER (WHERE sus.uniform_type = 'regular'),
        COUNT(s.id) FILTER (WHERE sus.uniform_type = 'tshirt')
    INTO v_regular_students, v_tshirt_students
    FROM public.students s
    JOIN public.student_uniform_sizes sus ON s.id = sus.student_id
    WHERE s.school_id = v_school_id;

    v_req_number := 'EV-REQ-' || to_char(now(), 'YYYY') || '-' || upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 6));

    INSERT INTO public.requirements (
        school_id, requirement_number, status, total_students, 
        regular_uniform_students, tshirt_uniform_students, submitted_at
    ) VALUES (
        v_school_id, v_req_number, 'submitted', v_total_students, 
        COALESCE(v_regular_students, 0), COALESCE(v_tshirt_students, 0), now()
    ) RETURNING id INTO v_req_id;

    -- Track included students
    INSERT INTO public.requirement_students (requirement_id, student_id)
    SELECT v_req_id, s.id
    FROM public.students s
    JOIN public.student_uniform_sizes sus ON s.id = sus.student_id
    WHERE s.school_id = v_school_id;

    GET DIAGNOSTICS v_tracked_students = ROW_COUNT;

    -- Insert Requirement Items Dynamically
    INSERT INTO public.requirement_items (requirement_id, class_name, section_name, gender, item_name, size, quantity)
    SELECT 
        v_req_id,
        s.class_name,
        s.section,
        s.gender,
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
    GROUP BY s.class_name, s.section, s.gender, ci.item_name, d.value;

    GET DIAGNOSTICS v_inserted_items = ROW_COUNT;
    IF v_inserted_items = 0 THEN
        RAISE EXCEPTION 'Cannot submit: Aggregation produced 0 valid items.';
    END IF;

    v_order_number := 'EV-ORD-' || to_char(now(), 'YYYY') || '-' || upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 6));

    INSERT INTO public.orders (
        school_id, requirement_id, order_number, status, created_at
    ) VALUES (
        v_school_id, v_req_id, v_order_number, 'submitted', now()
    ) RETURNING id INTO v_order_id;

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

-- 3. Create add_remaining_sizes RPC
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
    
    v_pending_sizes_count INTEGER;
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

    -- Determine if legacy (no students tracked)
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
        RAISE EXCEPTION 'No new completed student sizes found to add.';
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

-- 4. Create cancel_order RPC
CREATE OR REPLACE FUNCTION public.cancel_order(p_order_id UUID, p_reason TEXT)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_profile_id UUID;
    v_role TEXT;
    v_school_id UUID;
    v_order_status TEXT;
    v_req_id UUID;
BEGIN
    v_profile_id := auth.uid();
    IF v_profile_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT role, school_id INTO v_role, v_school_id
    FROM public.profiles
    WHERE id = v_profile_id;

    IF v_role NOT IN ('school_admin', 'evenvibe_admin') THEN
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    SELECT requirement_id, status INTO v_req_id, v_order_status
    FROM public.orders
    WHERE id = p_order_id AND (v_role = 'evenvibe_admin' OR school_id = v_school_id);

    IF v_req_id IS NULL THEN
        RAISE EXCEPTION 'Order not found or access denied.';
    END IF;

    IF v_order_status IN ('production', 'quality_check', 'packed', 'dispatched', 'in_transit', 'delivered', 'cancelled') THEN
        RAISE EXCEPTION 'Cannot cancel order in status: %', v_order_status;
    END IF;

    UPDATE public.orders
    SET status = 'cancelled', updated_at = now()
    WHERE id = p_order_id;

    -- We keep the requirement as is but maybe change its status to draft? No, the order is cancelled, history is kept.
    -- If we don't change requirement status, it might still prevent new requirements if it was 'submitted'.
    -- We should cancel the requirement too so the school can submit a new one.
    UPDATE public.requirements
    SET status = 'draft', updated_at = now() 
    WHERE id = v_req_id;

    INSERT INTO public.order_status_history (
        order_id, status, note, created_at
    ) VALUES (
        p_order_id, 'cancelled', COALESCE(p_reason, 'Order cancelled'), now()
    );

    RETURN json_build_object(
        'success', true
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object(
            'success', false,
            'error', SQLERRM
        );
END;
$$;
