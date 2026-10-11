-- Migration: 20261112000000_delivery_actual_quantities_and_returns.sql
-- Description: Supports manual per-size delivery quantities, separate extra/short delivery records,
-- return/send-back to school tracking, and follow-up dispatch history.

BEGIN;

-- 1. Table: order_delivery_actual_items
CREATE TABLE IF NOT EXISTS public.order_delivery_actual_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    style_name TEXT NOT NULL,
    item_name TEXT NOT NULL,
    color TEXT NOT NULL,
    size TEXT NOT NULL,
    original_quantity INTEGER NOT NULL DEFAULT 0 CHECK (original_quantity >= 0),
    actual_quantity INTEGER NOT NULL DEFAULT 0 CHECK (actual_quantity >= 0),
    difference INTEGER NOT NULL DEFAULT 0,
    classification TEXT NOT NULL CHECK (classification IN ('exact', 'extra', 'short', 'not_delivered')),
    extra_quantity INTEGER NOT NULL DEFAULT 0 CHECK (extra_quantity >= 0),
    short_quantity INTEGER NOT NULL DEFAULT 0 CHECK (short_quantity >= 0),
    not_delivered_quantity INTEGER NOT NULL DEFAULT 0 CHECK (not_delivered_quantity >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_order_delivery_actual_item UNIQUE (order_id, style_name, item_name, color, size)
);

CREATE INDEX IF NOT EXISTS idx_order_delivery_actual_order ON public.order_delivery_actual_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_delivery_actual_class ON public.order_delivery_actual_items(classification);

DROP TRIGGER IF EXISTS set_order_delivery_actual_items_updated_at ON public.order_delivery_actual_items;
CREATE TRIGGER set_order_delivery_actual_items_updated_at
    BEFORE UPDATE ON public.order_delivery_actual_items
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.order_delivery_actual_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage order delivery actual items" ON public.order_delivery_actual_items;
CREATE POLICY "Admins can manage order delivery actual items"
    ON public.order_delivery_actual_items FOR ALL
    USING (public.get_my_role() = 'evenvibe_admin'::public.app_role);

DROP POLICY IF EXISTS "School Admins can view own order delivery actual items" ON public.order_delivery_actual_items;
CREATE POLICY "School Admins can view own order delivery actual items"
    ON public.order_delivery_actual_items FOR SELECT
    USING (
        public.get_my_role() = 'school_admin'::public.app_role
        AND order_id IN (
            SELECT id FROM public.orders WHERE school_id = public.get_my_school_id()
        )
    );

-- 2. Table: order_delivery_returns (Return / Send Back to School)
CREATE TABLE IF NOT EXISTS public.order_delivery_returns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    style_name TEXT NOT NULL,
    item_name TEXT NOT NULL,
    color TEXT NOT NULL,
    size TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'dispatched', 'in_transit', 'completed', 'cancelled')),
    dispatch_date DATE NULL,
    tracking_details TEXT NULL,
    remarks TEXT NULL,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_delivery_returns_order ON public.order_delivery_returns(order_id);
CREATE INDEX IF NOT EXISTS idx_order_delivery_returns_school ON public.order_delivery_returns(school_id);
CREATE INDEX IF NOT EXISTS idx_order_delivery_returns_status ON public.order_delivery_returns(status);

DROP TRIGGER IF EXISTS set_order_delivery_returns_updated_at ON public.order_delivery_returns;
CREATE TRIGGER set_order_delivery_returns_updated_at
    BEFORE UPDATE ON public.order_delivery_returns
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.order_delivery_returns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage order delivery returns" ON public.order_delivery_returns;
CREATE POLICY "Admins can manage order delivery returns"
    ON public.order_delivery_returns FOR ALL
    USING (public.get_my_role() = 'evenvibe_admin'::public.app_role);

DROP POLICY IF EXISTS "School Admins can view own order delivery returns" ON public.order_delivery_returns;
CREATE POLICY "School Admins can view own order delivery returns"
    ON public.order_delivery_returns FOR SELECT
    USING (
        public.get_my_role() = 'school_admin'::public.app_role
        AND school_id = public.get_my_school_id()
    );

-- 3. Table: order_followup_dispatches (Follow-up dispatch headers)
CREATE TABLE IF NOT EXISTS public.order_followup_dispatches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    dispatch_reference TEXT NOT NULL,
    courier_name TEXT NULL,
    tracking_number TEXT NULL,
    dispatch_date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'dispatched', 'in_transit', 'delivered', 'cancelled')),
    remarks TEXT NULL,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_followup_dispatches_order ON public.order_followup_dispatches(order_id);
CREATE INDEX IF NOT EXISTS idx_order_followup_dispatches_school ON public.order_followup_dispatches(school_id);

DROP TRIGGER IF EXISTS set_order_followup_dispatches_updated_at ON public.order_followup_dispatches;
CREATE TRIGGER set_order_followup_dispatches_updated_at
    BEFORE UPDATE ON public.order_followup_dispatches
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.order_followup_dispatches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage order followup dispatches" ON public.order_followup_dispatches;
CREATE POLICY "Admins can manage order followup dispatches"
    ON public.order_followup_dispatches FOR ALL
    USING (public.get_my_role() = 'evenvibe_admin'::public.app_role);

DROP POLICY IF EXISTS "School Admins can view own order followup dispatches" ON public.order_followup_dispatches;
CREATE POLICY "School Admins can view own order followup dispatches"
    ON public.order_followup_dispatches FOR SELECT
    USING (
        public.get_my_role() = 'school_admin'::public.app_role
        AND school_id = public.get_my_school_id()
    );

-- 4. Table: order_followup_dispatch_items (Items for each follow-up dispatch)
CREATE TABLE IF NOT EXISTS public.order_followup_dispatch_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    followup_dispatch_id UUID NOT NULL REFERENCES public.order_followup_dispatches(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    style_name TEXT NOT NULL,
    item_name TEXT NOT NULL,
    color TEXT NOT NULL,
    size TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_followup_items_dispatch ON public.order_followup_dispatch_items(followup_dispatch_id);
CREATE INDEX IF NOT EXISTS idx_order_followup_items_order ON public.order_followup_dispatch_items(order_id);

ALTER TABLE public.order_followup_dispatch_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage order followup dispatch items" ON public.order_followup_dispatch_items;
CREATE POLICY "Admins can manage order followup dispatch items"
    ON public.order_followup_dispatch_items FOR ALL
    USING (public.get_my_role() = 'evenvibe_admin'::public.app_role);

DROP POLICY IF EXISTS "School Admins can view own order followup dispatch items" ON public.order_followup_dispatch_items;
CREATE POLICY "School Admins can view own order followup dispatch items"
    ON public.order_followup_dispatch_items FOR SELECT
    USING (
        public.get_my_role() = 'school_admin'::public.app_role
        AND order_id IN (
            SELECT id FROM public.orders WHERE school_id = public.get_my_school_id()
        )
    );

COMMIT;
