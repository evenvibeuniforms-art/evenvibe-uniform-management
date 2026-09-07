-- Create app_role enum
CREATE TYPE public.app_role AS ENUM ('evenvibe_admin', 'school_admin');

-- Create schools table
CREATE TABLE public.schools (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    school_code TEXT NOT NULL UNIQUE,
    address TEXT,
    city TEXT,
    district TEXT,
    state TEXT NOT NULL DEFAULT 'Tamil Nadu',
    pincode TEXT,
    contact_name TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create profiles table
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    role public.app_role NOT NULL,
    school_id UUID REFERENCES public.schools(id) ON DELETE RESTRICT,
    phone TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_profile_role_school CHECK (
        (role = 'evenvibe_admin' AND school_id IS NULL) OR 
        (role = 'school_admin' AND school_id IS NOT NULL)
    )
);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers
CREATE TRIGGER set_schools_updated_at
    BEFORE UPDATE ON public.schools
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER set_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- Create Indexes
CREATE INDEX idx_profiles_school_id ON public.profiles(school_id);
CREATE INDEX idx_profiles_role ON public.profiles(role);
