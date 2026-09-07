-- Migration: Create orders and order_status_history tables, update RPC, backfill existing

-- 1. Create public.orders table
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    requirement_id UUID NOT NULL REFERENCES public.requirements(id) ON DELETE RESTRICT,
    order_number TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'under_review', 'confirmed', 'production', 'quality_check', 'packed', 'dispatched', 'in_transit', 'delivered')),
    courier_name TEXT NULL,
    tracking_number TEXT NULL,
    estimated_delivery DATE NULL,
    shipped_at TIMESTAMPTZ NULL,
    delivered_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(requirement_id) -- One requirement -> One order
);

-- Indexes for orders
CREATE INDEX IF NOT EXISTS orders_school_id_idx ON public.orders(school_id);
CREATE INDEX IF NOT EXISTS orders_requirement_id_idx ON public.orders(requirement_id);
CREATE INDEX IF NOT EXISTS orders_status_idx ON public.orders(status);
CREATE INDEX IF NOT EXISTS orders_order_number_idx ON public.orders(order_number);

-- 2. Create public.order_status_history table
CREATE TABLE IF NOT EXISTS public.order_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('submitted', 'under_review', 'confirmed', 'production', 'quality_check', 'packed', 'dispatched', 'in_transit', 'delivered')),
    note TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_status_history_order_id_idx ON public.order_status_history(order_id);
CREATE INDEX IF NOT EXISTS order_status_history_created_at_idx ON public.order_status_history(created_at);

-- Add updated_at trigger for orders
CREATE TRIGGER set_orders_updated_at
    BEFORE UPDATE ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- 3. RLS Policies
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;

-- School Admins can view own orders
CREATE POLICY "School Admins can view own orders" 
    ON public.orders FOR SELECT
    USING (school_id = public.get_my_school_id() AND public.get_my_role() = 'school_admin');

-- School Admins can view history for own orders
CREATE POLICY "School Admins can view history for own orders" 
    ON public.order_status_history FOR SELECT
    USING (
        order_id IN (
            SELECT id FROM public.orders WHERE school_id = public.get_my_school_id()
        ) AND public.get_my_role() = 'school_admin'
    );

GRANT SELECT ON public.orders TO authenticated, service_role;
GRANT SELECT ON public.order_status_history TO authenticated, service_role;


-- 4. Replace RPC for Atomic Submission to include Order Creation
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
    
    v_order_id UUID;
    v_order_number TEXT;
    
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
    v_req_number := 'EV-REQ-' || to_char(now(), 'YYYY') || '-' || upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 6));

    INSERT INTO public.requirements (
        school_id, requirement_number, status, total_students, 
        regular_uniform_students, tshirt_uniform_students, submitted_at
    ) VALUES (
        v_school_id, v_req_number, 'submitted', v_total_students, 
        v_regular_count, v_tshirt_count, now()
    ) RETURNING id INTO v_req_id;

    -- 5. Insert Requirement Items
    INSERT INTO public.requirement_items (requirement_id, uniform_type, item_type, size, quantity)
    SELECT v_req_id, 'regular', 'shirt', shirt_size, count(*)
    FROM public.student_uniform_sizes
    WHERE school_id = v_school_id AND uniform_type = 'regular' AND shirt_size IS NOT NULL
    GROUP BY shirt_size;

    INSERT INTO public.requirement_items (requirement_id, uniform_type, item_type, size, quantity)
    SELECT v_req_id, 'tshirt', 'tshirt', tshirt_size, count(*)
    FROM public.student_uniform_sizes
    WHERE school_id = v_school_id AND uniform_type = 'tshirt' AND tshirt_size IS NOT NULL
    GROUP BY tshirt_size;

    INSERT INTO public.requirement_items (requirement_id, uniform_type, item_type, size, quantity)
    SELECT v_req_id, 'regular', 'pant', pant_size, count(*)
    FROM public.student_uniform_sizes
    WHERE school_id = v_school_id AND uniform_type = 'regular' AND pant_size IS NOT NULL
    GROUP BY pant_size;

    INSERT INTO public.requirement_items (requirement_id, uniform_type, item_type, size, quantity)
    SELECT v_req_id, 'regular', 'short', short_size, count(*)
    FROM public.student_uniform_sizes
    WHERE school_id = v_school_id AND uniform_type = 'regular' AND short_size IS NOT NULL
    GROUP BY short_size;

    INSERT INTO public.requirement_items (requirement_id, uniform_type, item_type, size, quantity)
    SELECT v_req_id, 'tshirt', 'pant', pant_size, count(*)
    FROM public.student_uniform_sizes
    WHERE school_id = v_school_id AND uniform_type = 'tshirt' AND pant_size IS NOT NULL
    GROUP BY pant_size;

    INSERT INTO public.requirement_items (requirement_id, uniform_type, item_type, size, quantity)
    SELECT v_req_id, 'tshirt', 'short', short_size, count(*)
    FROM public.student_uniform_sizes
    WHERE school_id = v_school_id AND uniform_type = 'tshirt' AND short_size IS NOT NULL
    GROUP BY short_size;

    -- 6. Create Order Record
    v_order_number := 'EV-ORD-' || to_char(now(), 'YYYY') || '-' || upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 6));

    INSERT INTO public.orders (
        school_id, requirement_id, order_number, status, created_at
    ) VALUES (
        v_school_id, v_req_id, v_order_number, 'submitted', now()
    ) RETURNING id INTO v_order_id;

    -- 7. Insert Initial Order Status History
    INSERT INTO public.order_status_history (
        order_id, status, note, created_at
    ) VALUES (
        v_order_id, 'submitted', 'Requirement submitted successfully', now()
    );

    RETURN json_build_object(
        'success', true,
        'requirement_id', v_req_id,
        'requirement_number', v_req_number,
        'order_id', v_order_id,
        'order_number', v_order_number
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object(
            'success', false,
            'error', SQLERRM
        );
END;
$$;


-- 5. Safely Backfill Existing Submitted Requirements
DO $$
DECLARE
    r RECORD;
    v_order_id UUID;
    v_order_number TEXT;
BEGIN
    FOR r IN 
        SELECT id, school_id 
        FROM public.requirements 
        WHERE status = 'submitted' 
          AND NOT EXISTS (
              SELECT 1 FROM public.orders WHERE requirement_id = public.requirements.id
          )
    LOOP
        v_order_number := 'EV-ORD-' || to_char(now(), 'YYYY') || '-' || upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 6));
        
        INSERT INTO public.orders (
            school_id, requirement_id, order_number, status, created_at
        ) VALUES (
            r.school_id, r.id, v_order_number, 'submitted', now()
        ) RETURNING id INTO v_order_id;
        
        INSERT INTO public.order_status_history (
            order_id, status, note, created_at
        ) VALUES (
            v_order_id, 'submitted', 'Requirement submitted successfully (Backfilled)', now()
        );
    END LOOP;
END;
$$;
