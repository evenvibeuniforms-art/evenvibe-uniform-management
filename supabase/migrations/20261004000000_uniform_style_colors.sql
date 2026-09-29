-- ============================================================================
-- Migration: 20261004000000_uniform_style_colors.sql
-- Description: Class-Wise Uniform Color Configuration + Student Color Persistence +
--              Order Items Color Snapshot + Production Color Breakdown
-- ============================================================================

BEGIN;

-- 1. Create uniform_style_colors table
CREATE TABLE IF NOT EXISTS public.uniform_style_colors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    style_id UUID NOT NULL REFERENCES public.uniform_styles(id) ON DELETE CASCADE,
    class_name TEXT NOT NULL CHECK (char_length(trim(class_name)) > 0),
    color_name TEXT NOT NULL CHECK (char_length(trim(color_name)) > 0),
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(style_id, class_name, color_name)
);

CREATE INDEX IF NOT EXISTS idx_uniform_style_colors_style_id
    ON public.uniform_style_colors(style_id);
CREATE INDEX IF NOT EXISTS idx_uniform_style_colors_class_name
    ON public.uniform_style_colors(class_name);
CREATE INDEX IF NOT EXISTS idx_uniform_style_colors_style_class
    ON public.uniform_style_colors(style_id, class_name);

DROP TRIGGER IF EXISTS update_uniform_style_colors_modtime ON public.uniform_style_colors;
CREATE TRIGGER update_uniform_style_colors_modtime
    BEFORE UPDATE ON public.uniform_style_colors
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- 2. Alter requirement_items to add color column and update unique index
ALTER TABLE public.requirement_items
    ADD COLUMN IF NOT EXISTS color TEXT NULL;

DROP INDEX IF EXISTS public.req_items_unique_idx;
CREATE UNIQUE INDEX req_items_unique_idx ON public.requirement_items (
    requirement_id, 
    COALESCE(class_name, 'Legacy'),
    COALESCE(section_name, 'Legacy'),
    COALESCE(gender, 'Legacy'), 
    COALESCE(item_name, 'Legacy'), 
    COALESCE(style_id::text, 'Legacy'),
    COALESCE(color, 'NoColor'),
    size
);

-- 3. Create or alter order_items table to support order color snapshotting
CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    requirement_item_id UUID NULL REFERENCES public.requirement_items(id) ON DELETE SET NULL,
    class_name TEXT NULL,
    section_name TEXT NULL,
    gender TEXT NULL,
    item_name TEXT NOT NULL,
    style_id UUID REFERENCES public.uniform_styles(id) ON DELETE SET NULL,
    style_name TEXT NULL,
    color TEXT NULL,
    size TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.order_items
    ADD COLUMN IF NOT EXISTS color TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_style_id ON public.order_items(style_id);
DROP INDEX IF EXISTS public.order_items_unique_idx;
CREATE UNIQUE INDEX order_items_unique_idx ON public.order_items (
    order_id,
    COALESCE(class_name, 'Legacy'),
    COALESCE(section_name, 'Legacy'),
    COALESCE(gender, 'Legacy'),
    COALESCE(item_name, 'Legacy'),
    COALESCE(style_id::text, 'Legacy'),
    COALESCE(color, 'NoColor'),
    size
);

-- 4. Update submit_requirement RPC to snapshot color into requirement_items and order_items
DROP FUNCTION IF EXISTS public.submit_requirement(UUID[]);

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

    -- 7. Snapshot Requirement Items (aggregating sizes and color snapshot)
    INSERT INTO public.requirement_items (
        requirement_id,
        class_name,
        section,
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

    -- 8. Create Order
    v_order_number := 'EV-ORD-' || to_char(now(), 'YYYY') || '-' || upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 6));

    INSERT INTO public.orders (
        school_id, requirement_id, order_number, status, created_at
    ) VALUES (
        v_school_id, v_req_id, v_order_number, 'submitted', now()
    ) RETURNING id INTO v_order_id;

    -- 9. Snapshot into order_items (exact requirement_items snapshot including color)
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
        ri.section,
        ri.gender,
        ri.item_name,
        ri.style_id,
        ri.style_name,
        ri.color,
        ri.size,
        ri.quantity
    FROM public.requirement_items ri
    WHERE ri.requirement_id = v_req_id;

    -- 10. Record History
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

-- 5. Update add_students_to_existing_order RPC to preserve color snapshot
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

    -- 6. Increment requirement_items quantities atomically with color and style preservation
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
        ts.class_name,
        ts.section,
        ts.gender,
        COALESCE(us.item_name, ci.item_name, 'Uniform Item') AS item_name,
        COALESCE(
            CASE 
                WHEN ts.dynamic_styles ? d.key 
                     AND (ts.dynamic_styles->d.key->>'style_id') ~ '^[0-9a-fA-F-]{36}$'
                THEN (ts.dynamic_styles->d.key->>'style_id')::uuid
                ELSE NULL 
            END,
            us.id
        ) AS style_id,
        COALESCE(
            CASE 
                WHEN ts.dynamic_styles ? d.key 
                THEN NULLIF(trim(ts.dynamic_styles->d.key->>'style_name'), '')
                ELSE NULL 
            END,
            us.style_name,
            'Legacy Style'
        ) AS style_name,
        CASE 
            WHEN ts.dynamic_styles ? d.key 
            THEN NULLIF(trim(ts.dynamic_styles->d.key->>'color'), '')
            ELSE NULL 
        END AS color,
        d.value AS size,
        count(*) AS quantity
    FROM temp_valid_add_students ts
    JOIN LATERAL jsonb_each_text(ts.dynamic_sizes) d(key, value) ON true
    LEFT JOIN public.uniform_styles us ON (
        us.id::text = d.key 
        OR (ts.dynamic_styles ? d.key AND (ts.dynamic_styles->d.key->>'style_id') = us.id::text)
    )
    LEFT JOIN public.school_uniform_configuration_items ci ON ci.id::text = d.key
    WHERE (us.id IS NOT NULL OR ci.id IS NOT NULL)
      AND d.value IS NOT NULL
      AND d.value != ''
    GROUP BY 
        ts.class_name, 
        ts.section, 
        ts.gender, 
        COALESCE(us.item_name, ci.item_name, 'Uniform Item'), 
        COALESCE(
            CASE 
                WHEN ts.dynamic_styles ? d.key 
                     AND (ts.dynamic_styles->d.key->>'style_id') ~ '^[0-9a-fA-F-]{36}$'
                THEN (ts.dynamic_styles->d.key->>'style_id')::uuid
                ELSE NULL 
            END,
            us.id
        ),
        COALESCE(
            CASE 
                WHEN ts.dynamic_styles ? d.key 
                THEN NULLIF(trim(ts.dynamic_styles->d.key->>'style_name'), '')
                ELSE NULL 
            END,
            us.style_name,
            'Legacy Style'
        ),
        CASE 
            WHEN ts.dynamic_styles ? d.key 
            THEN NULLIF(trim(ts.dynamic_styles->d.key->>'color'), '')
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
        COALESCE(color, 'NoColor'),
        size
    )
    DO UPDATE SET quantity = public.requirement_items.quantity + EXCLUDED.quantity;

    -- 7. Snapshot into order_items
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
        p_order_id,
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
    WHERE ri.requirement_id = v_req_id
    ON CONFLICT (
        order_id,
        COALESCE(class_name, 'Legacy'),
        COALESCE(section_name, 'Legacy'),
        COALESCE(gender, 'Legacy'),
        COALESCE(item_name, 'Legacy'),
        COALESCE(style_id::text, 'Legacy'),
        COALESCE(color, 'NoColor'),
        size
    )
    DO UPDATE SET quantity = EXCLUDED.quantity;

    -- 8. Update requirement totals
    SELECT 
        COUNT(id) FILTER (WHERE uniform_type = 'regular'),
        COUNT(id) FILTER (WHERE uniform_type = 'tshirt')
    INTO v_new_regular_students, v_new_tshirt_students
    FROM temp_valid_add_students;

    UPDATE public.requirements
    SET total_students = total_students + v_valid_students_count,
        regular_uniform_students = regular_uniform_students + v_new_regular_students,
        tshirt_uniform_students = tshirt_uniform_students + v_new_tshirt_students,
        updated_at = now()
    WHERE id = v_req_id;

    -- 9. Record history note
    INSERT INTO public.order_status_history (
        order_id, status, note, created_at
    ) VALUES (
        p_order_id, 
        v_order_status, 
        'Added ' || v_valid_students_count || ' additional student(s) to order with color & style snapshot', 
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

-- 6. Row Level Security Policies
ALTER TABLE public.uniform_style_colors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS uniform_style_colors_admin_all ON public.uniform_style_colors;
DROP POLICY IF EXISTS uniform_style_colors_school_select ON public.uniform_style_colors;
DROP POLICY IF EXISTS order_items_admin_all ON public.order_items;
DROP POLICY IF EXISTS order_items_school_select ON public.order_items;

-- EvenVibe Admin: full access
CREATE POLICY uniform_style_colors_admin_all ON public.uniform_style_colors
    FOR ALL TO authenticated
    USING (public.get_my_role() = 'evenvibe_admin')
    WITH CHECK (public.get_my_role() = 'evenvibe_admin');

-- School Admin: SELECT only for own school
CREATE POLICY uniform_style_colors_school_select ON public.uniform_style_colors
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.uniform_styles s
            WHERE s.id = style_id
              AND s.school_id = public.get_my_school_id()
        )
    );

CREATE POLICY order_items_admin_all ON public.order_items
    FOR ALL TO authenticated
    USING (public.get_my_role() = 'evenvibe_admin')
    WITH CHECK (public.get_my_role() = 'evenvibe_admin');

CREATE POLICY order_items_school_select ON public.order_items
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id = order_id
              AND o.school_id = public.get_my_school_id()
        )
    );

-- Grants
GRANT ALL ON TABLE public.uniform_style_colors TO postgres;
GRANT ALL ON TABLE public.uniform_style_colors TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.uniform_style_colors TO authenticated;

GRANT ALL ON TABLE public.order_items TO postgres;
GRANT ALL ON TABLE public.order_items TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.order_items TO authenticated;

-- 7. Realtime publications
ALTER TABLE public.uniform_style_colors REPLICA IDENTITY FULL;
ALTER TABLE public.order_items REPLICA IDENTITY FULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'uniform_style_colors'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.uniform_style_colors;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'order_items'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.order_items;
    END IF;
END $$;

COMMIT;
