-- ============================================================================
-- Migration: 20261009000000_allow_multiple_active_orders_per_school.sql
-- Description: Allow a school / school admin to create multiple active orders
-- simultaneously. Removes all restrictions enforcing "one active order per school".
-- Ensures every order and requirement remains completely independent.
-- ============================================================================

-- 1. Drop old conflicting overloads that enforced one active order per school
DROP FUNCTION IF EXISTS public.submit_requirement();
DROP FUNCTION IF EXISTS public.submit_requirement(UUID);
DROP FUNCTION IF EXISTS public.submit_requirement(UUID[]);

-- 2. Define authoritative submit_requirement RPC with zero active-order restriction
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
    -- 1. Authorization: verify authenticated school_admin
    SELECT school_id INTO v_school_id
    FROM public.profiles
    WHERE id = auth.uid() AND role = 'school_admin';

    IF v_school_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Only school admins can submit requirements.';
    END IF;

    -- NOTE: Multiple active orders per school are fully allowed.
    -- No checks blocking active in-flight orders or requirements.

    -- 2. Student selection validation
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

    -- 3. Identify eligible completed students safely
    DROP TABLE IF EXISTS temp_eligible_students;
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

    -- 4. Create Requirement (Unique requirement number globally)
    v_req_number := 'REQ-' || to_char(now(), 'YYYY') || '-' || upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 6));

    INSERT INTO public.requirements (
        school_id, requirement_number, status, total_students, submitted_at, created_at
    ) VALUES (
        v_school_id, v_req_number, 'submitted', v_total_students, now(), now()
    ) RETURNING id INTO v_req_id;

    -- 5. Link students to requirement snapshot
    INSERT INTO public.requirement_students (
        requirement_id, student_id, created_at
    )
    SELECT v_req_id, id, now()
    FROM temp_eligible_students;

    -- 6. Snapshot Requirement Items (aggregating sizes, style snapshot, and color snapshot)
    INSERT INTO public.requirement_items (
        requirement_id,
        class_name,
        section_name,
        gender,
        item_name,
        style_id,
        style_name,
        color,
        size,
        quantity
    )
    SELECT 
        v_req_id,
        s.class_name,
        s.section AS section_name,
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
        CASE 
            WHEN sus.dynamic_styles ? d.key 
            THEN NULLIF(trim(sus.dynamic_styles->d.key->>'color'), '')
            ELSE NULL 
        END AS color,
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
        CASE 
            WHEN sus.dynamic_styles ? d.key 
            THEN NULLIF(trim(sus.dynamic_styles->d.key->>'color'), '')
            ELSE NULL 
        END,
        d.value;

    GET DIAGNOSTICS v_inserted_items = ROW_COUNT;
    IF v_inserted_items = 0 THEN
        RAISE EXCEPTION 'Cannot submit: Aggregation produced 0 valid items.';
    END IF;

    -- 7. Create Independent Order (Unique order number globally)
    v_order_number := 'EV-ORD-' || to_char(now(), 'YYYY') || '-' || upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 6));

    INSERT INTO public.orders (
        school_id, requirement_id, order_number, status, created_at
    ) VALUES (
        v_school_id, v_req_id, v_order_number, 'submitted', now()
    ) RETURNING id INTO v_order_id;

    -- 8. Snapshot into order_items
    INSERT INTO public.order_items (
        order_id,
        requirement_item_id,
        class_name,
        section_name,
        gender,
        item_name,
        style_id,
        style_name,
        color,
        size,
        quantity
    )
    SELECT 
        v_order_id,
        ri.id,
        ri.class_name,
        ri.section_name,
        ri.gender,
        ri.item_name,
        ri.style_id,
        ri.style_name,
        ri.color,
        ri.size,
        ri.quantity
    FROM public.requirement_items ri
    WHERE ri.requirement_id = v_req_id;

    -- 9. Record Initial History
    INSERT INTO public.order_status_history (
        order_id, status, note, created_at
    ) VALUES (
        v_order_id, 'submitted', 'Requirement submitted successfully with ' || v_total_students || ' selected students', now()
    );

    -- NOTE: Order production workflow stages are initialized automatically
    -- via the existing trigger trigger_initialize_order_production_workflow on public.orders.

    -- Cleanup temp table
    DROP TABLE IF EXISTS temp_eligible_students;

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

-- 3. Grants
GRANT EXECUTE ON FUNCTION public.submit_requirement(UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_requirement(UUID[]) TO service_role;
