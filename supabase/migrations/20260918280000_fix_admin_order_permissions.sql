-- Migration: Fix Admin Order Permissions
-- Grant table-level UPDATE and INSERT privileges to authenticated role so that
-- EvenVibe Admin RLS policies can function properly.

GRANT UPDATE ON public.orders TO authenticated;

GRANT INSERT ON public.order_status_history TO authenticated;

GRANT UPDATE ON public.requirement_items TO authenticated;

GRANT INSERT ON public.order_modification_history TO authenticated;
