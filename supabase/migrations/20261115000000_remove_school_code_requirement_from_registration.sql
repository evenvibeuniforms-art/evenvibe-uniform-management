-- --------------------------------------------------------
-- REMOVE SCHOOL CODE REQUIREMENT FROM REGISTRATION
-- --------------------------------------------------------

-- Updates public.register_school() so school_code is no longer mandatory
-- from the client during onboarding. If onboarding_school_code is not provided
-- or is empty, a unique school_code is automatically and deterministically generated.

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
    _prefix text;
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

    IF _school_name IS NULL OR _admin_full_name IS NULL THEN
        RAISE EXCEPTION 'Missing required onboarding data';
    END IF;

    -- If school_code was not provided or empty, generate a unique one automatically
    IF _school_code IS NULL OR trim(_school_code) = '' THEN
        _prefix := UPPER(SUBSTRING(REGEXP_REPLACE(_school_name, '[^a-zA-Z0-9]', '', 'g') FROM 1 FOR 4));
        IF _prefix IS NULL OR LENGTH(_prefix) < 2 THEN
            _prefix := 'SCH';
        END IF;

        LOOP
            _school_code := _prefix || '-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::text, 4, '0');
            EXIT WHEN NOT EXISTS (SELECT 1 FROM public.schools WHERE school_code = _school_code);
        END LOOP;
    ELSE
        -- If school code was provided, check for uniqueness and append suffix if collision
        IF EXISTS (SELECT 1 FROM public.schools WHERE school_code = _school_code) THEN
            LOOP
                _school_code := _school_code || '-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::text, 4, '0');
                EXIT WHEN NOT EXISTS (SELECT 1 FROM public.schools WHERE school_code = _school_code);
            END LOOP;
        END IF;
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

-- Ensure execute privileges are granted
REVOKE EXECUTE ON FUNCTION public.register_school() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_school() TO authenticated;
