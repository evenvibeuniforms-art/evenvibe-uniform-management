-- 1. Create public.school_logos table
CREATE TABLE IF NOT EXISTS public.school_logos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,
    original_filename TEXT,
    mime_type TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT school_logos_school_id_key UNIQUE (school_id)
);

-- Index for querying by school_id (already implied by UNIQUE, but explicit is fine)
CREATE INDEX IF NOT EXISTS idx_school_logos_school_id ON public.school_logos(school_id);

-- Attach the updated_at trigger (assuming handle_updated_at function exists in the project)
CREATE TRIGGER set_school_logos_updated_at
BEFORE UPDATE ON public.school_logos
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- 2. Database RLS on public.school_logos
ALTER TABLE public.school_logos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS school_logos_select_school_admin ON public.school_logos;
DROP POLICY IF EXISTS school_logos_insert_school_admin ON public.school_logos;
DROP POLICY IF EXISTS school_logos_update_school_admin ON public.school_logos;
DROP POLICY IF EXISTS school_logos_delete_school_admin ON public.school_logos;

-- School Admin: SELECT only their own school's logo
CREATE POLICY school_logos_select_school_admin ON public.school_logos
FOR SELECT
TO authenticated
USING (
    public.get_my_role() = 'school_admin'
    AND school_id = public.get_my_school_id()
);

-- School Admin: INSERT only for their own school
CREATE POLICY school_logos_insert_school_admin ON public.school_logos
FOR INSERT
TO authenticated
WITH CHECK (
    public.get_my_role() = 'school_admin'
    AND school_id = public.get_my_school_id()
);

-- School Admin: UPDATE only for their own school
CREATE POLICY school_logos_update_school_admin ON public.school_logos
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

-- School Admin: DELETE only for their own school
CREATE POLICY school_logos_delete_school_admin ON public.school_logos
FOR DELETE
TO authenticated
USING (
    public.get_my_role() = 'school_admin'
    AND school_id = public.get_my_school_id()
);


-- 3. Create the school-logos storage bucket
INSERT INTO storage.buckets (id, name, public, allowed_mime_types, file_size_limit)
VALUES (
    'school-logos', 
    'school-logos', 
    false, -- PRIVATE bucket
    ARRAY['image/jpeg', 'image/png', 'image/webp']::text[],
    2097152 -- 2 MB in bytes
)
ON CONFLICT (id) DO UPDATE
SET 
    public = false,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']::text[],
    file_size_limit = 2097152;


-- 4. Storage RLS on storage.objects for school-logos bucket
DROP POLICY IF EXISTS school_logos_storage_select_school_admin ON storage.objects;
DROP POLICY IF EXISTS school_logos_storage_insert_school_admin ON storage.objects;
DROP POLICY IF EXISTS school_logos_storage_update_school_admin ON storage.objects;
DROP POLICY IF EXISTS school_logos_storage_delete_school_admin ON storage.objects;

-- School Admin: SELECT only their own school's files
CREATE POLICY school_logos_storage_select_school_admin ON storage.objects
FOR SELECT
TO authenticated
USING (
    bucket_id = 'school-logos' 
    AND public.get_my_role() = 'school_admin'
    AND (storage.foldername(name))[1] = 'schools'
    AND (storage.foldername(name))[2] = public.get_my_school_id()::text
);

-- School Admin: INSERT
CREATE POLICY school_logos_storage_insert_school_admin ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'school-logos'
    AND public.get_my_role() = 'school_admin'
    AND (storage.foldername(name))[1] = 'schools'
    AND (storage.foldername(name))[2] = public.get_my_school_id()::text
);

-- School Admin: UPDATE
CREATE POLICY school_logos_storage_update_school_admin ON storage.objects
FOR UPDATE
TO authenticated
USING (
    bucket_id = 'school-logos'
    AND public.get_my_role() = 'school_admin'
    AND (storage.foldername(name))[1] = 'schools'
    AND (storage.foldername(name))[2] = public.get_my_school_id()::text
)
WITH CHECK (
    bucket_id = 'school-logos'
    AND public.get_my_role() = 'school_admin'
    AND (storage.foldername(name))[1] = 'schools'
    AND (storage.foldername(name))[2] = public.get_my_school_id()::text
);

-- School Admin: DELETE
CREATE POLICY school_logos_storage_delete_school_admin ON storage.objects
FOR DELETE
TO authenticated
USING (
    bucket_id = 'school-logos'
    AND public.get_my_role() = 'school_admin'
    AND (storage.foldername(name))[1] = 'schools'
    AND (storage.foldername(name))[2] = public.get_my_school_id()::text
);
