-- Migration: Alteration / Rework module

CREATE TABLE public.alteration_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    order_id UUID NULL REFERENCES public.orders(id) ON DELETE SET NULL,
    requirement_id UUID NULL REFERENCES public.requirements(id) ON DELETE SET NULL,
    
    request_number TEXT UNIQUE NOT NULL,

    uniform_type TEXT NOT NULL
        CHECK (uniform_type IN ('regular', 'tshirt')),

    item_type TEXT NOT NULL
        CHECK (item_type IN ('shirt', 'tshirt', 'pant', 'short')),

    issue_type TEXT NOT NULL
        CHECK (issue_type IN (
            'wrong_size',
            'stitching_issue',
            'measurement_issue',
            'damaged_item',
            'missing_item',
            'wrong_item',
            'other'
        )),

    description TEXT NOT NULL,

    status TEXT NOT NULL DEFAULT 'requested'
        CHECK (status IN (
            'requested',
            'under_review',
            'approved',
            'rejected',
            'rework',
            'completed'
        )),

    admin_note TEXT NULL,

    resolved_at TIMESTAMPTZ NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_alteration_requests_school_id ON public.alteration_requests(school_id);
CREATE INDEX idx_alteration_requests_student_id ON public.alteration_requests(student_id);
CREATE INDEX idx_alteration_requests_order_id ON public.alteration_requests(order_id);
CREATE INDEX idx_alteration_requests_status ON public.alteration_requests(status);
CREATE INDEX idx_alteration_requests_created_at ON public.alteration_requests(created_at);

-- Update timestamp trigger
CREATE TRIGGER update_alteration_requests_updated_at
    BEFORE UPDATE ON public.alteration_requests
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();


-- Alteration Request History Table
CREATE TABLE public.alteration_request_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alteration_request_id UUID NOT NULL REFERENCES public.alteration_requests(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    note TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_alteration_history_req_id ON public.alteration_request_history(alteration_request_id);


-- Enable Row Level Security
ALTER TABLE public.alteration_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alteration_request_history ENABLE ROW LEVEL SECURITY;

-- Select Policies for School Admin
CREATE POLICY "School Admin can view their own school's alteration requests"
    ON public.alteration_requests FOR SELECT
    TO authenticated
    USING (
        school_id = public.get_my_school_id()
        AND public.get_my_role() = 'school_admin'
    );

CREATE POLICY "School Admin can view their own school's alteration request history"
    ON public.alteration_request_history FOR SELECT
    TO authenticated
    USING (
        alteration_request_id IN (
            SELECT id FROM public.alteration_requests 
            WHERE school_id = public.get_my_school_id()
        )
        AND public.get_my_role() = 'school_admin'
    );


-- RPC function to securely submit an alteration request
CREATE OR REPLACE FUNCTION public.submit_alteration_request(
    p_student_id UUID,
    p_uniform_type TEXT,
    p_item_type TEXT,
    p_issue_type TEXT,
    p_description TEXT,
    p_order_id UUID DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_school_id UUID;
    v_role TEXT;
    v_student_school_id UUID;
    v_order_school_id UUID;
    v_requirement_id UUID;
    v_request_id UUID;
    v_request_number TEXT;
    v_duplicate_exists BOOLEAN;
BEGIN
    -- 1. Get authenticated user details
    v_role := public.get_my_role();
    v_school_id := public.get_my_school_id();

    IF v_role != 'school_admin' OR v_school_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', 'Unauthorized');
    END IF;

    -- 2. Validate student belongs to school
    SELECT school_id INTO v_student_school_id FROM public.students WHERE id = p_student_id;
    IF v_student_school_id IS NULL OR v_student_school_id != v_school_id THEN
        RETURN json_build_object('success', false, 'error', 'Student does not belong to your school');
    END IF;

    -- 3. Validate order if provided, or verify student has at least one delivered order
    IF p_order_id IS NOT NULL THEN
        SELECT school_id, requirement_id INTO v_order_school_id, v_requirement_id FROM public.orders WHERE id = p_order_id;
        IF v_order_school_id IS NULL OR v_order_school_id != v_school_id THEN
            RETURN json_build_object('success', false, 'error', 'Order does not belong to your school');
        END IF;

        -- Check order is delivered
        IF NOT EXISTS (SELECT 1 FROM public.orders WHERE id = p_order_id AND status = 'delivered') THEN
            RETURN json_build_object('success', false, 'error', 'This student is not currently eligible for alteration. The related uniform order must be delivered first.');
        END IF;
    ELSE
        -- Check school has at least one delivered order covering requirements
        IF NOT EXISTS (SELECT 1 FROM public.orders WHERE school_id = v_school_id AND status = 'delivered') THEN
            RETURN json_build_object('success', false, 'error', 'This student is not currently eligible for alteration. The related uniform order must be delivered first.');
        END IF;
    END IF;

    -- 4. Validate uniform type compatibility
    IF p_uniform_type = 'regular' AND p_item_type NOT IN ('shirt', 'pant', 'short') THEN
        RETURN json_build_object('success', false, 'error', 'Invalid item type for regular uniform');
    END IF;

    IF p_uniform_type = 'tshirt' AND p_item_type NOT IN ('tshirt', 'pant', 'short') THEN
        RETURN json_build_object('success', false, 'error', 'Invalid item type for t-shirt uniform');
    END IF;

    -- 5. Prevent duplicate active requests (same student, item, and issue not resolved)
    SELECT EXISTS (
        SELECT 1 FROM public.alteration_requests
        WHERE student_id = p_student_id
        AND item_type = p_item_type
        AND issue_type = p_issue_type
        AND status IN ('requested', 'under_review', 'approved', 'rework')
    ) INTO v_duplicate_exists;

    IF v_duplicate_exists THEN
        RETURN json_build_object('success', false, 'error', 'An active alteration request already exists for this issue.');
    END IF;

    -- 6. Generate collision-safe request number
    -- Format: EV-ALT-YYYY-XXXXXX
    v_request_number := 'EV-ALT-' || to_char(CURRENT_DATE, 'YYYY') || '-' || upper(substring(md5(random()::text), 1, 6));

    -- Loop to ensure uniqueness just in case
    WHILE EXISTS (SELECT 1 FROM public.alteration_requests WHERE request_number = v_request_number) LOOP
        v_request_number := 'EV-ALT-' || to_char(CURRENT_DATE, 'YYYY') || '-' || upper(substring(md5(random()::text), 1, 6));
    END LOOP;

    -- 7. Insert the alteration request
    INSERT INTO public.alteration_requests (
        school_id,
        student_id,
        order_id,
        requirement_id,
        request_number,
        uniform_type,
        item_type,
        issue_type,
        description,
        status
    )
    VALUES (
        v_school_id,
        p_student_id,
        p_order_id,
        v_requirement_id,
        v_request_number,
        p_uniform_type,
        p_item_type,
        p_issue_type,
        p_description,
        'requested'
    )
    RETURNING id INTO v_request_id;

    -- 8. Insert initial history row
    INSERT INTO public.alteration_request_history (
        alteration_request_id,
        status
    )
    VALUES (
        v_request_id,
        'requested'
    );

    -- 9. Return success
    RETURN json_build_object(
        'success', true, 
        'alteration_request_id', v_request_id,
        'request_number', v_request_number
    );

EXCEPTION
    WHEN OTHERS THEN
        -- Standard error handling
        RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$$;
