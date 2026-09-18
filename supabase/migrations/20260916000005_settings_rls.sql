-- Allow school_admin to update their own profile
CREATE POLICY profiles_update_school_admin ON public.profiles
FOR UPDATE
TO authenticated
USING (
    id = auth.uid() AND public.get_my_role() = 'school_admin'
)
WITH CHECK (
    id = auth.uid() AND public.get_my_role() = 'school_admin'
);

-- Allow school_admin to update their own school
CREATE POLICY schools_update_school_admin ON public.schools
FOR UPDATE
TO authenticated
USING (
    id = public.get_my_school_id() AND public.get_my_role() = 'school_admin'
)
WITH CHECK (
    id = public.get_my_school_id() AND public.get_my_role() = 'school_admin'
);
