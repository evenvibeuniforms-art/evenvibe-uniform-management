-- --------------------------------------------------------
-- 1. SECURITY DEFINER FUNCTIONS
-- --------------------------------------------------------

-- Get current user's role
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS public.app_role
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    _role public.app_role;
    _uid uuid;
BEGIN
    _uid := auth.uid();
    IF _uid IS NULL THEN
        RETURN NULL;
    END IF;
    
    SELECT role INTO _role FROM public.profiles WHERE id = _uid;
    RETURN _role;
END;
$$;

-- Get current user's school_id
CREATE OR REPLACE FUNCTION public.get_my_school_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    _school_id uuid;
    _uid uuid;
BEGIN
    _uid := auth.uid();
    IF _uid IS NULL THEN
        RETURN NULL;
    END IF;
    
    SELECT school_id INTO _school_id FROM public.profiles WHERE id = _uid;
    RETURN _school_id;
END;
$$;

-- Revoke execute from public (anon) and grant only to authenticated
REVOKE EXECUTE ON FUNCTION public.get_my_role() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_my_school_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_school_id() TO authenticated;

-- --------------------------------------------------------
-- 2. ENABLE ROW LEVEL SECURITY
-- --------------------------------------------------------
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- --------------------------------------------------------
-- 3. PROFILES POLICIES
-- --------------------------------------------------------

-- Drop any potential existing policies created in this session just in case
DROP POLICY IF EXISTS profiles_select_own_or_admin ON public.profiles;
DROP POLICY IF EXISTS profiles_insert_admin ON public.profiles;
DROP POLICY IF EXISTS profiles_update_admin ON public.profiles;
DROP POLICY IF EXISTS profiles_delete_admin ON public.profiles;

-- SELECT: authenticated user can select own profile, evenvibe_admin can select all
CREATE POLICY profiles_select_own_or_admin ON public.profiles
FOR SELECT 
TO authenticated
USING (
    id = auth.uid() OR public.get_my_role() = 'evenvibe_admin'
);

-- INSERT: only evenvibe_admin
CREATE POLICY profiles_insert_admin ON public.profiles
FOR INSERT 
TO authenticated
WITH CHECK (
    public.get_my_role() = 'evenvibe_admin'
);

-- UPDATE: only evenvibe_admin
CREATE POLICY profiles_update_admin ON public.profiles
FOR UPDATE 
TO authenticated
USING (
    public.get_my_role() = 'evenvibe_admin'
) WITH CHECK (
    public.get_my_role() = 'evenvibe_admin'
);

-- DELETE: only evenvibe_admin
CREATE POLICY profiles_delete_admin ON public.profiles
FOR DELETE 
TO authenticated
USING (
    public.get_my_role() = 'evenvibe_admin'
);

-- --------------------------------------------------------
-- 4. SCHOOLS POLICIES
-- --------------------------------------------------------

-- Drop any potential existing policies
DROP POLICY IF EXISTS schools_select_own_or_admin ON public.schools;
DROP POLICY IF EXISTS schools_insert_admin ON public.schools;
DROP POLICY IF EXISTS schools_update_admin ON public.schools;
DROP POLICY IF EXISTS schools_delete_admin ON public.schools;

-- SELECT: evenvibe_admin can view all, school_admin can view their own
CREATE POLICY schools_select_own_or_admin ON public.schools
FOR SELECT 
TO authenticated
USING (
    public.get_my_role() = 'evenvibe_admin' OR 
    id = public.get_my_school_id()
);

-- INSERT: only evenvibe_admin
CREATE POLICY schools_insert_admin ON public.schools
FOR INSERT 
TO authenticated
WITH CHECK (
    public.get_my_role() = 'evenvibe_admin'
);

-- UPDATE: only evenvibe_admin
CREATE POLICY schools_update_admin ON public.schools
FOR UPDATE 
TO authenticated
USING (
    public.get_my_role() = 'evenvibe_admin'
) WITH CHECK (
    public.get_my_role() = 'evenvibe_admin'
);

-- DELETE: only evenvibe_admin
CREATE POLICY schools_delete_admin ON public.schools
FOR DELETE 
TO authenticated
USING (
    public.get_my_role() = 'evenvibe_admin'
);
