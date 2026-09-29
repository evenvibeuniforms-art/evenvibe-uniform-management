-- Migration: 20261002000000_uniform_style_master_authoritative.sql
-- Description: Uniform Style Master as the Single Source of Truth + Available Sizes + Required/Optional + Safe Legacy Migration

BEGIN;

-- 1. Add available_sizes, is_required, sort_order, and description to uniform_styles
ALTER TABLE public.uniform_styles
    ADD COLUMN IF NOT EXISTS available_sizes TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS is_required BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS description TEXT;

-- 2. Update unique index to allow distinguishing between genders (e.g. Male Shirt vs Female Shirt)
DROP INDEX IF EXISTS public.idx_uniform_styles_school_item_name;
CREATE UNIQUE INDEX IF NOT EXISTS idx_uniform_styles_school_item_gender_style 
    ON public.uniform_styles (
        school_id, 
        LOWER(TRIM(item_name)), 
        COALESCE(gender, 'All'), 
        LOWER(TRIM(style_name))
    );

-- 3. Idempotent Data Migration of existing active school_uniform_configurations into uniform_styles
-- Creates 'Legacy Style' for schools that had active configurations so they continue working seamlessly.
DO $$
DECLARE
    cfg_record RECORD;
    item_record RECORD;
    class_record RECORD;
    v_style_id UUID;
    v_existing_id UUID;
BEGIN
    -- Iterate through each active uniform configuration
    FOR cfg_record IN 
        SELECT id, school_id, gender 
        FROM public.school_uniform_configurations 
        WHERE is_active = true
    LOOP
        -- Iterate through each active item in this configuration
        FOR item_record IN 
            SELECT id, item_name, available_sizes, is_required, sort_order 
            FROM public.school_uniform_configuration_items 
            WHERE configuration_id = cfg_record.id 
              AND (is_active IS NULL OR is_active = true)
        LOOP
            -- Check if a style for this school, item, gender, and 'Legacy Style' already exists
            SELECT id INTO v_existing_id
            FROM public.uniform_styles
            WHERE school_id = cfg_record.school_id
              AND LOWER(TRIM(item_name)) = LOWER(TRIM(item_record.item_name))
              AND COALESCE(gender, 'All') = COALESCE(cfg_record.gender, 'All')
              AND LOWER(TRIM(style_name)) = 'legacy style'
            LIMIT 1;

            IF v_existing_id IS NULL THEN
                -- Insert the new Legacy Style record
                INSERT INTO public.uniform_styles (
                    school_id,
                    style_name,
                    item_name,
                    gender,
                    is_active,
                    available_sizes,
                    is_required,
                    sort_order,
                    description
                ) VALUES (
                    cfg_record.school_id,
                    'Legacy Style',
                    TRIM(item_record.item_name),
                    COALESCE(cfg_record.gender, 'All'),
                    true,
                    COALESCE(item_record.available_sizes, '{}'),
                    COALESCE(item_record.is_required, true),
                    COALESCE(item_record.sort_order, 0),
                    'Migrated from legacy uniform configuration'
                ) RETURNING id INTO v_style_id;

                -- Link applicable classes to uniform_style_classes
                FOR class_record IN 
                    SELECT class_name 
                    FROM public.school_uniform_configuration_classes 
                    WHERE configuration_id = cfg_record.id
                LOOP
                    INSERT INTO public.uniform_style_classes (
                        style_id,
                        class_name
                    ) VALUES (
                        v_style_id,
                        TRIM(class_record.class_name)
                    ) ON CONFLICT (style_id, class_name) DO NOTHING;
                END LOOP;
            ELSE
                -- Record already exists; ensure classes from this config are linked
                FOR class_record IN 
                    SELECT class_name 
                    FROM public.school_uniform_configuration_classes 
                    WHERE configuration_id = cfg_record.id
                LOOP
                    INSERT INTO public.uniform_style_classes (
                        style_id,
                        class_name
                    ) VALUES (
                        v_existing_id,
                        TRIM(class_record.class_name)
                    ) ON CONFLICT (style_id, class_name) DO NOTHING;
                END LOOP;
            END IF;
        END LOOP;
    END LOOP;
END $$;

COMMIT;
