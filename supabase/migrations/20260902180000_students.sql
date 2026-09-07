-- STEP 8: STUDENTS FOUNDATION
-- Create students table with RLS and secure school isolation

CREATE TABLE public.students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    student_name TEXT NOT NULL CHECK (char_length(trim(student_name)) >= 2),
    admission_number TEXT,
    class_name TEXT,
    section TEXT,
    roll_number TEXT,
    gender TEXT,
    date_of_birth DATE,
    parent_name TEXT,
    parent_phone TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

-- Add updated_at trigger
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON public.students
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- Add indexes
CREATE INDEX idx_students_school_id ON public.students(school_id);
CREATE INDEX idx_students_is_active ON public.students(is_active);
CREATE INDEX idx_students_admission_number ON public.students(admission_number);

-- RLS POLICIES

-- 1. EvenVibe Admin Policies
CREATE POLICY "EvenVibe Admins can view all students"
ON public.students
FOR SELECT
TO authenticated
USING (public.get_my_role() = 'evenvibe_admin');

CREATE POLICY "EvenVibe Admins can insert students"
ON public.students
FOR INSERT
TO authenticated
WITH CHECK (public.get_my_role() = 'evenvibe_admin');

CREATE POLICY "EvenVibe Admins can update students"
ON public.students
FOR UPDATE
TO authenticated
USING (public.get_my_role() = 'evenvibe_admin')
WITH CHECK (public.get_my_role() = 'evenvibe_admin');

CREATE POLICY "EvenVibe Admins can delete students"
ON public.students
FOR DELETE
TO authenticated
USING (public.get_my_role() = 'evenvibe_admin');

-- 2. School Admin Policies
CREATE POLICY "School Admins can view their own students"
ON public.students
FOR SELECT
TO authenticated
USING (
    public.get_my_role() = 'school_admin' 
    AND school_id = public.get_my_school_id()
);

CREATE POLICY "School Admins can insert their own students"
ON public.students
FOR INSERT
TO authenticated
WITH CHECK (
    public.get_my_role() = 'school_admin'
    AND school_id = public.get_my_school_id()
);

CREATE POLICY "School Admins can update their own students"
ON public.students
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

CREATE POLICY "School Admins can delete their own students"
ON public.students
FOR DELETE
TO authenticated
USING (
    public.get_my_role() = 'school_admin'
    AND school_id = public.get_my_school_id()
);
