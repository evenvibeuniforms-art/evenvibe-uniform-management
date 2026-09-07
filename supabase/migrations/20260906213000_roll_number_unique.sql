-- Migration: Remove admission_number unique constraint and add new composite constraint
-- This script also enforces NOT NULL for section and roll_number.
-- It verifies data integrity before altering schema.

DO $$ 
DECLARE 
    duplicate_record RECORD;
    null_record RECORD;
    error_message TEXT := 'Data Integrity Conflicts Found:';
    has_error BOOLEAN := false;
BEGIN
    -- 1. Check for NULL or empty section / roll_number
    FOR null_record IN 
        SELECT id, school_id, student_name, section, roll_number 
        FROM public.students 
        WHERE section IS NULL OR trim(section) = '' 
           OR roll_number IS NULL OR trim(roll_number) = ''
    LOOP
        has_error := true;
        error_message := error_message || chr(10) || 
            'Student missing section/roll: ID=' || null_record.id || 
            ', Name="' || null_record.student_name || '"' ||
            ', Section="' || COALESCE(null_record.section, 'NULL') || '"' ||
            ', Roll="' || COALESCE(null_record.roll_number, 'NULL') || '"';
    END LOOP;

    -- 2. Check for duplicate combinations
    FOR duplicate_record IN 
        SELECT school_id, class_name, upper(trim(section)) as norm_section, trim(roll_number) as norm_roll, COUNT(*) as cnt
        FROM public.students
        GROUP BY school_id, class_name, upper(trim(section)), trim(roll_number)
        HAVING COUNT(*) > 1
    LOOP
        has_error := true;
        error_message := error_message || chr(10) || 
            'Duplicate Combination Found (' || duplicate_record.cnt || ' students): ' ||
            'School=' || duplicate_record.school_id || 
            ', Class="' || COALESCE(duplicate_record.class_name, 'NULL') || '"' || 
            ', Section="' || duplicate_record.norm_section || '"' || 
            ', Roll="' || duplicate_record.norm_roll || '"';
    END LOOP;

    -- 3. Abort if any errors found
    IF has_error THEN
        RAISE EXCEPTION '%', error_message;
    END IF;
END $$;

-- If we reach here, data is clean. Proceed with schema changes.

-- Drop the old constraint
ALTER TABLE public.students 
DROP CONSTRAINT IF EXISTS unique_school_admission_number;

-- Normalize existing data before enforcing constraints (this is safe because we just validated no duplicates will be created)
UPDATE public.students
SET section = upper(trim(section)),
    roll_number = trim(roll_number),
    class_name = trim(regexp_replace(class_name, '\s+', ' ', 'g'));

-- Enforce NOT NULL on section and roll_number
ALTER TABLE public.students
ALTER COLUMN section SET NOT NULL,
ALTER COLUMN roll_number SET NOT NULL;

-- Add new composite unique constraint
ALTER TABLE public.students
ADD CONSTRAINT unique_school_class_section_roll UNIQUE (school_id, class_name, section, roll_number);
