-- Grant minimum required table privileges to the authenticated role
-- This allows the RLS policies defined in the previous migration to actually take effect.

GRANT SELECT, INSERT, UPDATE, DELETE 
ON TABLE public.school_logos 
TO authenticated;
