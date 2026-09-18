-- Migration: 20260926000000_tc_students.sql
-- Description: Create tc_students table with school-scoped isolation, uniqueness constraints, indexes, and RLS

CREATE TABLE IF NOT EXISTS public.tc_students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    tc_number TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT tc_students_school_student_unique UNIQUE (school_id, student_id),
    CONSTRAINT tc_students_school_tc_number_unique UNIQUE (school_id, tc_number)
);

-- Trigger for handle_updated_at if available
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc WHERE proname = 'handle_updated_at' AND pronamespace = 'public'::regnamespace
    ) THEN
        DROP TRIGGER IF EXISTS set_tc_students_updated_at ON public.tc_students;
        CREATE TRIGGER set_tc_students_updated_at
        BEFORE UPDATE ON public.tc_students
        FOR EACH ROW
        EXECUTE FUNCTION public.handle_updated_at();
    END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tc_students_school_id ON public.tc_students(school_id);
CREATE INDEX IF NOT EXISTS idx_tc_students_student_id ON public.tc_students(student_id);
CREATE INDEX IF NOT EXISTS idx_tc_students_tc_number ON public.tc_students(tc_number);

-- Enable RLS
ALTER TABLE public.tc_students ENABLE ROW LEVEL SECURITY;

-- Grants
GRANT ALL ON TABLE public.tc_students TO authenticated;
GRANT ALL ON TABLE public.tc_students TO service_role;

-- Drop existing policies if any
DROP POLICY IF EXISTS "EvenVibe Admins can view all tc_students" ON public.tc_students;
DROP POLICY IF EXISTS "EvenVibe Admins can insert tc_students" ON public.tc_students;
DROP POLICY IF EXISTS "EvenVibe Admins can update tc_students" ON public.tc_students;
DROP POLICY IF EXISTS "EvenVibe Admins can delete tc_students" ON public.tc_students;

DROP POLICY IF EXISTS "School Admins can view their own tc_students" ON public.tc_students;
DROP POLICY IF EXISTS "School Admins can insert their own tc_students" ON public.tc_students;
DROP POLICY IF EXISTS "School Admins can update their own tc_students" ON public.tc_students;
DROP POLICY IF EXISTS "School Admins can delete their own tc_students" ON public.tc_students;

-- 1. EvenVibe Admin Policies
CREATE POLICY "EvenVibe Admins can view all tc_students"
ON public.tc_students
FOR SELECT
TO authenticated
USING (public.get_my_role() = 'evenvibe_admin');

CREATE POLICY "EvenVibe Admins can insert tc_students"
ON public.tc_students
FOR INSERT
TO authenticated
WITH CHECK (public.get_my_role() = 'evenvibe_admin');

CREATE POLICY "EvenVibe Admins can update tc_students"
ON public.tc_students
FOR UPDATE
TO authenticated
USING (public.get_my_role() = 'evenvibe_admin')
WITH CHECK (public.get_my_role() = 'evenvibe_admin');

CREATE POLICY "EvenVibe Admins can delete tc_students"
ON public.tc_students
FOR DELETE
TO authenticated
USING (public.get_my_role() = 'evenvibe_admin');

-- 2. School Admin Policies
CREATE POLICY "School Admins can view their own tc_students"
ON public.tc_students
FOR SELECT
TO authenticated
USING (
    public.get_my_role() = 'school_admin' 
    AND school_id = public.get_my_school_id()
);

CREATE POLICY "School Admins can insert their own tc_students"
ON public.tc_students
FOR INSERT
TO authenticated
WITH CHECK (
    public.get_my_role() = 'school_admin'
    AND school_id = public.get_my_school_id()
);

CREATE POLICY "School Admins can update their own tc_students"
ON public.tc_students
FOR UPDATE
TO authenticated
USING (
    public.get_my_role() = 'school_admin'
    AND school_id = public.get_my_school_id()
)
WITH CHECK (
    public.get_my_role() = 'school_admin'
    AND school_id = public.get_my_school_id()
);

CREATE POLICY "School Admins can delete their own tc_students"
ON public.tc_students
FOR DELETE
TO authenticated
USING (
    public.get_my_role() = 'school_admin'
    AND school_id = public.get_my_school_id()
);
