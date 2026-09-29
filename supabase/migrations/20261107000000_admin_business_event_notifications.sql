-- Migration: 20261107000000_admin_business_event_notifications.sql
-- Description: Automatic Admin business event notifications for TC Students, Orders, and Alteration Requests.

-- 1. Update target_type check constraint to include 'admin'
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_target_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_target_type_check 
    CHECK (target_type IN ('all_schools', 'selected_schools', 'admin'));

-- 2. Update notification_type check constraint to include 'tc_student' and 'alteration'
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_notification_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_notification_type_check 
    CHECK (notification_type IN ('announcement', 'order', 'production', 'quality_check', 'packing', 'delivery', 'system', 'tc_student', 'alteration'));

-- 3. Add event-specific metadata columns to notifications table
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS event_type TEXT;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS link TEXT;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS school_id UUID REFERENCES public.schools(id) ON DELETE SET NULL;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS entity_id TEXT;

-- 4. Unique index on idempotency_key for server-authoritative duplicate protection
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_idempotency_key 
    ON public.notifications(idempotency_key) 
    WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_event_type ON public.notifications(event_type);
CREATE INDEX IF NOT EXISTS idx_notifications_target_admin ON public.notifications(target_type) WHERE target_type = 'admin';

-- 5. Ensure EvenVibe Admin can insert and update notification_reads
DROP POLICY IF EXISTS admin_notification_reads_select ON public.notification_reads;
DROP POLICY IF EXISTS admin_notification_reads_all ON public.notification_reads;
CREATE POLICY admin_notification_reads_all
    ON public.notification_reads
    FOR ALL
    USING (public.get_my_role() = 'evenvibe_admin')
    WITH CHECK (public.get_my_role() = 'evenvibe_admin');

-- 6. RPC: create_admin_business_notification
-- Atomically inserts an admin business event notification with server-side duplicate protection
CREATE OR REPLACE FUNCTION public.create_admin_business_notification(
    p_event_type TEXT,
    p_title TEXT,
    p_message TEXT,
    p_link TEXT,
    p_metadata JSONB DEFAULT '{}'::jsonb,
    p_idempotency_key TEXT DEFAULT NULL,
    p_school_id UUID DEFAULT NULL,
    p_entity_id TEXT DEFAULT NULL,
    p_notification_type TEXT DEFAULT 'system'
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_notif_id UUID;
    v_clean_key TEXT := NULLIF(TRIM(p_idempotency_key), '');
BEGIN
    -- Idempotency check: if key already exists, return existing record
    IF v_clean_key IS NOT NULL THEN
        SELECT id INTO v_notif_id
        FROM public.notifications
        WHERE idempotency_key = v_clean_key;

        IF v_notif_id IS NOT NULL THEN
            RETURN json_build_object(
                'success', true,
                'id', v_notif_id,
                'is_duplicate', true
            );
        END IF;
    END IF;

    -- Insert authoritative notification for Admin
    INSERT INTO public.notifications (
        title,
        message,
        notification_type,
        status,
        target_type,
        published_at,
        created_at,
        event_type,
        link,
        metadata,
        idempotency_key,
        school_id,
        entity_id
    ) VALUES (
        p_title,
        p_message,
        p_notification_type,
        'published',
        'admin',
        now(),
        now(),
        p_event_type,
        p_link,
        COALESCE(p_metadata, '{}'::jsonb),
        v_clean_key,
        p_school_id,
        p_entity_id
    )
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id INTO v_notif_id;

    -- If a conflict occurred during concurrent insert, return existing ID
    IF v_notif_id IS NULL AND v_clean_key IS NOT NULL THEN
        SELECT id INTO v_notif_id
        FROM public.notifications
        WHERE idempotency_key = v_clean_key;

        RETURN json_build_object(
            'success', true,
            'id', v_notif_id,
            'is_duplicate', true
        );
    END IF;

    RETURN json_build_object(
        'success', true,
        'id', v_notif_id,
        'is_duplicate', false
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_admin_business_notification TO authenticated, service_role;

-- 7. RPC: admin_get_business_notifications
-- Fast retrieval of Admin business event notifications with unread count
CREATE OR REPLACE FUNCTION public.admin_get_business_notifications(
    p_limit INT DEFAULT 20
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_admin_id UUID := auth.uid();
    v_unread_count INT;
    v_items JSON;
BEGIN
    IF public.get_my_role() != 'evenvibe_admin' THEN
        RAISE EXCEPTION 'Access denied. Only EvenVibe Admins can access admin notifications.';
    END IF;

    -- Unread count for current admin user
    SELECT COUNT(*)
    INTO v_unread_count
    FROM public.notifications n
    WHERE n.target_type = 'admin'
      AND n.status = 'published'
      AND NOT EXISTS (
          SELECT 1 FROM public.notification_reads nr
          WHERE nr.notification_id = n.id
            AND nr.user_id = v_admin_id
      );

    -- Fetch recent notifications
    WITH list AS (
        SELECT
            n.id,
            n.title,
            n.message,
            n.notification_type,
            n.event_type,
            n.link,
            n.metadata,
            n.created_at,
            (nr.read_at IS NOT NULL) AS is_read,
            nr.read_at
        FROM public.notifications n
        LEFT JOIN public.notification_reads nr
            ON nr.notification_id = n.id AND nr.user_id = v_admin_id
        WHERE n.target_type = 'admin'
          AND n.status = 'published'
        ORDER BY n.created_at DESC
        LIMIT p_limit
    )
    SELECT COALESCE(json_agg(row_to_json(l)), '[]'::JSON)
    INTO v_items
    FROM list l;

    RETURN json_build_object(
        'notifications', v_items,
        'unreadCount', COALESCE(v_unread_count, 0)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_business_notifications TO authenticated, service_role;

-- 8. RPC: admin_mark_business_notification_read
CREATE OR REPLACE FUNCTION public.admin_mark_business_notification_read(
    p_notification_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_admin_id UUID := auth.uid();
BEGIN
    IF public.get_my_role() != 'evenvibe_admin' THEN
        RAISE EXCEPTION 'Access denied. Only EvenVibe Admins can mark notifications as read.';
    END IF;

    INSERT INTO public.notification_reads (notification_id, user_id, read_at)
    VALUES (p_notification_id, v_admin_id, now())
    ON CONFLICT (notification_id, user_id)
    DO UPDATE SET read_at = now();

    RETURN json_build_object('success', true, 'notification_id', p_notification_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_mark_business_notification_read TO authenticated, service_role;

-- 9. RPC: admin_mark_all_business_notifications_read
CREATE OR REPLACE FUNCTION public.admin_mark_all_business_notifications_read()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_admin_id UUID := auth.uid();
BEGIN
    IF public.get_my_role() != 'evenvibe_admin' THEN
        RAISE EXCEPTION 'Access denied. Only EvenVibe Admins can mark notifications as read.';
    END IF;

    INSERT INTO public.notification_reads (notification_id, user_id, read_at)
    SELECT n.id, v_admin_id, now()
    FROM public.notifications n
    WHERE n.target_type = 'admin'
      AND n.status = 'published'
      AND NOT EXISTS (
          SELECT 1 FROM public.notification_reads nr
          WHERE nr.notification_id = n.id
            AND nr.user_id = v_admin_id
      )
    ON CONFLICT (notification_id, user_id) DO NOTHING;

    RETURN json_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_mark_all_business_notifications_read TO authenticated, service_role;
