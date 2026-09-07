-- Grant permissions for alteration_requests and alteration_request_history
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alteration_requests TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alteration_request_history TO authenticated, service_role;
