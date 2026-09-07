-- --------------------------------------------------------
-- Fix Postgres Privileges for RLS Tables
-- --------------------------------------------------------
-- 
-- PostgREST routes requests using the 'authenticated' role when a valid JWT is present.
-- While Row Level Security (RLS) is enabled and controls WHICH rows can be read,
-- the role must first have the underlying PostgreSQL table-level SELECT privilege.
-- Without this, Postgres throws a 42501 (permission denied) error before RLS is even evaluated.
--
-- Note: This does NOT grant access to 'anon' (unauthenticated users).
--

GRANT SELECT ON TABLE public.profiles TO authenticated;
GRANT SELECT ON TABLE public.schools TO authenticated;
