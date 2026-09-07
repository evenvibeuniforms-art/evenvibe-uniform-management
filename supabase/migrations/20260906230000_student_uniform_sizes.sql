-- Migration: Create student_uniform_sizes table

CREATE TABLE IF NOT EXISTS public.student_uniform_sizes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    uniform_type TEXT NOT NULL CHECK (uniform_type IN ('regular', 'tshirt')),
    shirt_size TEXT NULL,
    tshirt_size TEXT NULL,
    pant_size TEXT NULL,
    short_size TEXT NULL,
    is_complete BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_student_size UNIQUE(student_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS student_uniform_sizes_school_id_idx ON public.student_uniform_sizes(school_id);
CREATE INDEX IF NOT EXISTS student_uniform_sizes_student_id_idx ON public.student_uniform_sizes(student_id);

-- Add updated_at trigger
CREATE TRIGGER set_student_uniform_sizes_updated_at
    BEFORE UPDATE ON public.student_uniform_sizes
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- Enable Row Level Security
ALTER TABLE public.student_uniform_sizes ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "School Admins can view own school's uniform sizes" 
    ON public.student_uniform_sizes
    FOR SELECT
    USING (
        school_id = public.get_my_school_id() AND 
        public.get_my_role() = 'school_admin'
    );

CREATE POLICY "School Admins can insert own school's uniform sizes" 
    ON public.student_uniform_sizes
    FOR INSERT
    WITH CHECK (
        school_id = public.get_my_school_id() AND 
        public.get_my_role() = 'school_admin'
    );

CREATE POLICY "School Admins can update own school's uniform sizes" 
    ON public.student_uniform_sizes
    FOR UPDATE
    USING (
        school_id = public.get_my_school_id() AND 
        public.get_my_role() = 'school_admin'
    )
    WITH CHECK (
        school_id = public.get_my_school_id() AND 
        public.get_my_role() = 'school_admin'
    );
