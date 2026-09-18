-- Migration: Notifications Management
-- Phase 14: Centralized notification and announcement architecture

-- 1. Create notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    notification_type TEXT NOT NULL CHECK (
        notification_type IN ('announcement', 'order', 'production', 'quality_check', 'packing', 'delivery', 'system')
    ),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (
        status IN ('draft', 'scheduled', 'published', 'archived', 'cancelled')
    ),
    target_type TEXT NOT NULL DEFAULT 'all_schools' CHECK (
        target_type IN ('all_schools', 'selected_schools')
    ),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    scheduled_at TIMESTAMPTZ,
    published_at TIMESTAMPTZ,
    archived_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Create notification_targets mapping table
CREATE TABLE IF NOT EXISTS public.notification_targets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id UUID NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
    school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_notification_target UNIQUE (notification_id, school_id)
);

-- 3. Create notification_reads tracking table
CREATE TABLE IF NOT EXISTS public.notification_reads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id UUID NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_notification_user_read UNIQUE (notification_id, user_id)
);

-- 4. Triggers for updated_at
DROP TRIGGER IF EXISTS set_notifications_updated_at ON public.notifications;
CREATE TRIGGER set_notifications_updated_at
    BEFORE UPDATE ON public.notifications
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_notifications_status ON public.notifications(status);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON public.notifications(notification_type);
CREATE INDEX IF NOT EXISTS idx_notifications_target_type ON public.notifications(target_type);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_published_at ON public.notifications(published_at);
CREATE INDEX IF NOT EXISTS idx_notifications_scheduled_at ON public.notifications(scheduled_at);

CREATE INDEX IF NOT EXISTS idx_notification_targets_notification_id ON public.notification_targets(notification_id);
CREATE INDEX IF NOT EXISTS idx_notification_targets_school_id ON public.notification_targets(school_id);

CREATE INDEX IF NOT EXISTS idx_notification_reads_notification_id ON public.notification_reads(notification_id);
CREATE INDEX IF NOT EXISTS idx_notification_reads_user_id ON public.notification_reads(user_id);

-- 6. Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_reads ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies for notifications
-- EvenVive Admin full access
CREATE POLICY admin_notifications_all
    ON public.notifications
    FOR ALL
    USING (public.get_my_role() = 'evenvibe_admin')
    WITH CHECK (public.get_my_role() = 'evenvibe_admin');

-- School Admin can only SELECT published notifications targeted to all or their school
CREATE POLICY school_admin_notifications_select
    ON public.notifications
    FOR SELECT
    USING (
        public.get_my_role() = 'school_admin'
        AND status = 'published'
        AND (published_at <= now() OR published_at IS NULL)
        AND (
            target_type = 'all_schools'
            OR EXISTS (
                SELECT 1 FROM public.notification_targets nt
                WHERE nt.notification_id = notifications.id
                AND nt.school_id = public.get_my_school_id()
            )
        )
    );

-- 8. RLS Policies for notification_targets
-- EvenVive Admin full access
CREATE POLICY admin_notification_targets_all
    ON public.notification_targets
    FOR ALL
    USING (public.get_my_role() = 'evenvibe_admin')
    WITH CHECK (public.get_my_role() = 'evenvibe_admin');

-- School Admin can only SELECT targets for their own school
CREATE POLICY school_admin_notification_targets_select
    ON public.notification_targets
    FOR SELECT
    USING (
        public.get_my_role() = 'school_admin'
        AND school_id = public.get_my_school_id()
    );

-- 9. RLS Policies for notification_reads
-- EvenVive Admin can view read receipts
CREATE POLICY admin_notification_reads_select
    ON public.notification_reads
    FOR SELECT
    USING (public.get_my_role() = 'evenvibe_admin');

-- School Admin can read their own receipts
CREATE POLICY school_admin_notification_reads_select
    ON public.notification_reads
    FOR SELECT
    USING (
        public.get_my_role() = 'school_admin'
        AND user_id = auth.uid()
    );

-- School Admin can mark their own notifications as read
CREATE POLICY school_admin_notification_reads_insert
    ON public.notification_reads
    FOR INSERT
    WITH CHECK (
        public.get_my_role() = 'school_admin'
        AND user_id = auth.uid()
        AND EXISTS (
            SELECT 1 FROM public.notifications n
            WHERE n.id = notification_id
            AND n.status = 'published'
            AND (n.published_at <= now() OR n.published_at IS NULL)
            AND (
                n.target_type = 'all_schools'
                OR EXISTS (
                    SELECT 1 FROM public.notification_targets nt
                    WHERE nt.notification_id = n.id
                    AND nt.school_id = public.get_my_school_id()
                )
            )
        )
    );

CREATE POLICY school_admin_notification_reads_update
    ON public.notification_reads
    FOR UPDATE
    USING (
        public.get_my_role() = 'school_admin'
        AND user_id = auth.uid()
    )
    WITH CHECK (
        public.get_my_role() = 'school_admin'
        AND user_id = auth.uid()
    );

-- 10. Table Privileges
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_targets TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.notification_reads TO authenticated;

REVOKE ALL ON public.notifications FROM anon;
REVOKE ALL ON public.notification_targets FROM anon;
REVOKE ALL ON public.notification_reads FROM anon;

-- 11. RPC: admin_get_notifications
-- Fast paginated retrieval with target counts and creator info
CREATE OR REPLACE FUNCTION public.admin_get_notifications(
    p_search TEXT DEFAULT NULL,
    p_status TEXT DEFAULT NULL,
    p_type TEXT DEFAULT NULL,
    p_target_type TEXT DEFAULT NULL,
    p_start_date TIMESTAMPTZ DEFAULT NULL,
    p_end_date TIMESTAMPTZ DEFAULT NULL,
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
    v_notifications JSON;
    v_total_notifs INT;
    v_drafts INT;
    v_scheduled INT;
    v_published INT;
    v_archived INT;
    v_clean_search TEXT;
BEGIN
    -- Authorize only evenvibe_admin
    IF public.get_my_role() != 'evenvibe_admin' THEN
        RAISE EXCEPTION 'Access denied. Only EvenVive Admins can manage notifications.';
    END IF;

    -- Page sanity checks
    IF p_page < 1 THEN p_page := 1; END IF;
    IF p_page_size < 1 THEN p_page_size := 10; END IF;
    IF p_page_size > 100 THEN p_page_size := 100; END IF;
    v_offset := (p_page - 1) * p_page_size;

    v_clean_search := NULLIF(TRIM(p_search), '');

    -- Global KPIs (unfiltered)
    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE n.status = 'draft'),
        COUNT(*) FILTER (WHERE n.status = 'scheduled'),
        COUNT(*) FILTER (WHERE n.status = 'published'),
        COUNT(*) FILTER (WHERE n.status = 'archived')
    INTO
        v_total_notifs,
        v_drafts,
        v_scheduled,
        v_published,
        v_archived
    FROM public.notifications n;

    -- Filtered total count
    SELECT COUNT(*)
    INTO v_total_count
    FROM public.notifications n
    WHERE
        (v_clean_search IS NULL OR (
            n.title ILIKE '%' || v_clean_search || '%'
            OR n.message ILIKE '%' || v_clean_search || '%'
        ))
        AND (p_status IS NULL OR p_status = '' OR p_status = 'all' OR n.status = p_status)
        AND (p_type IS NULL OR p_type = '' OR p_type = 'all' OR n.notification_type = p_type)
        AND (p_target_type IS NULL OR p_target_type = '' OR p_target_type = 'all' OR n.target_type = p_target_type)
        AND (p_start_date IS NULL OR n.created_at >= p_start_date)
        AND (p_end_date IS NULL OR n.created_at <= p_end_date);

    -- Fetch paginated records
    WITH filtered AS (
        SELECT
            n.id,
            n.title,
            n.message,
            n.notification_type,
            n.status,
            n.target_type,
            n.created_by,
            COALESCE(p.full_name, 'Admin') AS created_by_name,
            n.scheduled_at,
            n.published_at,
            n.archived_at,
            n.cancelled_at,
            n.created_at,
            n.updated_at,
            CASE
                WHEN n.target_type = 'all_schools' THEN (SELECT COUNT(*)::INT FROM public.schools)
                ELSE (SELECT COUNT(*)::INT FROM public.notification_targets nt WHERE nt.notification_id = n.id)
            END AS target_school_count,
            COALESCE((
                SELECT json_agg(json_build_object('id', s.id, 'name', s.name, 'school_code', s.school_code))
                FROM public.notification_targets nt
                JOIN public.schools s ON nt.school_id = s.id
                WHERE nt.notification_id = n.id
            ), '[]'::JSON) AS target_schools
        FROM public.notifications n
        LEFT JOIN public.profiles p ON n.created_by = p.id
        WHERE
            (v_clean_search IS NULL OR (
                n.title ILIKE '%' || v_clean_search || '%'
                OR n.message ILIKE '%' || v_clean_search || '%'
            ))
            AND (p_status IS NULL OR p_status = '' OR p_status = 'all' OR n.status = p_status)
            AND (p_type IS NULL OR p_type = '' OR p_type = 'all' OR n.notification_type = p_type)
            AND (p_target_type IS NULL OR p_target_type = '' OR p_target_type = 'all' OR n.target_type = p_target_type)
            AND (p_start_date IS NULL OR n.created_at >= p_start_date)
            AND (p_end_date IS NULL OR n.created_at <= p_end_date)
        ORDER BY
            CASE WHEN p_sort_by = 'title' AND p_sort_asc THEN n.title END ASC,
            CASE WHEN p_sort_by = 'title' AND NOT p_sort_asc THEN n.title END DESC,
            CASE WHEN p_sort_by = 'status' AND p_sort_asc THEN n.status END ASC,
            CASE WHEN p_sort_by = 'status' AND NOT p_sort_asc THEN n.status END DESC,
            CASE WHEN p_sort_by = 'type' AND p_sort_asc THEN n.notification_type END ASC,
            CASE WHEN p_sort_by = 'type' AND NOT p_sort_asc THEN n.notification_type END DESC,
            CASE WHEN (p_sort_by = 'created_at' OR p_sort_by IS NULL) AND p_sort_asc THEN n.created_at END ASC,
            CASE WHEN (p_sort_by = 'created_at' OR p_sort_by IS NULL) AND NOT p_sort_asc THEN n.created_at END DESC,
            n.created_at DESC
        LIMIT p_page_size
        OFFSET v_offset
    )
    SELECT COALESCE(json_agg(row_to_json(f)), '[]'::JSON)
    INTO v_notifications
    FROM filtered f;

    RETURN json_build_object(
        'notifications', v_notifications,
        'totalCount', v_total_count,
        'page', p_page,
        'pageSize', p_page_size,
        'kpis', json_build_object(
            'totalNotifications', COALESCE(v_total_notifs, 0),
            'drafts', COALESCE(v_drafts, 0),
            'scheduled', COALESCE(v_scheduled, 0),
            'published', COALESCE(v_published, 0),
            'archived', COALESCE(v_archived, 0)
        )
    );
END;
$$;

-- 12. RPC: school_get_notifications
-- For School Admins to fetch their feed with read status and unread count
CREATE OR REPLACE FUNCTION public.school_get_notifications(
    p_page INT DEFAULT 1,
    p_page_size INT DEFAULT 10
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_user_id UUID;
    v_school_id UUID;
    v_offset INT;
    v_total_count INT;
    v_unread_count INT;
    v_items JSON;
BEGIN
    IF public.get_my_role() != 'school_admin' THEN
        RAISE EXCEPTION 'Access denied. Only School Admins can access school notifications.';
    END IF;

    v_user_id := auth.uid();
    v_school_id := public.get_my_school_id();

    IF v_school_id IS NULL THEN
        RETURN json_build_object(
            'notifications', '[]'::JSON,
            'totalCount', 0,
            'unreadCount', 0,
            'page', 1,
            'pageSize', p_page_size
        );
    END IF;

    -- Page sanity
    IF p_page < 1 THEN p_page := 1; END IF;
    IF p_page_size < 1 THEN p_page_size := 10; END IF;
    v_offset := (p_page - 1) * p_page_size;

    -- Total count visible to this school
    SELECT COUNT(*)
    INTO v_total_count
    FROM public.notifications n
    WHERE n.status = 'published'
      AND (n.published_at <= now() OR n.published_at IS NULL)
      AND (
          n.target_type = 'all_schools'
          OR EXISTS (
              SELECT 1 FROM public.notification_targets nt
              WHERE nt.notification_id = n.id
              AND nt.school_id = v_school_id
          )
      );

    -- Unread count for this user
    SELECT COUNT(*)
    INTO v_unread_count
    FROM public.notifications n
    WHERE n.status = 'published'
      AND (n.published_at <= now() OR n.published_at IS NULL)
      AND (
          n.target_type = 'all_schools'
          OR EXISTS (
              SELECT 1 FROM public.notification_targets nt
              WHERE nt.notification_id = n.id
              AND nt.school_id = v_school_id
          )
      )
      AND NOT EXISTS (
          SELECT 1 FROM public.notification_reads nr
          WHERE nr.notification_id = n.id
          AND nr.user_id = v_user_id
      );

    -- Fetch paginated list
    WITH list AS (
        SELECT
            n.id,
            n.title,
            n.message,
            n.notification_type,
            n.created_at,
            n.published_at,
            (nr.read_at IS NOT NULL) AS is_read,
            nr.read_at
        FROM public.notifications n
        LEFT JOIN public.notification_reads nr
            ON nr.notification_id = n.id AND nr.user_id = v_user_id
        WHERE n.status = 'published'
          AND (n.published_at <= now() OR n.published_at IS NULL)
          AND (
              n.target_type = 'all_schools'
              OR EXISTS (
                  SELECT 1 FROM public.notification_targets nt
                  WHERE nt.notification_id = n.id
                  AND nt.school_id = v_school_id
              )
          )
        ORDER BY COALESCE(n.published_at, n.created_at) DESC
        LIMIT p_page_size
        OFFSET v_offset
    )
    SELECT COALESCE(json_agg(row_to_json(l)), '[]'::JSON)
    INTO v_items
    FROM list l;

    RETURN json_build_object(
        'notifications', v_items,
        'totalCount', v_total_count,
        'unreadCount', v_unread_count,
        'page', p_page,
        'pageSize', p_page_size
    );
END;
$$;

-- 13. RPC: school_mark_notification_read
CREATE OR REPLACE FUNCTION public.school_mark_notification_read(
    p_notification_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_user_id UUID;
    v_school_id UUID;
    v_valid BOOLEAN;
BEGIN
    IF public.get_my_role() != 'school_admin' THEN
        RAISE EXCEPTION 'Access denied. Only School Admins can mark notifications as read.';
    END IF;

    v_user_id := auth.uid();
    v_school_id := public.get_my_school_id();

    -- Verify notification is visible to this school
    SELECT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.id = p_notification_id
          AND n.status = 'published'
          AND (n.published_at <= now() OR n.published_at IS NULL)
          AND (
              n.target_type = 'all_schools'
              OR EXISTS (
                  SELECT 1 FROM public.notification_targets nt
                  WHERE nt.notification_id = n.id
                  AND nt.school_id = v_school_id
              )
          )
    ) INTO v_valid;

    IF NOT v_valid THEN
        RAISE EXCEPTION 'Notification not found or not accessible.';
    END IF;

    -- Upsert read record
    INSERT INTO public.notification_reads (notification_id, user_id, read_at)
    VALUES (p_notification_id, v_user_id, now())
    ON CONFLICT (notification_id, user_id)
    DO UPDATE SET read_at = now();

    RETURN json_build_object('success', TRUE, 'notification_id', p_notification_id);
END;
$$;

-- 14. RPC: school_mark_all_notifications_read
CREATE OR REPLACE FUNCTION public.school_mark_all_notifications_read()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_user_id UUID;
    v_school_id UUID;
BEGIN
    IF public.get_my_role() != 'school_admin' THEN
        RAISE EXCEPTION 'Access denied. Only School Admins can mark notifications as read.';
    END IF;

    v_user_id := auth.uid();
    v_school_id := public.get_my_school_id();

    -- Insert reads for all visible unread published notifications
    INSERT INTO public.notification_reads (notification_id, user_id, read_at)
    SELECT n.id, v_user_id, now()
    FROM public.notifications n
    WHERE n.status = 'published'
      AND (n.published_at <= now() OR n.published_at IS NULL)
      AND (
          n.target_type = 'all_schools'
          OR EXISTS (
              SELECT 1 FROM public.notification_targets nt
              WHERE nt.notification_id = n.id
              AND nt.school_id = v_school_id
          )
      )
      AND NOT EXISTS (
          SELECT 1 FROM public.notification_reads nr
          WHERE nr.notification_id = n.id
          AND nr.user_id = v_user_id
      )
    ON CONFLICT (notification_id, user_id) DO NOTHING;

    RETURN json_build_object('success', TRUE);
END;
$$;

-- Privileges
REVOKE ALL ON FUNCTION public.admin_get_notifications FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_notifications TO authenticated;

REVOKE ALL ON FUNCTION public.school_get_notifications FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.school_get_notifications TO authenticated;

REVOKE ALL ON FUNCTION public.school_mark_notification_read FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.school_mark_notification_read TO authenticated;

REVOKE ALL ON FUNCTION public.school_mark_all_notifications_read FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.school_mark_all_notifications_read TO authenticated;
