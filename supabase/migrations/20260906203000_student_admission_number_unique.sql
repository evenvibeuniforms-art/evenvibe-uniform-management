-- Add unique constraint to admission_number per school
-- Postgres UNIQUE constraint naturally allows multiple NULLs in unique indexes
-- Normalize empty strings to NULL before adding unique constraint
UPDATE public.students SET admission_number = NULL WHERE trim(admission_number) = '';

ALTER TABLE public.students
ADD CONSTRAINT unique_school_admission_number UNIQUE (school_id, admission_number);
