-- Create school_uniform_designs table
CREATE TABLE IF NOT EXISTS public.school_uniform_designs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    design_name TEXT NOT NULL,
    academic_year TEXT NOT NULL,
    r2_object_key TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    original_filename TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Foreign key index on school_id
CREATE INDEX IF NOT EXISTS idx_school_uniform_designs_school_id 
    ON public.school_uniform_designs(school_id);

-- Lookup index for finding designs by school and active status
CREATE INDEX IF NOT EXISTS idx_school_uniform_designs_lookup 
    ON public.school_uniform_designs(school_id, is_active, academic_year);

-- Unique partial index: Only ONE design can be active for a given school and academic year
CREATE UNIQUE INDEX IF NOT EXISTS uq_school_academic_year_active_design 
    ON public.school_uniform_designs(school_id, academic_year) 
    WHERE (is_active = true);

-- Updated_at trigger
CREATE TRIGGER update_school_uniform_designs_modtime
    BEFORE UPDATE ON public.school_uniform_designs
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- Enable Row Level Security
ALTER TABLE public.school_uniform_designs ENABLE ROW LEVEL SECURITY;

-- --------------------------------------------------------
-- ROW LEVEL SECURITY POLICIES
-- --------------------------------------------------------

-- Drop existing policies if any
DROP POLICY IF EXISTS school_uniform_designs_select ON public.school_uniform_designs;
DROP POLICY IF EXISTS school_uniform_designs_insert ON public.school_uniform_designs;
DROP POLICY IF EXISTS school_uniform_designs_update ON public.school_uniform_designs;
DROP POLICY IF EXISTS school_uniform_designs_delete ON public.school_uniform_designs;

-- SELECT: evenvibe_admin can view all, school_admin can view ONLY their own school's uniform designs
CREATE POLICY school_uniform_designs_select ON public.school_uniform_designs
FOR SELECT
TO authenticated
USING (
    public.get_my_role() = 'evenvibe_admin' OR 
    school_id = public.get_my_school_id()
);

-- INSERT: only evenvibe_admin
CREATE POLICY school_uniform_designs_insert ON public.school_uniform_designs
FOR INSERT
TO authenticated
WITH CHECK (
    public.get_my_role() = 'evenvibe_admin'
);

-- UPDATE: only evenvibe_admin
CREATE POLICY school_uniform_designs_update ON public.school_uniform_designs
FOR UPDATE
TO authenticated
USING (
    public.get_my_role() = 'evenvibe_admin'
) WITH CHECK (
    public.get_my_role() = 'evenvibe_admin'
);

-- DELETE: only evenvibe_admin
CREATE POLICY school_uniform_designs_delete ON public.school_uniform_designs
FOR DELETE
TO authenticated
USING (
    public.get_my_role() = 'evenvibe_admin'
);

-- Grant privileges
GRANT ALL ON TABLE public.school_uniform_designs TO postgres;
GRANT ALL ON TABLE public.school_uniform_designs TO service_role;
GRANT SELECT ON TABLE public.school_uniform_designs TO authenticated;
