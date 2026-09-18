-- 20260917000002_atomic_items_save.sql
-- Add atomic item persistence to save_uniform_configuration RPC

BEGIN;

CREATE OR REPLACE FUNCTION public.save_uniform_configuration(
    p_school_id UUID,
    p_gender TEXT,
    p_target_classes TEXT[],
    p_config_id UUID DEFAULT NULL,
    p_items JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_role TEXT;
    v_locked BOOLEAN;
    v_overlap_class TEXT;
    v_final_config_id UUID;
    _lock_key BIGINT;
BEGIN
    -- 1. Validate Admin
    v_role := public.get_my_role();
    IF v_role != 'evenvibe_admin' THEN
        RAISE EXCEPTION 'Unauthorized: Only EvenVive Admin can save configurations.';
    END IF;

    -- 2. Acquire Advisory Transaction Lock
    _lock_key := abs(hashtext(p_school_id::text)::bigint);
    PERFORM pg_advisory_xact_lock(_lock_key);

    -- 3. Check Overlaps
    SELECT cc.class_name INTO v_overlap_class
    FROM public.school_uniform_configurations c
    JOIN public.school_uniform_configuration_classes cc ON c.id = cc.configuration_id
    WHERE c.school_id = p_school_id
      AND c.gender = p_gender
      AND c.is_active = true
      AND (p_config_id IS NULL OR c.id != p_config_id)
      AND cc.class_name = ANY(p_target_classes)
    LIMIT 1;

    IF v_overlap_class IS NOT NULL THEN
        RAISE EXCEPTION 'Configuration conflict: Class "%" is already assigned to another active configuration for % students.', v_overlap_class, p_gender;
    END IF;

    -- 4. Create or Update Configuration
    IF p_config_id IS NULL THEN
        INSERT INTO public.school_uniform_configurations (school_id, gender, is_active)
        VALUES (p_school_id, p_gender, true)
        RETURNING id INTO v_final_config_id;
    ELSE
        UPDATE public.school_uniform_configurations
        SET updated_at = timezone('utc'::text, now())
        WHERE id = p_config_id
        RETURNING id INTO v_final_config_id;
        
        IF v_final_config_id IS NULL THEN
             RAISE EXCEPTION 'Configuration not found';
        END IF;
    END IF;

    -- 5. Sync Class Mappings
    DELETE FROM public.school_uniform_configuration_classes
    WHERE configuration_id = v_final_config_id
      AND NOT (class_name = ANY(p_target_classes));

    INSERT INTO public.school_uniform_configuration_classes (configuration_id, class_name)
    SELECT v_final_config_id, unnest(p_target_classes)
    ON CONFLICT (configuration_id, class_name) DO NOTHING;

    -- 6. Sync Items atomically if provided
    IF p_items IS NOT NULL THEN
        -- Soft-delete existing items not in this incoming list
        UPDATE public.school_uniform_configuration_items
        SET is_active = false, updated_at = timezone('utc'::text, now())
        WHERE configuration_id = v_final_config_id
          AND is_active = true
          AND id NOT IN (
              SELECT (item->>'id')::UUID
              FROM jsonb_array_elements(p_items) AS item
              WHERE item->>'id' IS NOT NULL
          );

        -- Upsert items
        INSERT INTO public.school_uniform_configuration_items (
            id, configuration_id, item_name, available_sizes, is_required, sort_order, is_active
        )
        SELECT 
            COALESCE((item->>'id')::UUID, gen_random_uuid()),
            v_final_config_id,
            item->>'item_name',
            ARRAY(SELECT jsonb_array_elements_text(item->'available_sizes')),
            (item->>'is_required')::BOOLEAN,
            (item->>'sort_order')::INTEGER,
            true
        FROM jsonb_array_elements(p_items) AS item
        ON CONFLICT (id) DO UPDATE SET
            item_name = EXCLUDED.item_name,
            available_sizes = EXCLUDED.available_sizes,
            is_required = EXCLUDED.is_required,
            sort_order = EXCLUDED.sort_order,
            is_active = true,
            updated_at = timezone('utc'::text, now());
    END IF;

    RETURN v_final_config_id;
END;
$$;

COMMIT;
