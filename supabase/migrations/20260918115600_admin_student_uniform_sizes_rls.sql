-- Migration: Update student_uniform_sizes RLS to include evenvibe_admin

-- Drop existing restricted policies
DROP POLICY IF EXISTS "School Admins can view own school's uniform sizes" ON public.student_uniform_sizes;
DROP POLICY IF EXISTS "School Admins can insert own school's uniform sizes" ON public.student_uniform_sizes;
DROP POLICY IF EXISTS "School Admins can update own school's uniform sizes" ON public.student_uniform_sizes;

-- Recreate policies for both school_admin and evenvibe_admin

-- SELECT
CREATE POLICY "Users can view student uniform sizes" 
    ON public.student_uniform_sizes
    FOR SELECT
    USING (
        public.get_my_role() = 'evenvibe_admin'
        OR (
            public.get_my_role() = 'school_admin' 
            AND school_id = public.get_my_school_id()
        )
    );

-- INSERT
CREATE POLICY "Users can insert student uniform sizes" 
    ON public.student_uniform_sizes
    FOR INSERT
    WITH CHECK (
        public.get_my_role() = 'evenvibe_admin'
        OR (
            public.get_my_role() = 'school_admin' 
            AND school_id = public.get_my_school_id()
        )
    );

-- UPDATE
CREATE POLICY "Users can update student uniform sizes" 
    ON public.student_uniform_sizes
    FOR UPDATE
    USING (
        public.get_my_role() = 'evenvibe_admin'
        OR (
            public.get_my_role() = 'school_admin' 
            AND school_id = public.get_my_school_id()
        )
    )
    WITH CHECK (
        public.get_my_role() = 'evenvibe_admin'
        OR (
            public.get_my_role() = 'school_admin' 
            AND school_id = public.get_my_school_id()
        )
    );
