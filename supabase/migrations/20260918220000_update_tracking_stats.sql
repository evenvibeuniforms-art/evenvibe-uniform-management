-- Migration to fix get_order_tracking_stats counts
CREATE OR REPLACE FUNCTION public.get_order_tracking_stats(p_order_id UUID)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_profile_id UUID;
    v_role TEXT;
    v_user_school_id UUID;
    v_order_school_id UUID;
    v_req_id UUID;
    
    v_tracked_count INTEGER;
    v_total_students_count INTEGER;
    v_completed_eligible_count INTEGER;
    
    v_ready_to_add_count INTEGER;
    v_pending_count INTEGER;
    v_is_legacy BOOLEAN;
BEGIN
    v_profile_id := auth.uid();
    IF v_profile_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT role, school_id INTO v_role, v_user_school_id
    FROM public.profiles
    WHERE id = v_profile_id;

    -- Fetch order and ensure it belongs to the caller's school if school_admin
    SELECT school_id, requirement_id INTO v_order_school_id, v_req_id
    FROM public.orders
    WHERE id = p_order_id;

    IF v_order_school_id IS NULL THEN
        RAISE EXCEPTION 'Order not found';
    END IF;

    IF v_role = 'school_admin' AND v_order_school_id != v_user_school_id THEN
        RAISE EXCEPTION 'Unauthorized: Access denied to this order';
    END IF;

    -- Check legacy status by looking for requirement_students
    SELECT count(*) INTO v_tracked_count
    FROM public.requirement_students 
    WHERE requirement_id = v_req_id;

    IF v_tracked_count = 0 THEN
        v_is_legacy := true;
        v_ready_to_add_count := 0;
        v_pending_count := 0;
    ELSE
        v_is_legacy := false;
        
        -- 1. Get ALL active students in the school (this represents the full population)
        SELECT count(*) INTO v_total_students_count
        FROM public.students
        WHERE school_id = v_order_school_id;
        
        -- 2. Count all eligible students in the school whose sizes are COMPLETE
        -- This logic matches submit_requirement() exactly.
        SELECT count(*) INTO v_completed_eligible_count
        FROM public.students s
        JOIN public.student_uniform_sizes sus ON s.id = sus.student_id
        WHERE s.school_id = v_order_school_id
          AND sus.is_complete = true
          AND NOT EXISTS (
              SELECT 1
              FROM public.school_uniform_configurations c
              JOIN public.school_uniform_configuration_items ci ON ci.configuration_id = c.id
              WHERE c.school_id = v_order_school_id
                AND c.is_active = true
                AND c.gender = s.gender
                AND ci.is_required = true
                AND (sus.dynamic_sizes IS NULL OR NOT (sus.dynamic_sizes ? ci.id::text) OR (sus.dynamic_sizes->>ci.id::text) = '')
          );

        -- ready_to_add_count: Students who are complete but not yet tracked
        v_ready_to_add_count := GREATEST(0, v_completed_eligible_count - v_tracked_count);

        -- pending_count: Students who are still NOT complete
        v_pending_count := GREATEST(0, v_total_students_count - v_completed_eligible_count);
    END IF;

    RETURN json_build_object(
        'is_legacy', v_is_legacy,
        'tracked_count', v_tracked_count,
        'ready_to_add_count', v_ready_to_add_count,
        'pending_count', v_pending_count
    );
END;
$$;

-- Secure the RPC
REVOKE EXECUTE ON FUNCTION public.get_order_tracking_stats(UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_order_tracking_stats(UUID) TO authenticated, service_role;
