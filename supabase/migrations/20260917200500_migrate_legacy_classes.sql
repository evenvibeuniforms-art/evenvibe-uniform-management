-- Migrate legacy numeric classes to canonical STANDARD_CLASSES format
UPDATE public.students
SET class_name = 'Class ' || class_name
WHERE class_name ~ '^[0-9]+$';

-- Also normalize LKG/UKG if any were lowercase
UPDATE public.students
SET class_name = UPPER(class_name)
WHERE class_name IN ('lkg', 'ukg', 'pre-kg', 'Pre-kg');

-- And trim any whitespace
UPDATE public.students
SET class_name = TRIM(class_name);
