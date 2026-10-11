-- Migration: 20261114000000_fix_delivery_batch_permissions.sql
-- Description: Fix table-level grants and RLS policies for order_delivery_batches,
-- order_delivery_actual_items, order_delivery_returns, and order_followup_dispatches.

BEGIN;

-- 1. Table privileges for authenticated users and service_role
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.order_delivery_batches TO authenticated;
GRANT ALL ON TABLE public.order_delivery_batches TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.order_delivery_actual_items TO authenticated;
GRANT ALL ON TABLE public.order_delivery_actual_items TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.order_delivery_returns TO authenticated;
GRANT ALL ON TABLE public.order_delivery_returns TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.order_followup_dispatches TO authenticated;
GRANT ALL ON TABLE public.order_followup_dispatches TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.order_followup_dispatch_items TO authenticated;
GRANT ALL ON TABLE public.order_followup_dispatch_items TO service_role;

-- 2. Ensure RLS is active on all delivery tables
ALTER TABLE public.order_delivery_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_delivery_actual_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_delivery_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_followup_dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_followup_dispatch_items ENABLE ROW LEVEL SECURITY;

-- 3. Robust RLS Policies for order_delivery_batches
DROP POLICY IF EXISTS "Admins can manage order delivery batches" ON public.order_delivery_batches;
CREATE POLICY "Admins can manage order delivery batches"
    ON public.order_delivery_batches FOR ALL
    TO authenticated, service_role
    USING (public.get_my_role() = 'evenvibe_admin'::public.app_role)
    WITH CHECK (public.get_my_role() = 'evenvibe_admin'::public.app_role);

DROP POLICY IF EXISTS "School Admins can view own order delivery batches" ON public.order_delivery_batches;
CREATE POLICY "School Admins can view own order delivery batches"
    ON public.order_delivery_batches FOR SELECT
    TO authenticated, service_role
    USING (
        public.get_my_role() = 'school_admin'::public.app_role
        AND EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id = public.order_delivery_batches.order_id
              AND o.school_id = public.get_my_school_id()
        )
    );

-- 4. Robust RLS Policies for order_delivery_actual_items
DROP POLICY IF EXISTS "Admins can manage order delivery actual items" ON public.order_delivery_actual_items;
CREATE POLICY "Admins can manage order delivery actual items"
    ON public.order_delivery_actual_items FOR ALL
    TO authenticated, service_role
    USING (public.get_my_role() = 'evenvibe_admin'::public.app_role)
    WITH CHECK (public.get_my_role() = 'evenvibe_admin'::public.app_role);

DROP POLICY IF EXISTS "School Admins can view own order delivery actual items" ON public.order_delivery_actual_items;
CREATE POLICY "School Admins can view own order delivery actual items"
    ON public.order_delivery_actual_items FOR SELECT
    TO authenticated, service_role
    USING (
        public.get_my_role() = 'school_admin'::public.app_role
        AND EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id = public.order_delivery_actual_items.order_id
              AND o.school_id = public.get_my_school_id()
        )
    );

-- 5. Robust RLS Policies for order_delivery_returns
DROP POLICY IF EXISTS "Admins can manage order delivery returns" ON public.order_delivery_returns;
CREATE POLICY "Admins can manage order delivery returns"
    ON public.order_delivery_returns FOR ALL
    TO authenticated, service_role
    USING (public.get_my_role() = 'evenvibe_admin'::public.app_role)
    WITH CHECK (public.get_my_role() = 'evenvibe_admin'::public.app_role);

DROP POLICY IF EXISTS "School Admins can view own order delivery returns" ON public.order_delivery_returns;
CREATE POLICY "School Admins can view own order delivery returns"
    ON public.order_delivery_returns FOR SELECT
    TO authenticated, service_role
    USING (
        public.get_my_role() = 'school_admin'::public.app_role
        AND school_id = public.get_my_school_id()
    );

-- 6. Robust RLS Policies for order_followup_dispatches
DROP POLICY IF EXISTS "Admins can manage order followup dispatches" ON public.order_followup_dispatches;
CREATE POLICY "Admins can manage order followup dispatches"
    ON public.order_followup_dispatches FOR ALL
    TO authenticated, service_role
    USING (public.get_my_role() = 'evenvibe_admin'::public.app_role)
    WITH CHECK (public.get_my_role() = 'evenvibe_admin'::public.app_role);

DROP POLICY IF EXISTS "School Admins can view own order followup dispatches" ON public.order_followup_dispatches;
CREATE POLICY "School Admins can view own order followup dispatches"
    ON public.order_followup_dispatches FOR SELECT
    TO authenticated, service_role
    USING (
        public.get_my_role() = 'school_admin'::public.app_role
        AND school_id = public.get_my_school_id()
    );

-- 7. Robust RLS Policies for order_followup_dispatch_items
DROP POLICY IF EXISTS "Admins can manage order followup dispatch items" ON public.order_followup_dispatch_items;
CREATE POLICY "Admins can manage order followup dispatch items"
    ON public.order_followup_dispatch_items FOR ALL
    TO authenticated, service_role
    USING (public.get_my_role() = 'evenvibe_admin'::public.app_role)
    WITH CHECK (public.get_my_role() = 'evenvibe_admin'::public.app_role);

DROP POLICY IF EXISTS "School Admins can view own order followup dispatch items" ON public.order_followup_dispatch_items;
CREATE POLICY "School Admins can view own order followup dispatch items"
    ON public.order_followup_dispatch_items FOR SELECT
    TO authenticated, service_role
    USING (
        public.get_my_role() = 'school_admin'::public.app_role
        AND EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id = public.order_followup_dispatch_items.order_id
              AND o.school_id = public.get_my_school_id()
        )
    );

-- 8. Enable Realtime Publications if available
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'order_delivery_batches'
        ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.order_delivery_batches;
        END IF;
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'order_delivery_actual_items'
        ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.order_delivery_actual_items;
        END IF;
    END IF;
END $$;

COMMIT;
