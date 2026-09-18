-- Migration: Update requirement_items and submit_requirement() for dynamic sizes

-- 0. Clear existing legacy data to prevent constraint violations
TRUNCATE TABLE public.requirements CASCADE;

-- 1. Modify requirement_items table
ALTER TABLE public.requirement_items
    DROP CONSTRAINT IF EXISTS requirement_items_uniform_type_check,
    DROP CONSTRAINT IF EXISTS requirement_items_item_type_check,
    DROP CONSTRAINT IF EXISTS requirement_items_requirement_id_uniform_type_item_type_s_key;

ALTER TABLE public.requirement_items
    DROP COLUMN IF EXISTS uniform_type,
    DROP COLUMN IF EXISTS item_type;

ALTER TABLE public.requirement_items
    ADD COLUMN IF NOT EXISTS gender TEXT,
    ADD COLUMN IF NOT EXISTS item_name TEXT;

-- We don't add NOT NULL yet to prevent breaking existing data, 
-- but we enforce the constraint for new rows via a check constraint or just allow it.
-- Let's just create a unique index that handles both legacy and new rows
CREATE UNIQUE INDEX IF NOT EXISTS req_items_unique_idx ON public.requirement_items (
    requirement_id, 
    COALESCE(gender, 'Legacy'), 
    COALESCE(item_name, 'Legacy'), 
    size
);


-- 2. Update submit_requirement() RPC
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
    
    v_total_students INTEGER;
    v_pending_students INTEGER;
    
    v_req_id UUID;
    v_req_number TEXT;
    
    v_order_id UUID;
    v_order_number TEXT;
    
    v_active_req_count INTEGER;
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

    SELECT count(*) INTO v_pending_students
    FROM public.students s
    LEFT JOIN public.student_uniform_sizes sus ON s.id = sus.student_id
    WHERE s.school_id = v_school_id 
      AND (
          sus.id IS NULL 
          OR sus.is_complete = false
      );

    IF v_pending_students > 0 THEN
        RAISE EXCEPTION 'Cannot submit: % students have incomplete or missing sizes.', v_pending_students;
    END IF;

    -- 4. Create Requirement Record
    v_req_number := 'EV-REQ-' || to_char(now(), 'YYYY') || '-' || upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 6));

    INSERT INTO public.requirements (
        school_id, requirement_number, status, total_students, 
        regular_uniform_students, tshirt_uniform_students, submitted_at
    ) VALUES (
        v_school_id, v_req_number, 'submitted', v_total_students, 
        0, 0, now()
    ) RETURNING id INTO v_req_id;

    -- 5. Insert Requirement Items Dynamically
    -- We extract dynamic_sizes JSONB, join with school_uniform_configuration_items and school_uniform_configurations
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
