-- Migration: Admin User Management
-- Phase 13: Dedicated functions for EvenVive Admin User Management

-- Add index on is_active for faster status filtering
CREATE INDEX IF NOT EXISTS idx_profiles_is_active ON public.profiles(is_active);

-- Function: admin_get_users
-- Returns paginated users with auth emails, school details, and KPI summary
CREATE OR REPLACE FUNCTION public.admin_get_users(
    p_search TEXT DEFAULT NULL,
    p_role TEXT DEFAULT NULL,
    p_school_id UUID DEFAULT NULL,
    p_status TEXT DEFAULT NULL,
    p_page INT DEFAULT 1,
    p_page_size INT DEFAULT 10,
    p_sort_by TEXT DEFAULT 'created_at',
    p_sort_asc BOOLEAN DEFAULT FALSE
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_offset INT;
    v_total_count INT;
    v_users JSON;
    v_total_users INT;
    v_active_users INT;
    v_inactive_users INT;
    v_school_admins INT;
    v_clean_search TEXT;
BEGIN
    -- Authorize only evenvibe_admin
    IF public.get_my_role() != 'evenvibe_admin' THEN
        RAISE EXCEPTION 'Access denied. Only EvenVive Admins can view user management.';
    END IF;

    -- Page sanity checks
    IF p_page < 1 THEN p_page := 1; END IF;
    IF p_page_size < 1 THEN p_page_size := 10; END IF;
    IF p_page_size > 100 THEN p_page_size := 100; END IF;
    v_offset := (p_page - 1) * p_page_size;

    -- Clean search string
    v_clean_search := NULLIF(TRIM(p_search), '');

    -- Global KPIs (unfiltered)
    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE p.is_active = TRUE),
        COUNT(*) FILTER (WHERE p.is_active = FALSE),
        COUNT(*) FILTER (WHERE p.role = 'school_admin')
    INTO
        v_total_users,
        v_active_users,
        v_inactive_users,
        v_school_admins
    FROM public.profiles p;

    -- Filtered total count
    SELECT COUNT(*)
    INTO v_total_count
    FROM public.profiles p
    LEFT JOIN auth.users u ON p.id = u.id
    LEFT JOIN public.schools s ON p.school_id = s.id
    WHERE
        (v_clean_search IS NULL OR (
            p.full_name ILIKE '%' || v_clean_search || '%'
            OR u.email ILIKE '%' || v_clean_search || '%'
            OR p.phone ILIKE '%' || v_clean_search || '%'
            OR s.name ILIKE '%' || v_clean_search || '%'
            OR s.school_code ILIKE '%' || v_clean_search || '%'
        ))
        AND (p_role IS NULL OR p_role = '' OR p_role = 'all' OR p.role::TEXT = p_role)
        AND (p_school_id IS NULL OR p.school_id = p_school_id)
        AND (
            p_status IS NULL OR p_status = '' OR p_status = 'all'
            OR (p_status = 'active' AND p.is_active = TRUE)
            OR (p_status = 'inactive' AND p.is_active = FALSE)
        );

    -- Fetch paginated rows with dynamic sorting
    WITH filtered_users AS (
        SELECT
            p.id,
            COALESCE(p.full_name, 'No Name') AS full_name,
            COALESCE(u.email, 'No Email') AS email,
            p.phone,
            p.role::TEXT AS role,
            p.school_id,
            s.name AS school_name,
            s.school_code,
            p.is_active,
            p.created_at,
            p.updated_at,
            u.last_sign_in_at,
            u.email_confirmed_at
        FROM public.profiles p
        LEFT JOIN auth.users u ON p.id = u.id
        LEFT JOIN public.schools s ON p.school_id = s.id
        WHERE
            (v_clean_search IS NULL OR (
                p.full_name ILIKE '%' || v_clean_search || '%'
                OR u.email ILIKE '%' || v_clean_search || '%'
                OR p.phone ILIKE '%' || v_clean_search || '%'
                OR s.name ILIKE '%' || v_clean_search || '%'
                OR s.school_code ILIKE '%' || v_clean_search || '%'
            ))
            AND (p_role IS NULL OR p_role = '' OR p_role = 'all' OR p.role::TEXT = p_role)
            AND (p_school_id IS NULL OR p.school_id = p_school_id)
            AND (
                p_status IS NULL OR p_status = '' OR p_status = 'all'
                OR (p_status = 'active' AND p.is_active = TRUE)
                OR (p_status = 'inactive' AND p.is_active = FALSE)
            )
        ORDER BY
            CASE WHEN p_sort_by = 'name' AND p_sort_asc THEN p.full_name END ASC,
            CASE WHEN p_sort_by = 'name' AND NOT p_sort_asc THEN p.full_name END DESC,
            CASE WHEN p_sort_by = 'role' AND p_sort_asc THEN p.role::TEXT END ASC,
            CASE WHEN p_sort_by = 'role' AND NOT p_sort_asc THEN p.role::TEXT END DESC,
            CASE WHEN p_sort_by = 'school' AND p_sort_asc THEN COALESCE(s.name, 'EvenVibe Admin') END ASC,
            CASE WHEN p_sort_by = 'school' AND NOT p_sort_asc THEN COALESCE(s.name, 'EvenVibe Admin') END DESC,
            CASE WHEN p_sort_by = 'status' AND p_sort_asc THEN p.is_active END ASC,
            CASE WHEN p_sort_by = 'status' AND NOT p_sort_asc THEN p.is_active END DESC,
            CASE WHEN (p_sort_by = 'created_at' OR p_sort_by IS NULL) AND p_sort_asc THEN p.created_at END ASC,
            CASE WHEN (p_sort_by = 'created_at' OR p_sort_by IS NULL) AND NOT p_sort_asc THEN p.created_at END DESC,
            p.created_at DESC
        LIMIT p_page_size
        OFFSET v_offset
    )
    SELECT COALESCE(json_agg(row_to_json(fu)), '[]'::JSON)
    INTO v_users
    FROM filtered_users fu;

    RETURN json_build_object(
        'users', v_users,
        'totalCount', v_total_count,
        'page', p_page,
        'pageSize', p_page_size,
        'kpis', json_build_object(
            'totalUsers', COALESCE(v_total_users, 0),
            'activeUsers', COALESCE(v_active_users, 0),
            'inactiveUsers', COALESCE(v_inactive_users, 0),
            'schoolAdmins', COALESCE(v_school_admins, 0)
        )
    );
END;
$$;

-- Function: admin_set_user_active
-- Atomically updates profiles.is_active with safety protections
CREATE OR REPLACE FUNCTION public.admin_set_user_active(
    p_user_id UUID,
    p_is_active BOOLEAN
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_current_user_id UUID;
    v_target_profile RECORD;
BEGIN
    -- Authorize only evenvibe_admin
    IF public.get_my_role() != 'evenvibe_admin' THEN
        RAISE EXCEPTION 'Access denied. Only EvenVive Admins can update user status.';
    END IF;

    v_current_user_id := auth.uid();

    -- Protect self-lockout
    IF p_user_id = v_current_user_id AND p_is_active = FALSE THEN
        RAISE EXCEPTION 'You cannot deactivate your own account.';
    END IF;

    -- Check target profile existence
    SELECT id, role, school_id, is_active
    INTO v_target_profile
    FROM public.profiles
    WHERE id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Target user profile does not exist.';
    END IF;

    -- Prevent deactivating EvenVive Admin
    IF v_target_profile.role = 'evenvibe_admin' AND p_is_active = FALSE THEN
        RAISE EXCEPTION 'EvenVive Admin accounts cannot be deactivated.';
    END IF;

    -- Perform atomic update
    UPDATE public.profiles
    SET is_active = p_is_active,
        updated_at = now()
    WHERE id = p_user_id;

    RETURN json_build_object(
        'success', TRUE,
        'userId', p_user_id,
        'isActive', p_is_active
    );
END;
$$;

-- Privileges
REVOKE ALL ON FUNCTION public.admin_get_users(TEXT, TEXT, UUID, TEXT, INT, INT, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_users(TEXT, TEXT, UUID, TEXT, INT, INT, TEXT, BOOLEAN) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_set_user_active(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_active(UUID, BOOLEAN) TO authenticated;
