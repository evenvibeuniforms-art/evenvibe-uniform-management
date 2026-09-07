-- Migration: Create requirements and requirement_items tables with submission RPC

-- 1. Create public.requirements table
CREATE TABLE IF NOT EXISTS public.requirements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    requirement_number TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'under_review', 'confirmed')),
    total_students INTEGER NOT NULL DEFAULT 0,
    regular_uniform_students INTEGER NOT NULL DEFAULT 0,
    tshirt_uniform_students INTEGER NOT NULL DEFAULT 0,
    submitted_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for requirements
CREATE INDEX IF NOT EXISTS requirements_school_id_idx ON public.requirements(school_id);
CREATE INDEX IF NOT EXISTS requirements_status_idx ON public.requirements(status);

-- 2. Create public.requirement_items table
CREATE TABLE IF NOT EXISTS public.requirement_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requirement_id UUID NOT NULL REFERENCES public.requirements(id) ON DELETE CASCADE,
    uniform_type TEXT NOT NULL CHECK (uniform_type IN ('regular', 'tshirt')),
    item_type TEXT NOT NULL CHECK (item_type IN ('shirt', 'tshirt', 'pant', 'short')),
    size TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (requirement_id, uniform_type, item_type, size)
);

CREATE INDEX IF NOT EXISTS requirement_items_requirement_id_idx ON public.requirement_items(requirement_id);

-- Add updated_at trigger for requirements
CREATE TRIGGER set_requirements_updated_at
    BEFORE UPDATE ON public.requirements
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- Enable RLS
ALTER TABLE public.requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requirement_items ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies
-- School Admins can view own requirements
CREATE POLICY "School Admins can view own requirements" 
    ON public.requirements FOR SELECT
    USING (school_id = public.get_my_school_id() AND public.get_my_role() = 'school_admin');

-- School Admins can view own requirement items
CREATE POLICY "School Admins can view own requirement items" 
    ON public.requirement_items FOR SELECT
    USING (
        requirement_id IN (
            SELECT id FROM public.requirements WHERE school_id = public.get_my_school_id()
        ) AND public.get_my_role() = 'school_admin'
    );

-- Note: INSERT/UPDATE for requirements will be handled via RPC using SECURITY DEFINER to ensure atomicity and exact calculations.
-- We will also allow SELECT for service_role and authenticated users through explicit Grants.
GRANT SELECT ON public.requirements TO authenticated, service_role;
GRANT SELECT ON public.requirement_items TO authenticated, service_role;

-- 4. RPC for Atomic Submission
CREATE OR REPLACE FUNCTION public.submit_requirement()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_profile_id UUID;
    v_role TEXT;
    v_school_id UUID;
    v_school_active BOOLEAN;
    
    v_total_students INTEGER;
    v_pending_students INTEGER;
    
    v_regular_count INTEGER := 0;
    v_tshirt_count INTEGER := 0;
    
    v_req_id UUID;
    v_req_number TEXT;
    
    v_active_req_count INTEGER;
BEGIN
    -- 1. Authentication and Authorization
    v_profile_id := auth.uid();
    IF v_profile_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT role, school_id INTO v_role, v_school_id
    FROM public.profiles
    WHERE id = v_profile_id;

    IF v_role != 'school_admin' OR v_school_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Must be a school admin';
    END IF;

    -- Check if school is active
    SELECT is_active INTO v_school_active
    FROM public.schools
    WHERE id = v_school_id;

    IF v_school_active IS NOT TRUE THEN
        RAISE EXCEPTION 'Unauthorized: School is not active';
    END IF;

    -- 2. Check for existing active requirements
    SELECT count(*) INTO v_active_req_count
    FROM public.requirements
    WHERE school_id = v_school_id AND status IN ('submitted', 'under_review', 'confirmed');

    IF v_active_req_count > 0 THEN
        RAISE EXCEPTION 'An active requirement has already been submitted for this school.';
    END IF;

    -- 3. Verify students and completeness
    SELECT count(*) INTO v_total_students
    FROM public.students
    WHERE school_id = v_school_id;

    IF v_total_students = 0 THEN
        RAISE EXCEPTION 'No students found for this school.';
    END IF;

    SELECT count(*) INTO v_pending_students
    FROM public.students s
    LEFT JOIN public.student_uniform_sizes sus ON s.id = sus.student_id
    WHERE s.school_id = v_school_id 
      AND (
          sus.id IS NULL 
          OR sus.is_complete = false
          OR (
             -- Double check business logic directly in DB to be absolutely safe
             (sus.uniform_type = 'regular' AND (sus.shirt_size IS NULL OR (sus.pant_size IS NULL AND sus.short_size IS NULL)))
             OR
             (sus.uniform_type = 'tshirt' AND (sus.tshirt_size IS NULL OR (sus.pant_size IS NULL AND sus.short_size IS NULL)))
          )
      );

    IF v_pending_students > 0 THEN
        RAISE EXCEPTION 'Cannot submit: % students have incomplete or missing sizes.', v_pending_students;
    END IF;

    -- Calculate student distribution by uniform type
    SELECT count(*) INTO v_regular_count
    FROM public.student_uniform_sizes
    WHERE school_id = v_school_id AND uniform_type = 'regular';

    SELECT count(*) INTO v_tshirt_count
    FROM public.student_uniform_sizes
    WHERE school_id = v_school_id AND uniform_type = 'tshirt';

    -- 4. Create Requirement Record
    -- Generate Requirement Number: EV-REQ-YYYY-XXXX
    v_req_number := 'EV-REQ-' || to_char(now(), 'YYYY') || '-' || lpad(floor(random() * 9000 + 1000)::text, 4, '0');
    -- In a high scale system, a sequence is better, but this suffices for the scope (can loop to ensure uniqueness if needed).
    -- For exact uniqueness we can rely on UNIQUE constraint and retry, but for simplicity here we just use random 4 digits + maybe retry logic in future.
    -- Let's use a sequence to be absolutely safe against collisions:
    -- Actually, a random ID is requested, but let's just make it robust:
    v_req_number := 'EV-REQ-' || to_char(now(), 'YYYY') || '-' || upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 6));

    INSERT INTO public.requirements (
        school_id, requirement_number, status, total_students, 
        regular_uniform_students, tshirt_uniform_students, submitted_at
    ) VALUES (
        v_school_id, v_req_number, 'submitted', v_total_students, 
        v_regular_count, v_tshirt_count, now()
    ) RETURNING id INTO v_req_id;

    -- 5. Insert Requirement Items
    -- Regular Shirts
    INSERT INTO public.requirement_items (requirement_id, uniform_type, item_type, size, quantity)
    SELECT v_req_id, 'regular', 'shirt', shirt_size, count(*)
    FROM public.student_uniform_sizes
    WHERE school_id = v_school_id AND uniform_type = 'regular' AND shirt_size IS NOT NULL
    GROUP BY shirt_size;

    -- T-Shirts
    INSERT INTO public.requirement_items (requirement_id, uniform_type, item_type, size, quantity)
    SELECT v_req_id, 'tshirt', 'tshirt', tshirt_size, count(*)
    FROM public.student_uniform_sizes
    WHERE school_id = v_school_id AND uniform_type = 'tshirt' AND tshirt_size IS NOT NULL
    GROUP BY tshirt_size;

    -- Pants (Regular)
    INSERT INTO public.requirement_items (requirement_id, uniform_type, item_type, size, quantity)
    SELECT v_req_id, 'regular', 'pant', pant_size, count(*)
    FROM public.student_uniform_sizes
    WHERE school_id = v_school_id AND uniform_type = 'regular' AND pant_size IS NOT NULL
    GROUP BY pant_size;

    -- Shorts (Regular)
    INSERT INTO public.requirement_items (requirement_id, uniform_type, item_type, size, quantity)
    SELECT v_req_id, 'regular', 'short', short_size, count(*)
    FROM public.student_uniform_sizes
    WHERE school_id = v_school_id AND uniform_type = 'regular' AND short_size IS NOT NULL
    GROUP BY short_size;

    -- Pants (T-Shirt)
    INSERT INTO public.requirement_items (requirement_id, uniform_type, item_type, size, quantity)
    SELECT v_req_id, 'tshirt', 'pant', pant_size, count(*)
    FROM public.student_uniform_sizes
    WHERE school_id = v_school_id AND uniform_type = 'tshirt' AND pant_size IS NOT NULL
    GROUP BY pant_size;

    -- Shorts (T-Shirt)
    INSERT INTO public.requirement_items (requirement_id, uniform_type, item_type, size, quantity)
    SELECT v_req_id, 'tshirt', 'short', short_size, count(*)
    FROM public.student_uniform_sizes
    WHERE school_id = v_school_id AND uniform_type = 'tshirt' AND short_size IS NOT NULL
    GROUP BY short_size;

    RETURN json_build_object(
        'success', true,
        'requirement_id', v_req_id,
        'requirement_number', v_req_number
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object(
            'success', false,
            'error', SQLERRM
        );
END;
$$;

-- Grant EXECUTE to authenticated users
GRANT EXECUTE ON FUNCTION public.submit_requirement() TO authenticated;
