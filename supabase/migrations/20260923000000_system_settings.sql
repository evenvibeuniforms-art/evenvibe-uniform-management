-- Migration: System Settings & Configuration
-- Phase 15: Centralized settings store for EvenVive Admin

-- 1. Create system_settings table
CREATE TABLE IF NOT EXISTS public.system_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    setting_key TEXT NOT NULL UNIQUE,
    setting_value JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Trigger for updated_at
DROP TRIGGER IF EXISTS set_system_settings_updated_at ON public.system_settings;
CREATE TRIGGER set_system_settings_updated_at
    BEFORE UPDATE ON public.system_settings
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- 3. Enable RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies: Only evenvibe_admin has access
CREATE POLICY admin_system_settings_all
    ON public.system_settings
    FOR ALL
    USING (public.get_my_role() = 'evenvibe_admin')
    WITH CHECK (public.get_my_role() = 'evenvibe_admin');

-- 5. Grants: Authenticated only, no anon access
GRANT SELECT, INSERT, UPDATE ON public.system_settings TO authenticated;
REVOKE ALL ON public.system_settings FROM anon;

-- 6. Seed initial standard configuration if not present
INSERT INTO public.system_settings (setting_key, setting_value)
VALUES
    (
        'company_info',
        jsonb_build_object(
            'companyName', 'EvenVive Uniforms',
            'website', 'https://evenvibeuniforms.art',
            'email', 'contact@evenvibeuniforms.art',
            'phone', '+91 98765 43210',
            'address', '123 Industrial Estate, Guindy',
            'city', 'Chennai',
            'state', 'Tamil Nadu',
            'pincode', '600032'
        )
    ),
    (
        'notification_preferences',
        jsonb_build_object(
            'enableInAppNotifications', true,
            'defaultBroadcastVisibility', true,
            'allowSchoolAdminUnreadBadge', true,
            'notificationRetentionDays', 90
        )
    ),
    (
        'system_preferences',
        jsonb_build_object(
            'defaultPageSize', 10,
            'dateFormat', 'DD/MM/YYYY',
            'timezone', 'Asia/Kolkata',
            'enableAutoRefresh', false
        )
    )
ON CONFLICT (setting_key) DO NOTHING;
