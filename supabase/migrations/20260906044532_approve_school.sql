-- --------------------------------------------------------
-- Atomic Approve School RPC
-- --------------------------------------------------------
-- This function securely approves a school and its associated school_admin profile.
-- It executes as SECURITY DEFINER to bypass normal RLS strictly for these operations,
-- but enforces its own strict authorization check first.

CREATE OR REPLACE FUNCTION public.approve_school(p_school_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_role text;
BEGIN
    -- 1. Ensure the caller is authenticated
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- 2. Fetch the authenticated user's actual role from the database profile
    SELECT role INTO v_user_role
    FROM public.profiles
    WHERE id = auth.uid();

    -- 3. Verify EvenVibe Admin status
    IF v_user_role IS NULL OR v_user_role != 'evenvibe_admin' THEN
        RAISE EXCEPTION 'Unauthorized: Only EvenVibe admins can approve schools';
    END IF;

    -- 4. Verify target school exists
    IF NOT EXISTS (SELECT 1 FROM public.schools WHERE id = p_school_id) THEN
        RAISE EXCEPTION 'School not found';
    END IF;

    -- 5. Atomically update the school status
    UPDATE public.schools
    SET is_active = true
    WHERE id = p_school_id;

    -- 6. Atomically update the corresponding school admin profile(s)
    UPDATE public.profiles
    SET is_active = true
    WHERE school_id = p_school_id
      AND role = 'school_admin';
END;
$$;

-- Secure the function permissions
REVOKE EXECUTE ON FUNCTION public.approve_school(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_school(uuid) TO authenticated;
