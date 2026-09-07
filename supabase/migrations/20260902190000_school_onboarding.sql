-- --------------------------------------------------------
-- SCHOOL ONBOARDING - SECURE REGISTRATION FUNCTION
-- --------------------------------------------------------

-- This SECURITY DEFINER function safely creates the initial school and profile
-- records for a newly authenticated user, using only metadata populated
-- during the Supabase Auth signUp process. It enforces role and active status.

CREATE OR REPLACE FUNCTION public.register_school()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    _uid uuid;
    _school_name text;
    _school_code text;
    _address text;
    _city text;
    _district text;
    _state text;
    _pincode text;
    _contact_name text;
    _contact_email text;
    _contact_phone text;
    _admin_full_name text;
    _metadata jsonb;
    _new_school_id uuid;
BEGIN
    -- 1. Derive UID directly from authenticated session
    _uid := auth.uid();
    IF _uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- 2. Prevent duplicate onboarding (Idempotency)
    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = _uid) THEN
        RETURN;
    END IF;

    -- 3. Extract metadata securely from auth.users
    SELECT raw_user_meta_data INTO _metadata FROM auth.users WHERE id = _uid;
    
    _school_name := _metadata->>'onboarding_school_name';
    _school_code := _metadata->>'onboarding_school_code';
    _address := _metadata->>'onboarding_address';
    _city := _metadata->>'onboarding_city';
    _district := _metadata->>'onboarding_district';
    _state := _metadata->>'onboarding_state';
    _pincode := _metadata->>'onboarding_pincode';
    _contact_name := _metadata->>'onboarding_contact_name';
    _contact_email := _metadata->>'onboarding_contact_email';
    _contact_phone := _metadata->>'onboarding_contact_phone';
    _admin_full_name := _metadata->>'onboarding_admin_full_name';

    IF _school_name IS NULL OR _school_code IS NULL OR _admin_full_name IS NULL THEN
        RAISE EXCEPTION 'Missing required onboarding data';
    END IF;

    -- Check for duplicate school code to throw a clean error
    IF EXISTS (SELECT 1 FROM public.schools WHERE school_code = _school_code) THEN
        RAISE EXCEPTION 'School code already exists';
    END IF;

    -- 4. Insert School (strictly is_active = false)
    INSERT INTO public.schools (
        name, school_code, address, city, district, state, pincode, 
        contact_name, contact_email, contact_phone, is_active
    ) VALUES (
        _school_name, _school_code, _address, _city, _district, COALESCE(_state, 'Tamil Nadu'), _pincode,
        _contact_name, _contact_email, _contact_phone, false
    ) RETURNING id INTO _new_school_id;

    -- 5. Insert Profile (strictly school_admin and is_active = false)
    INSERT INTO public.profiles (
        id, full_name, role, school_id, is_active
    ) VALUES (
        _uid, _admin_full_name, 'school_admin', _new_school_id, false
    );

END;
$$;

-- Revoke execute from public (anon) and grant only to authenticated
REVOKE EXECUTE ON FUNCTION public.register_school() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_school() TO authenticated;
