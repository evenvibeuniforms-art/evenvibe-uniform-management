-- ============================================================================
-- Migration: 20261003000000_submit_requirement_uniform_style_master.sql
-- Description: Update submit_requirement RPC to make Uniform Styles the authoritative
-- source for item & style snapshotting while keeping full legacy backward compatibility.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.submit_requirement(p_student_ids UUID[] DEFAULT NULL)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_school_id UUID;
    v_req_id UUID;
    v_order_id UUID;
    v_req_number TEXT;
    v_order_number TEXT;
    v_total_students INT := 0;
    v_inserted_items INT := 0;
    v_selected_count INT := 0;
    v_valid_students_count INT := 0;
BEGIN
    -- 1. Authorization: verify school_admin
    SELECT school_id INTO v_school_id
    FROM public.profiles
    WHERE id = auth.uid() AND role = 'school_admin';

    IF v_school_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Only school admins can submit requirements.';
    END IF;

    -- 2. Check for active unlinked requirement
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

        SELECT count(DISTINCT id) INTO v_valid_students_count
        FROM public.students
        WHERE school_id = v_school_id
          AND id = ANY(p_student_ids);

        IF v_valid_students_count != v_selected_count THEN
            RAISE EXCEPTION 'One or more selected students are invalid or do not belong to your school.';
        END IF;
    END IF;

    -- 4. Identify eligible completed students safely
    -- A student is eligible if is_complete is true
    CREATE TEMP TABLE temp_eligible_students ON COMMIT DROP AS
    SELECT s.id, sus.uniform_type
    FROM public.students s
    JOIN public.student_uniform_sizes sus ON s.id = sus.student_id
    WHERE s.school_id = v_school_id
      AND (p_student_ids IS NULL OR s.id = ANY(p_student_ids))
      AND sus.is_complete = true;

    SELECT count(*) INTO v_total_students FROM temp_eligible_students;

    IF v_total_students = 0 THEN
        RAISE EXCEPTION 'No eligible students with complete sizes found for submission.';
    END IF;

    -- 5. Create Requirement
    v_req_number := 'REQ-' || to_char(now(), 'YYYY') || '-' || upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 6));

    INSERT INTO public.requirements (
        school_id, requirement_number, status, total_students, submitted_at, created_at
    ) VALUES (
        v_school_id, v_req_number, 'submitted', v_total_students, now(), now()
    ) RETURNING id INTO v_req_id;

    -- 6. Link students to requirement
    INSERT INTO public.requirement_students (
        requirement_id, student_id, created_at
    )
    SELECT v_req_id, id, now()
    FROM temp_eligible_students;

    -- 7. Snapshot Requirement Items (aggregating sizes and preserving style_id and style_name)
    INSERT INTO public.requirement_items (
        requirement_id,
        class_name,
        section,
        gender,
        item_name,
        style_id,
        style_name,
        size,
        quantity
    )
    SELECT 
        v_req_id,
        s.class_name,
        s.section,
        s.gender,
        COALESCE(us.item_name, ci.item_name, 'Uniform Item') AS item_name,
        COALESCE(
            CASE 
                WHEN sus.dynamic_styles ? d.key 
                     AND (sus.dynamic_styles->d.key->>'style_id') ~ '^[0-9a-fA-F-]{36}$'
                THEN (sus.dynamic_styles->d.key->>'style_id')::uuid
                ELSE NULL 
            END,
            us.id
        ) AS style_id,
        COALESCE(
            CASE 
                WHEN sus.dynamic_styles ? d.key 
                THEN NULLIF(trim(sus.dynamic_styles->d.key->>'style_name'), '')
                ELSE NULL 
            END,
            us.style_name,
            'Legacy Style'
        ) AS style_name,
        d.value AS size,
        count(*) AS quantity
    FROM temp_eligible_students ts
    JOIN public.students s ON s.id = ts.id
    JOIN public.student_uniform_sizes sus ON s.id = sus.student_id
    JOIN LATERAL jsonb_each_text(sus.dynamic_sizes) d(key, value) ON true
    LEFT JOIN public.uniform_styles us ON (
        us.id::text = d.key 
        OR (sus.dynamic_styles ? d.key AND (sus.dynamic_styles->d.key->>'style_id') = us.id::text)
    )
    LEFT JOIN public.school_uniform_configuration_items ci ON ci.id::text = d.key
    WHERE s.school_id = v_school_id
      AND (us.id IS NOT NULL OR ci.id IS NOT NULL)
      AND d.value IS NOT NULL
      AND d.value != ''
    GROUP BY 
        s.class_name, 
        s.section, 
        s.gender, 
        COALESCE(us.item_name, ci.item_name, 'Uniform Item'), 
        COALESCE(
            CASE 
                WHEN sus.dynamic_styles ? d.key 
                     AND (sus.dynamic_styles->d.key->>'style_id') ~ '^[0-9a-fA-F-]{36}$'
                THEN (sus.dynamic_styles->d.key->>'style_id')::uuid
                ELSE NULL 
            END,
            us.id
        ),
        COALESCE(
            CASE 
                WHEN sus.dynamic_styles ? d.key 
                THEN NULLIF(trim(sus.dynamic_styles->d.key->>'style_name'), '')
                ELSE NULL 
            END,
            us.style_name,
            'Legacy Style'
        ),
        d.value;

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
        'order_id', v_order_id,
        'order_number', v_order_number,
        'requirement_number', v_req_number,
        'total_students', v_total_students,
        'total_items_aggregated', v_inserted_items
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_requirement(UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_requirement(UUID[]) TO service_role;
