-- Grant missing privileges to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.students TO authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.profiles TO authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.schools TO authenticated;
