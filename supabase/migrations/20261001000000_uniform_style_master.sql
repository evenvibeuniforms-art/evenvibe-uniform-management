-- Migration: 20261001000000_uniform_style_master.sql
-- Description: Uniform Style Master + Student Style Mapping + Production Traceability

BEGIN;

-- 1. Create uniform_styles table
CREATE TABLE IF NOT EXISTS public.uniform_styles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    style_name TEXT NOT NULL CHECK (char_length(trim(style_name)) > 0),
    item_name TEXT NOT NULL CHECK (char_length(trim(item_name)) > 0),
    gender TEXT NULL CHECK (gender IS NULL OR gender IN ('Male', 'Female', 'All')) DEFAULT 'All',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for uniform_styles
CREATE INDEX IF NOT EXISTS idx_uniform_styles_school_id 
    ON public.uniform_styles(school_id);
CREATE INDEX IF NOT EXISTS idx_uniform_styles_school_active 
    ON public.uniform_styles(school_id, is_active);
CREATE UNIQUE INDEX IF NOT EXISTS idx_uniform_styles_school_item_name 
    ON public.uniform_styles (school_id, LOWER(TRIM(item_name)), LOWER(TRIM(style_name)));

-- Updated_at trigger for uniform_styles
DROP TRIGGER IF EXISTS update_uniform_styles_modtime ON public.uniform_styles;
CREATE TRIGGER update_uniform_styles_modtime
    BEFORE UPDATE ON public.uniform_styles
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- 2. Create uniform_style_classes table (Junction table for applicable classes)
CREATE TABLE IF NOT EXISTS public.uniform_style_classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    style_id UUID NOT NULL REFERENCES public.uniform_styles(id) ON DELETE CASCADE,
    class_name TEXT NOT NULL CHECK (char_length(trim(class_name)) > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(style_id, class_name)
);

CREATE INDEX IF NOT EXISTS idx_uniform_style_classes_style_id 
    ON public.uniform_style_classes(style_id);
CREATE INDEX IF NOT EXISTS idx_uniform_style_classes_class_name 
    ON public.uniform_style_classes(class_name);

-- 3. Create uniform_style_images table (Supports unlimited images per style)
CREATE TABLE IF NOT EXISTS public.uniform_style_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    style_id UUID NOT NULL REFERENCES public.uniform_styles(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,
    original_filename TEXT,
    mime_type TEXT NOT NULL DEFAULT 'image/jpeg',
    file_size BIGINT NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_uniform_style_images_style_id 
    ON public.uniform_style_images(style_id, sort_order);

-- 4. Alter student_uniform_sizes to store dynamic_styles JSONB
-- Structure: { [itemId]: { style_id: UUID, style_name: string } }
ALTER TABLE public.student_uniform_sizes
    ADD COLUMN IF NOT EXISTS dynamic_styles JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 5. Alter requirement_items to store style_id and style_name snapshot
ALTER TABLE public.requirement_items
    ADD COLUMN IF NOT EXISTS style_id UUID REFERENCES public.uniform_styles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS style_name TEXT NULL;

-- 6. Update requirement_items unique index to include style_id granularity
DROP INDEX IF EXISTS public.req_items_unique_idx;
CREATE UNIQUE INDEX req_items_unique_idx ON public.requirement_items (
    requirement_id, 
    COALESCE(class_name, 'Legacy'),
    COALESCE(section_name, 'Legacy'),
    COALESCE(gender, 'Legacy'), 
    COALESCE(item_name, 'Legacy'), 
    COALESCE(style_id::text, 'Legacy'),
    size
);

-- 7. Update submit_requirement RPC to preserve style_id and style_name snapshot
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

        SELECT count(DISTINCT id) INTO v_valid_students_count
        FROM public.students
        WHERE school_id = v_school_id
          AND id = ANY(p_student_ids);

        IF v_valid_students_count != v_selected_count THEN
            RAISE EXCEPTION 'One or more selected students are invalid or do not belong to your school.';
        END IF;
    END IF;

    -- 4. Identify eligible completed students safely
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

    -- 7. Insert Requirement Items Dynamically from selected students with STYLE SNAPSHOT
    INSERT INTO public.requirement_items (
        requirement_id, 
        class_name, 
        section_name, 
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
        ci.item_name,
        CASE 
            WHEN sus.dynamic_styles ? ci.id::text 
                 AND (sus.dynamic_styles->ci.id::text->>'style_id') ~ '^[0-9a-fA-F-]{36}$'
            THEN (sus.dynamic_styles->ci.id::text->>'style_id')::uuid
            ELSE NULL 
        END AS style_id,
        CASE 
            WHEN sus.dynamic_styles ? ci.id::text 
            THEN NULLIF(trim(sus.dynamic_styles->ci.id::text->>'style_name'), '')
            ELSE NULL 
        END AS style_name,
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
    GROUP BY 
        s.class_name, 
        s.section, 
        s.gender, 
        ci.item_name, 
        CASE 
            WHEN sus.dynamic_styles ? ci.id::text 
                 AND (sus.dynamic_styles->ci.id::text->>'style_id') ~ '^[0-9a-fA-F-]{36}$'
            THEN (sus.dynamic_styles->ci.id::text->>'style_id')::uuid
            ELSE NULL 
        END,
        CASE 
            WHEN sus.dynamic_styles ? ci.id::text 
            THEN NULLIF(trim(sus.dynamic_styles->ci.id::text->>'style_name'), '')
            ELSE NULL 
        END,
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

-- 8. Update add_students_to_existing_order RPC to include style_id & style_name
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
    v_my_school_id UUID;
    v_order_school_id UUID;
    v_req_id UUID;
    v_order_status TEXT;
    v_valid_students_count INTEGER;
    v_total_students_to_add INTEGER;
    v_new_regular_students INTEGER;
    v_new_tshirt_students INTEGER;
BEGIN
    -- 1. Authentication and Authorization
    v_profile_id := auth.uid();
    IF v_profile_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT role, school_id INTO v_role, v_my_school_id
    FROM public.profiles
    WHERE id = v_profile_id;

    IF v_role != 'school_admin' OR v_my_school_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Must be a school admin';
    END IF;

    -- 2. Verify Order
    SELECT school_id, requirement_id, status
    INTO v_order_school_id, v_req_id, v_order_status
    FROM public.orders
    WHERE id = p_order_id;

    IF v_order_school_id IS NULL OR v_req_id IS NULL THEN
        RAISE EXCEPTION 'Order or requirement not found';
    END IF;

    IF v_order_school_id != v_my_school_id THEN
        RAISE EXCEPTION 'Unauthorized: Order does not belong to your school';
    END IF;

    IF v_order_status NOT IN ('submitted', 'under_review') THEN
        RAISE EXCEPTION 'Students can only be added when order is in Submitted or Under Review status';
    END IF;

    -- 3. Validate student selection
    IF p_student_ids IS NULL OR array_length(p_student_ids, 1) = 0 THEN
        RAISE EXCEPTION 'Please select at least one student to add.';
    END IF;

    -- 4. Identify valid completed students not already in this requirement
    CREATE TEMP TABLE temp_valid_add_students ON COMMIT DROP AS
    SELECT s.id, s.class_name, s.section, s.gender, sus.uniform_type, sus.dynamic_sizes, sus.dynamic_styles
    FROM public.students s
    JOIN public.student_uniform_sizes sus ON s.id = sus.student_id
    WHERE s.school_id = v_order_school_id
      AND s.id = ANY(p_student_ids)
      AND sus.is_complete = true
      AND NOT EXISTS (
          SELECT 1 FROM public.requirement_students rs
          WHERE rs.requirement_id = v_req_id AND rs.student_id = s.id
      )
      AND NOT EXISTS (
          SELECT 1
          FROM public.school_uniform_configurations c
          JOIN public.school_uniform_configuration_classes cc ON cc.configuration_id = c.id
          JOIN public.school_uniform_configuration_items ci ON ci.configuration_id = c.id
          WHERE c.school_id = v_order_school_id
            AND c.is_active = true
            AND c.gender = s.gender
            AND cc.class_name = s.class_name
            AND ci.is_required = true
            AND (sus.dynamic_sizes IS NULL OR NOT (sus.dynamic_sizes ? ci.id::text) OR (sus.dynamic_sizes->>ci.id::text) = '')
      );

    SELECT count(*) INTO v_valid_students_count FROM temp_valid_add_students;
    v_total_students_to_add := array_length(p_student_ids, 1);

    IF v_valid_students_count = 0 OR v_valid_students_count != v_total_students_to_add THEN
        RETURN json_build_object(
            'success', false, 
            'error', 'One or more selected students are invalid, already included, or have incomplete sizes.'
        );
    END IF;

    -- 5. Insert into requirement_students
    INSERT INTO public.requirement_students (requirement_id, student_id)
    SELECT v_req_id, id FROM temp_valid_add_students;

    -- 6. Increment requirement_items quantities atomically with style preservation
    INSERT INTO public.requirement_items (
        requirement_id, 
        class_name, 
        section_name, 
        gender, 
        item_name, 
        style_id, 
        style_name, 
        size, 
        quantity
    )
    SELECT 
        v_req_id,
        ts.class_name,
        ts.section,
        ts.gender,
        ci.item_name,
        CASE 
            WHEN ts.dynamic_styles ? ci.id::text 
                 AND (ts.dynamic_styles->ci.id::text->>'style_id') ~ '^[0-9a-fA-F-]{36}$'
            THEN (ts.dynamic_styles->ci.id::text->>'style_id')::uuid
            ELSE NULL 
        END AS style_id,
        CASE 
            WHEN ts.dynamic_styles ? ci.id::text 
            THEN NULLIF(trim(ts.dynamic_styles->ci.id::text->>'style_name'), '')
            ELSE NULL 
        END AS style_name,
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
    GROUP BY 
        ts.class_name, 
        ts.section, 
        ts.gender, 
        ci.item_name, 
        CASE 
            WHEN ts.dynamic_styles ? ci.id::text 
                 AND (ts.dynamic_styles->ci.id::text->>'style_id') ~ '^[0-9a-fA-F-]{36}$'
            THEN (ts.dynamic_styles->ci.id::text->>'style_id')::uuid
            ELSE NULL 
        END,
        CASE 
            WHEN ts.dynamic_styles ? ci.id::text 
            THEN NULLIF(trim(ts.dynamic_styles->ci.id::text->>'style_name'), '')
            ELSE NULL 
        END,
        d.value
    ON CONFLICT (
        requirement_id, 
        COALESCE(class_name, 'Legacy'), 
        COALESCE(section_name, 'Legacy'), 
        COALESCE(gender, 'Legacy'), 
        COALESCE(item_name, 'Legacy'), 
        COALESCE(style_id::text, 'Legacy'),
        size
    )
    DO UPDATE SET quantity = public.requirement_items.quantity + EXCLUDED.quantity;

    -- 7. Update requirement totals
    SELECT 
        COUNT(id) FILTER (WHERE uniform_type = 'regular'),
        COUNT(id) FILTER (WHERE uniform_type = 'tshirt')
    INTO v_new_regular_students, v_new_tshirt_students
    FROM temp_valid_add_students;

    UPDATE public.requirements
    SET 
        total_students = total_students + v_valid_students_count,
        regular_uniform_students = regular_uniform_students + COALESCE(v_new_regular_students, 0),
        tshirt_uniform_students = tshirt_uniform_students + COALESCE(v_new_tshirt_students, 0)
    WHERE id = v_req_id;

    -- 8. Add status history record
    INSERT INTO public.order_status_history (
        order_id, status, note, created_at
    ) VALUES (
        p_order_id, 
        v_order_status, 
        'Added ' || v_valid_students_count || ' additional student(s) to order.', 
        now()
    );

    RETURN json_build_object(
        'success', true,
        'added_count', v_valid_students_count
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object(
            'success', false,
            'error', SQLERRM
        );
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_students_to_existing_order(UUID, UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_students_to_existing_order(UUID, UUID[]) TO service_role;

-- 9. Row Level Security Policies

-- Enable RLS
ALTER TABLE public.uniform_styles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uniform_style_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uniform_style_images ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS uniform_styles_admin_all ON public.uniform_styles;
DROP POLICY IF EXISTS uniform_styles_school_select ON public.uniform_styles;
DROP POLICY IF EXISTS uniform_style_classes_admin_all ON public.uniform_style_classes;
DROP POLICY IF EXISTS uniform_style_classes_school_select ON public.uniform_style_classes;
DROP POLICY IF EXISTS uniform_style_images_admin_all ON public.uniform_style_images;
DROP POLICY IF EXISTS uniform_style_images_school_select ON public.uniform_style_images;

-- EvenVibe Admin: full access
CREATE POLICY uniform_styles_admin_all ON public.uniform_styles
    FOR ALL TO authenticated
    USING (public.get_my_role() = 'evenvibe_admin')
    WITH CHECK (public.get_my_role() = 'evenvibe_admin');

-- School Admin: SELECT only for own school
CREATE POLICY uniform_styles_school_select ON public.uniform_styles
    FOR SELECT TO authenticated
    USING (
        public.get_my_role() = 'school_admin' AND 
        school_id = public.get_my_school_id()
    );

-- Classes: Admin ALL
CREATE POLICY uniform_style_classes_admin_all ON public.uniform_style_classes
    FOR ALL TO authenticated
    USING (public.get_my_role() = 'evenvibe_admin')
    WITH CHECK (public.get_my_role() = 'evenvibe_admin');

-- Classes: School Admin SELECT
CREATE POLICY uniform_style_classes_school_select ON public.uniform_style_classes
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.uniform_styles s
            WHERE s.id = style_id
              AND s.school_id = public.get_my_school_id()
        )
    );

-- Images: Admin ALL
CREATE POLICY uniform_style_images_admin_all ON public.uniform_style_images
    FOR ALL TO authenticated
    USING (public.get_my_role() = 'evenvibe_admin')
    WITH CHECK (public.get_my_role() = 'evenvibe_admin');

-- Images: School Admin SELECT
CREATE POLICY uniform_style_images_school_select ON public.uniform_style_images
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.uniform_styles s
            WHERE s.id = style_id
              AND s.school_id = public.get_my_school_id()
        )
    );

-- Table Grants
GRANT ALL ON TABLE public.uniform_styles TO postgres;
GRANT ALL ON TABLE public.uniform_styles TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.uniform_styles TO authenticated;

GRANT ALL ON TABLE public.uniform_style_classes TO postgres;
GRANT ALL ON TABLE public.uniform_style_classes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.uniform_style_classes TO authenticated;

GRANT ALL ON TABLE public.uniform_style_images TO postgres;
GRANT ALL ON TABLE public.uniform_style_images TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.uniform_style_images TO authenticated;

-- 10. Enable Realtime Publications
ALTER TABLE public.uniform_styles REPLICA IDENTITY FULL;
ALTER TABLE public.uniform_style_classes REPLICA IDENTITY FULL;
ALTER TABLE public.uniform_style_images REPLICA IDENTITY FULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'uniform_styles'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.uniform_styles;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'uniform_style_classes'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.uniform_style_classes;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'uniform_style_images'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.uniform_style_images;
    END IF;
END $$;

COMMIT;
