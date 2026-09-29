-- Migration: 20261106000000_tc_students_date.sql
-- Description: Update tc_students to replace tc_number with mandatory tc_date.
-- Safely drop tc_number NOT NULL and uniqueness constraint while keeping legacy data intact.

-- 1. Add tc_date column to tc_students
ALTER TABLE public.tc_students 
ADD COLUMN IF NOT EXISTS tc_date DATE;

-- 2. Create index on tc_date for efficient date queries and sorting
CREATE INDEX IF NOT EXISTS idx_tc_students_tc_date ON public.tc_students(tc_date);

-- 3. Make tc_number nullable for all new records
ALTER TABLE public.tc_students 
ALTER COLUMN tc_number DROP NOT NULL;

-- 4. Drop unique constraint on (school_id, tc_number) since tc_number is deprecated
ALTER TABLE public.tc_students 
DROP CONSTRAINT IF EXISTS tc_students_school_tc_number_unique;

-- 5. Ensure tc_students_school_student_unique exists to enforce one TC record per student
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'tc_students_school_student_unique' 
          AND conrelid = 'public.tc_students'::regclass
    ) THEN
        ALTER TABLE public.tc_students 
        ADD CONSTRAINT tc_students_school_student_unique UNIQUE (school_id, student_id);
    END IF;
END $$;
