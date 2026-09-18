-- Migration: Allow EvenVibe Admins to view requirements and requirement_students
-- Ensures Admin Order Details and Production Management can read requirements and requirement_students snapshots

BEGIN;

DROP POLICY IF EXISTS "EvenVive Admins can view all requirements" ON public.requirements;
CREATE POLICY "EvenVive Admins can view all requirements" 
    ON public.requirements FOR SELECT
    USING (public.get_my_role() = 'evenvibe_admin');

DROP POLICY IF EXISTS "EvenVive Admins can view all requirement students" ON public.requirement_students;
CREATE POLICY "EvenVive Admins can view all requirement students" 
    ON public.requirement_students FOR SELECT
    USING (public.get_my_role() = 'evenvibe_admin');

GRANT SELECT ON public.requirements TO authenticated;
GRANT SELECT ON public.requirement_students TO authenticated;

COMMIT;
