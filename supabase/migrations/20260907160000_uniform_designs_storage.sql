-- 1. Rename column in public.school_uniform_designs
ALTER TABLE public.school_uniform_designs 
RENAME COLUMN r2_object_key TO storage_path;

-- 2. Create the uniform-designs storage bucket
INSERT INTO storage.buckets (id, name, public, allowed_mime_types, file_size_limit)
VALUES (
    'uniform-designs', 
    'uniform-designs', 
    false, -- PRIVATE bucket
    ARRAY['image/jpeg', 'image/png', 'image/webp']::text[],
    5242880 -- 5 MB in bytes
)
ON CONFLICT (id) DO UPDATE
SET 
    public = false,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']::text[],
    file_size_limit = 5242880;

-- 3. Set up Storage Row Level Security (RLS) for the bucket


-- Drop existing policies if they exist (to allow safe re-runs)
DROP POLICY IF EXISTS uniform_designs_select_school_admin ON storage.objects;
DROP POLICY IF EXISTS uniform_designs_select_evenvibe_admin ON storage.objects;
DROP POLICY IF EXISTS uniform_designs_insert_evenvibe_admin ON storage.objects;
DROP POLICY IF EXISTS uniform_designs_update_evenvibe_admin ON storage.objects;
DROP POLICY IF EXISTS uniform_designs_delete_evenvibe_admin ON storage.objects;

-- School Admin: SELECT only their own school's files
CREATE POLICY uniform_designs_select_school_admin ON storage.objects
FOR SELECT
TO authenticated
USING (
    bucket_id = 'uniform-designs' 
    AND public.get_my_role() = 'school_admin'
    AND (storage.foldername(name))[1] = 'schools'
    AND (storage.foldername(name))[2] = public.get_my_school_id()::text
);

-- EvenVibe Admin: SELECT all
CREATE POLICY uniform_designs_select_evenvibe_admin ON storage.objects
FOR SELECT
TO authenticated
USING (
    bucket_id = 'uniform-designs'
    AND public.get_my_role() = 'evenvibe_admin'
);

-- EvenVibe Admin: INSERT
CREATE POLICY uniform_designs_insert_evenvibe_admin ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'uniform-designs'
    AND public.get_my_role() = 'evenvibe_admin'
);

-- EvenVibe Admin: UPDATE
CREATE POLICY uniform_designs_update_evenvibe_admin ON storage.objects
FOR UPDATE
TO authenticated
USING (
    bucket_id = 'uniform-designs'
    AND public.get_my_role() = 'evenvibe_admin'
)
WITH CHECK (
    bucket_id = 'uniform-designs'
    AND public.get_my_role() = 'evenvibe_admin'
);

-- EvenVibe Admin: DELETE
CREATE POLICY uniform_designs_delete_evenvibe_admin ON storage.objects
FOR DELETE
TO authenticated
USING (
    bucket_id = 'uniform-designs'
    AND public.get_my_role() = 'evenvibe_admin'
);
