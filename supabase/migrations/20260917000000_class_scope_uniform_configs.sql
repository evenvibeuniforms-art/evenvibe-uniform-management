-- 20260917000000_class_scope_uniform_configs.sql
-- Phase 7: Add class scope to uniform configurations

BEGIN;

-- 1. Add is_active to configuration items for soft deletion
ALTER TABLE public.school_uniform_configuration_items
ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- 2. Create the junction table for class mappings
CREATE TABLE IF NOT EXISTS public.school_uniform_configuration_classes (
    configuration_id UUID NOT NULL REFERENCES public.school_uniform_configurations(id) ON DELETE CASCADE,
    class_name TEXT NOT NULL,
    UNIQUE(configuration_id, class_name)
);

-- Setup RLS on junction table
ALTER TABLE public.school_uniform_configuration_classes ENABLE ROW LEVEL SECURITY;

-- EvenVibe Admin gets full access
CREATE POLICY "Admin full access config classes" 
ON public.school_uniform_configuration_classes FOR ALL 
USING (public.get_my_role() = 'evenvibe_admin'::app_role) 
WITH CHECK (public.get_my_role() = 'evenvibe_admin'::app_role);

-- School Admin gets SELECT access to their own school's classes
CREATE POLICY "School admin select own config classes" 
ON public.school_uniform_configuration_classes FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM public.school_uniform_configurations c
        WHERE c.id = configuration_id 
        AND c.school_id = public.get_my_school_id()
    )
);

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_uniform_config_classes_id ON public.school_uniform_configuration_classes(configuration_id);

-- 3. Migration pre-checks and deterministic backfill
DO $$
DECLARE
    dup_record RECORD;
BEGIN
    -- Check for any pre-existing duplicate configurations (school_id + gender)
    -- This shouldn't exist due to the old UNIQUE(school_id, gender) constraint, but we check to be safe.
    FOR dup_record IN
        SELECT school_id, gender, count(*) 
        FROM public.school_uniform_configurations 
        WHERE is_active = true
        GROUP BY school_id, gender 
        HAVING count(*) > 1
    LOOP
        RAISE EXCEPTION 'MIGRATION ABORTED: Duplicate active configurations found for school_id % and gender %', dup_record.school_id, dup_record.gender;
    END LOOP;

    -- Backfill: Map existing legacy configurations to current students' classes
    INSERT INTO public.school_uniform_configuration_classes (configuration_id, class_name)
    SELECT DISTINCT c.id, s.class_name
    FROM public.school_uniform_configurations c
    JOIN public.students s ON s.school_id = c.school_id AND s.gender = c.gender
    WHERE c.is_active = true 
      AND s.class_name IS NOT NULL
      AND s.class_name != ''
    ON CONFLICT DO NOTHING;
END $$;

-- 4. Safe constraint replacements
-- Only drop the old constraint if the backfill succeeded without throwing an error
ALTER TABLE public.school_uniform_configurations
DROP CONSTRAINT IF EXISTS school_uniform_configurations_school_id_gender_key;

-- 5. Create transaction-safe save RPC
CREATE OR REPLACE FUNCTION public.save_uniform_configuration(
    p_school_id UUID,
    p_gender TEXT,
    p_target_classes TEXT[],
    p_config_id UUID DEFAULT NULL
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
    -- We derive a BIGINT lock key from the UUID. 
    -- We use a simple hash of the UUID cast to bigint, modulo the max bigint to stay within range.
    -- Ensure deterministic positive lock key using hashtext
    _lock_key := abs(hashtext(p_school_id::text)::bigint);
    
    -- pg_advisory_xact_lock acquires an exclusive lock that is automatically released at transaction end
    PERFORM pg_advisory_xact_lock(_lock_key);

    -- 3. Check Overlaps
    -- Are any of the target classes already mapped to ANOTHER active configuration for the same school+gender?
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
    -- First delete any classes that are no longer in the target list
    DELETE FROM public.school_uniform_configuration_classes
    WHERE configuration_id = v_final_config_id
      AND NOT (class_name = ANY(p_target_classes));

    -- Then insert any classes that are new
    INSERT INTO public.school_uniform_configuration_classes (configuration_id, class_name)
    SELECT v_final_config_id, unnest(p_target_classes)
    ON CONFLICT (configuration_id, class_name) DO NOTHING;

    RETURN v_final_config_id;
END;
$$;

-- 6. Update submit_requirement RPC to support class-scope and historical item resolution
CREATE OR REPLACE FUNCTION public.submit_requirement()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
    v_profile_id UUID;
    v_role TEXT;
    v_school_id UUID;
    v_school_active BOOLEAN;
    v_req_id UUID;
    v_req_number TEXT;
    v_total_students INTEGER;
    v_pending_students INTEGER;
    v_regular_students INTEGER;
    v_tshirt_students INTEGER;
    v_order_id UUID;
    v_order_number TEXT;
    
    v_active_req_count INTEGER;
    
    v_expected_items INTEGER;
    v_valid_items INTEGER;
    v_inserted_items INTEGER;
BEGIN
    -- 1. Authentication and Authorization
    v_profile_id := auth.uid();
    IF v_profile_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT role, school_id INTO v_role, v_school_id
    FROM public.profiles
    WHERE id = v_profile_id;

    IF v_role != 'school_admin' OR v_school_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Must be a school admin';
    END IF;

    -- Check if school is active
    SELECT is_active INTO v_school_active
    FROM public.schools
    WHERE id = v_school_id;

    IF v_school_active IS NOT TRUE THEN
        RAISE EXCEPTION 'Unauthorized: School is not active';
    END IF;

    -- 2. Check for existing active requirements
    SELECT count(*) INTO v_active_req_count
    FROM public.requirements
    WHERE school_id = v_school_id AND status IN ('submitted', 'under_review', 'confirmed');

    IF v_active_req_count > 0 THEN
        RAISE EXCEPTION 'An active requirement has already been submitted for this school.';
    END IF;

    -- 3. Verify students and completeness
    SELECT count(*) INTO v_total_students
    FROM public.students
    WHERE school_id = v_school_id;

    IF v_total_students = 0 THEN
        RAISE EXCEPTION 'No students found for this school.';
    END IF;

    -- 3a. Verify pending students (missing size record, incomplete, or missing a required configuration item)
    SELECT count(s.id) INTO v_pending_students
    FROM public.students s
    LEFT JOIN public.student_uniform_sizes sus ON s.id = sus.student_id
    WHERE s.school_id = v_school_id 
      AND (
          sus.id IS NULL 
          OR sus.is_complete = false
          OR EXISTS (
              SELECT 1
              FROM public.school_uniform_configurations c
              JOIN public.school_uniform_configuration_classes cc ON cc.configuration_id = c.id
              JOIN public.school_uniform_configuration_items ci ON ci.configuration_id = c.id
              WHERE c.school_id = v_school_id
                AND c.is_active = true
                AND cc.class_name = s.class_name
                AND c.gender = s.gender
                AND ci.is_active = true
                AND ci.is_required = true
                AND (sus.dynamic_sizes IS NULL OR NOT (sus.dynamic_sizes ? ci.id::text) OR (sus.dynamic_sizes->>ci.id::text) = '')
          )
      );

    IF v_pending_students > 0 THEN
        RAISE EXCEPTION 'Cannot submit: % students have incomplete sizes or are missing required uniform items.', v_pending_students;
    END IF;

    -- 3b. Verify no orphaned, invalid, or cross-school UUIDs in dynamic_sizes
    SELECT count(*)
    INTO v_expected_items
    FROM public.students s
    JOIN public.student_uniform_sizes sus ON s.id = sus.student_id
    JOIN LATERAL jsonb_each_text(sus.dynamic_sizes) d(key, value) ON true
    WHERE s.school_id = v_school_id
      AND d.value IS NOT NULL 
      AND d.value != '';

    IF v_expected_items = 0 THEN
        RAISE EXCEPTION 'Cannot submit: No dynamic sizes found (legacy sizing data is not supported for dynamic submission).';
    END IF;

    -- 3c. Ensure all UUIDs in dynamic_sizes belong to this school (they don't need to be currently active)
    SELECT count(*)
    INTO v_valid_items
    FROM public.students s
    JOIN public.student_uniform_sizes sus ON s.id = sus.student_id
    JOIN LATERAL jsonb_each_text(sus.dynamic_sizes) d(key, value) ON true
    JOIN public.school_uniform_configuration_items ci ON ci.id::text = d.key
    JOIN public.school_uniform_configurations c ON c.id = ci.configuration_id
    WHERE s.school_id = v_school_id
      AND c.school_id = v_school_id
      AND d.value IS NOT NULL 
      AND d.value != ''
      AND d.value = ANY(ci.available_sizes);
      
    IF v_valid_items < v_expected_items THEN
        RAISE EXCEPTION 'Cannot submit: Found % orphaned/invalid sizes. Please update student sizes to match the active configuration.', (v_expected_items - v_valid_items);
    END IF;

    -- Calculate regular and tshirt counts from student_uniform_sizes
    SELECT 
        COUNT(s.id) FILTER (WHERE sus.uniform_type = 'regular'),
        COUNT(s.id) FILTER (WHERE sus.uniform_type = 'tshirt')
    INTO v_regular_students, v_tshirt_students
    FROM public.students s
    JOIN public.student_uniform_sizes sus ON s.id = sus.student_id
    WHERE s.school_id = v_school_id;

    -- 4. Create Requirement Record
    v_req_number := 'EV-REQ-' || to_char(now(), 'YYYY') || '-' || upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 6));

    INSERT INTO public.requirements (
        school_id, requirement_number, status, total_students, 
        regular_uniform_students, tshirt_uniform_students, submitted_at
    ) VALUES (
        v_school_id, v_req_number, 'submitted', v_total_students, 
        COALESCE(v_regular_students, 0), COALESCE(v_tshirt_students, 0), now()
    ) RETURNING id INTO v_req_id;

    -- 5. Insert Requirement Items Dynamically
    INSERT INTO public.requirement_items (requirement_id, gender, item_name, size, quantity)
    SELECT 
        v_req_id,
        c.gender,
        ci.item_name,
        d.value AS size,
        count(*) AS quantity
    FROM public.students s
    JOIN public.student_uniform_sizes sus ON s.id = sus.student_id
    JOIN LATERAL jsonb_each_text(sus.dynamic_sizes) d(key, value) ON true
    JOIN public.school_uniform_configuration_items ci ON ci.id::text = d.key
    JOIN public.school_uniform_configurations c ON c.id = ci.configuration_id
    WHERE s.school_id = v_school_id
      AND d.value IS NOT NULL
      AND d.value != ''
    GROUP BY c.gender, ci.item_name, d.value;

    GET DIAGNOSTICS v_inserted_items = ROW_COUNT;
    IF v_inserted_items = 0 THEN
        RAISE EXCEPTION 'Cannot submit: Aggregation produced 0 valid items. Verify student size data.';
    END IF;

    -- 6. Create Order Record
    v_order_number := 'EV-ORD-' || to_char(now(), 'YYYY') || '-' || upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 6));

    INSERT INTO public.orders (
        school_id, requirement_id, order_number, status, created_at
    ) VALUES (
        v_school_id, v_req_id, v_order_number, 'submitted', now()
    ) RETURNING id INTO v_order_id;

    -- 7. Insert Initial Order Status History
    INSERT INTO public.order_status_history (
        order_id, status, note, created_at
    ) VALUES (
        v_order_id, 'submitted', 'Requirement submitted successfully', now()
    );

    RETURN json_build_object(
        'success', true,
        'requirement_id', v_req_id,
        'requirement_number', v_req_number,
        'order_id', v_order_id,
        'order_number', v_order_number
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object(
            'success', false,
            'error', SQLERRM
        );
END;
$func$;

COMMIT;
