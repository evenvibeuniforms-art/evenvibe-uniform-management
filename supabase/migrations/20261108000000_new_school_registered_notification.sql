-- Migration: 20261108000000_new_school_registered_notification.sql
-- Description: Automatic Admin notification for NEW_SCHOOL_REGISTERED events.

-- 1. Ensure notification_type check constraint includes 'school'
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_notification_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_notification_type_check 
    CHECK (notification_type IN ('announcement', 'order', 'production', 'quality_check', 'packing', 'delivery', 'system', 'tc_student', 'alteration', 'school'));

-- 2. Trigger function to automatically create Admin notification on new school insertion
CREATE OR REPLACE FUNCTION public.handle_new_school_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
    PERFORM public.create_admin_business_notification(
        'NEW_SCHOOL_REGISTERED',
        'New School Registered',
        'New school ' || NEW.name || ' has been registered.',
        '/admin/schools',
        jsonb_build_object(
            'school_id', NEW.id,
            'school_name', NEW.name,
            'school_code', NEW.school_code,
            'city', NEW.city,
            'event_type', 'NEW_SCHOOL_REGISTERED',
            'created_at', now()
        ),
        'NEW_SCHOOL_REGISTERED_' || NEW.id::text,
        NEW.id,
        NEW.id::text,
        'system'
    );
    RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.handle_new_school_notification() TO authenticated, service_role;

-- 3. Create AFTER INSERT trigger on public.schools
DROP TRIGGER IF EXISTS trigger_notify_admin_on_new_school ON public.schools;
CREATE TRIGGER trigger_notify_admin_on_new_school
    AFTER INSERT ON public.schools
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_school_notification();
