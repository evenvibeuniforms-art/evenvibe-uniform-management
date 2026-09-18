-- Step 1: Add admission_number if it does not exist
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS admission_number TEXT;

-- Step 2: Audit existing data
DO $$ 
DECLARE
    v_null_count INT;
    v_duplicate_count INT;
BEGIN
    SELECT count(*) INTO v_null_count
    FROM public.students
    WHERE admission_number IS NULL OR trim(admission_number) = '';

    IF v_null_count > 0 THEN
        RAISE NOTICE 'AUDIT FAILED: Found % students with NULL or empty admission_number. Please resolve them first.', v_null_count;
        RETURN;
    END IF;

    SELECT count(*) INTO v_duplicate_count
    FROM (
        SELECT school_id, trim(admission_number)
        FROM public.students
        GROUP BY school_id, trim(admission_number)
        HAVING count(*) > 1
    ) dupes;

    IF v_duplicate_count > 0 THEN
        RAISE NOTICE 'AUDIT FAILED: Found % duplicate admission numbers within schools.', v_duplicate_count;
        RETURN;
    END IF;

    -- If the existing data is clean, enforce constraints
    UPDATE public.students SET admission_number = trim(admission_number);
    ALTER TABLE public.students ALTER COLUMN admission_number SET NOT NULL;
    
    ALTER TABLE public.students DROP CONSTRAINT IF EXISTS unique_school_admission_number;
    ALTER TABLE public.students ADD CONSTRAINT unique_school_admission_number UNIQUE (school_id, admission_number);
    
    -- Clean up legacy columns since we successfully migrated
    ALTER TABLE public.students DROP CONSTRAINT IF EXISTS unique_school_class_section_roll;
    DROP INDEX IF EXISTS unique_school_class_section_roll;
    ALTER TABLE public.students DROP COLUMN IF EXISTS roll_number;
    ALTER TABLE public.students DROP COLUMN IF EXISTS date_of_birth;
    
    RAISE NOTICE 'AUDIT PASSED: Successfully enforced admission_number constraints and removed legacy columns.';
END $$;
