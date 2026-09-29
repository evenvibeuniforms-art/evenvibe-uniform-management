-- ============================================================================
-- Migration: 20261006000000_student_uniform_size_history.sql
-- Description: Student Uniform Size History with Academic-Year Tracking,
--              Automatic Last-Year Size Pre-population, and Operational Continuity
-- ============================================================================

BEGIN;

-- 1. Create student_uniform_size_history table
CREATE TABLE IF NOT EXISTS public.student_uniform_size_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    academic_year TEXT NOT NULL CHECK (char_length(trim(academic_year)) > 0),
    style_id UUID NULL REFERENCES public.uniform_styles(id) ON DELETE SET NULL,
    style_name TEXT NULL,
    item_name TEXT NOT NULL CHECK (char_length(trim(item_name)) > 0),
    gender TEXT NULL,
    size TEXT NOT NULL CHECK (char_length(trim(size)) > 0),
    color TEXT NULL,
    class_name TEXT NULL,
    section TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Unique constraint: strictly ONE historical record per student + academic_year + item + style
CREATE UNIQUE INDEX IF NOT EXISTS uq_student_size_history
ON public.student_uniform_size_history (
    student_id,
    academic_year,
    LOWER(TRIM(item_name)),
    COALESCE(style_id::text, LOWER(TRIM(COALESCE(style_name, ''))))
);

-- 3. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_student_size_history_student_year
    ON public.student_uniform_size_history (student_id, academic_year);

CREATE INDEX IF NOT EXISTS idx_student_size_history_school_year
    ON public.student_uniform_size_history (school_id, academic_year);

CREATE INDEX IF NOT EXISTS idx_student_size_history_style_id
    ON public.student_uniform_size_history (style_id);

-- 4. Modtime Trigger
DROP TRIGGER IF EXISTS update_student_uniform_size_history_modtime ON public.student_uniform_size_history;
CREATE TRIGGER update_student_uniform_size_history_modtime
    BEFORE UPDATE ON public.student_uniform_size_history
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- 5. Add academic_year column to existing operational table (student_uniform_sizes)
ALTER TABLE public.student_uniform_sizes
    ADD COLUMN IF NOT EXISTS academic_year TEXT NOT NULL DEFAULT '2026-27';

CREATE INDEX IF NOT EXISTS idx_student_uniform_sizes_academic_year
    ON public.student_uniform_sizes (academic_year);

-- 6. Row Level Security on student_uniform_size_history
ALTER TABLE public.student_uniform_size_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "School Admins can view own school size history" ON public.student_uniform_size_history;
CREATE POLICY "School Admins can view own school size history"
    ON public.student_uniform_size_history
    FOR SELECT
    USING (
        school_id = public.get_my_school_id() AND 
        public.get_my_role() = 'school_admin'
    );

DROP POLICY IF EXISTS "School Admins can insert own school size history" ON public.student_uniform_size_history;
CREATE POLICY "School Admins can insert own school size history"
    ON public.student_uniform_size_history
    FOR INSERT
    WITH CHECK (
        school_id = public.get_my_school_id() AND 
        public.get_my_role() = 'school_admin'
    );

DROP POLICY IF EXISTS "School Admins can update own school size history" ON public.student_uniform_size_history;
CREATE POLICY "School Admins can update own school size history"
    ON public.student_uniform_size_history
    FOR UPDATE
    USING (
        school_id = public.get_my_school_id() AND 
        public.get_my_role() = 'school_admin'
    )
    WITH CHECK (
        school_id = public.get_my_school_id() AND 
        public.get_my_role() = 'school_admin'
    );

DROP POLICY IF EXISTS "Evenvibe Admins full access size history" ON public.student_uniform_size_history;
CREATE POLICY "Evenvibe Admins full access size history"
    ON public.student_uniform_size_history
    FOR ALL
    USING (public.get_my_role() = 'evenvibe_admin')
    WITH CHECK (public.get_my_role() = 'evenvibe_admin');

-- 7. Table Grants
GRANT ALL ON TABLE public.student_uniform_size_history TO postgres;
GRANT ALL ON TABLE public.student_uniform_size_history TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.student_uniform_size_history TO authenticated;

-- 8. Realtime configuration
ALTER TABLE public.student_uniform_size_history REPLICA IDENTITY FULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
          AND schemaname = 'public' 
          AND tablename = 'student_uniform_size_history'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.student_uniform_size_history;
    END IF;
END $$;

-- 9. Seed academic_year_config in system_settings
INSERT INTO public.system_settings (setting_key, setting_value)
VALUES (
    'academic_year_config',
    jsonb_build_object(
        'current_academic_year', '2026-27',
        'available_academic_years', jsonb_build_array('2023-24', '2024-25', '2025-26', '2026-27', '2027-28', '2028-29')
    )
)
ON CONFLICT (setting_key) DO NOTHING;

-- 10. Data Migration: Safely migrate existing student_uniform_sizes into 2026-27 history
INSERT INTO public.student_uniform_size_history (
    student_id,
    school_id,
    academic_year,
    style_id,
    style_name,
    item_name,
    gender,
    size,
    color,
    class_name,
    section,
    created_at,
    updated_at
)
SELECT
    s.id AS student_id,
    s.school_id,
    '2026-27' AS academic_year,
    CASE
        WHEN sus.dynamic_styles ? d.key 
             AND (sus.dynamic_styles->d.key->>'style_id') ~ '^[0-9a-fA-F-]{36}$'
        THEN (sus.dynamic_styles->d.key->>'style_id')::uuid
        WHEN us.id IS NOT NULL THEN us.id
        ELSE NULL
    END AS style_id,
    COALESCE(
        CASE 
            WHEN sus.dynamic_styles ? d.key 
            THEN NULLIF(trim(sus.dynamic_styles->d.key->>'style_name'), '')
            ELSE NULL 
        END,
        us.style_name,
        'Style 1'
    ) AS style_name,
    COALESCE(us.item_name, 'Uniform Item') AS item_name,
    s.gender,
    d.value AS size,
    CASE 
        WHEN sus.dynamic_styles ? d.key 
        THEN NULLIF(trim(sus.dynamic_styles->d.key->>'color'), '')
        ELSE NULL 
    END AS color,
    s.class_name,
    s.section,
    sus.created_at,
    sus.updated_at
FROM public.student_uniform_sizes sus
JOIN public.students s ON s.id = sus.student_id
JOIN LATERAL jsonb_each_text(COALESCE(sus.dynamic_sizes, '{}'::jsonb)) d(key, value) ON true
LEFT JOIN public.uniform_styles us ON (
    us.id::text = d.key 
    OR (sus.dynamic_styles ? d.key AND (sus.dynamic_styles->d.key->>'style_id') = us.id::text)
)
WHERE d.value IS NOT NULL AND TRIM(d.value) != ''
ON CONFLICT (
    student_id,
    academic_year,
    LOWER(TRIM(item_name)),
    COALESCE(style_id::text, LOWER(TRIM(COALESCE(style_name, ''))))
) DO NOTHING;

COMMIT;
