-- 20260917191502_deactivate_uniform_config.sql
-- Add RPC for deactivating uniform configurations safely

BEGIN;

CREATE OR REPLACE FUNCTION public.deactivate_uniform_configuration(
    p_config_id UUID,
    p_school_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role TEXT;
    v_school_id UUID;
    v_is_active BOOLEAN;
BEGIN
    -- 1. Validate Admin Role
    v_role := public.get_my_role();
    IF v_role != 'evenvibe_admin' THEN
        RAISE EXCEPTION 'Unauthorized: Only EvenVibe Admin can deactivate configurations.';
    END IF;

    -- 2. Verify config exists and belongs to the requested school
    SELECT school_id, is_active INTO v_school_id, v_is_active
    FROM public.school_uniform_configurations
    WHERE id = p_config_id;

    IF v_school_id IS NULL THEN
        RAISE EXCEPTION 'Configuration not found.';
    END IF;

    IF v_school_id != p_school_id THEN
        RAISE EXCEPTION 'Unauthorized: Configuration does not belong to this school.';
    END IF;

    -- 3. Check if already inactive
    IF NOT v_is_active THEN
        RETURN;
    END IF;

    -- 4. Update the configuration to inactive
    UPDATE public.school_uniform_configurations
    SET is_active = false,
        updated_at = timezone('utc'::text, now())
    WHERE id = p_config_id
      AND school_id = p_school_id;

END;
$$;

COMMIT;
