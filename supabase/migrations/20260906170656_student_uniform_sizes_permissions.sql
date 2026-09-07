-- Fix permissions for student_uniform_sizes
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_uniform_sizes TO authenticated, service_role;
