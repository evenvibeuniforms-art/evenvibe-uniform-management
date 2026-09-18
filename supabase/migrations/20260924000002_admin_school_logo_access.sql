-- Allow EvenVive Admin to view school logos
DROP POLICY IF EXISTS school_logos_select_evenvibe_admin ON public.school_logos;
CREATE POLICY school_logos_select_evenvibe_admin ON public.school_logos
FOR SELECT
TO authenticated
USING (
    public.get_my_role() = 'evenvibe_admin'
);

-- Allow EvenVive Admin to read objects in school-logos storage bucket
DROP POLICY IF EXISTS school_logos_storage_select_evenvibe_admin ON storage.objects;
CREATE POLICY school_logos_storage_select_evenvibe_admin ON storage.objects
FOR SELECT
TO authenticated
USING (
    bucket_id = 'school-logos'
    AND public.get_my_role() = 'evenvibe_admin'
);
