-- Migration: Admin Orders Management (Phase 9)

-- 1. Create order_modification_history table
CREATE TABLE IF NOT EXISTS public.order_modification_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    requirement_item_id UUID NOT NULL REFERENCES public.requirement_items(id) ON DELETE CASCADE,
    old_quantity INTEGER NOT NULL CHECK (old_quantity >= 0),
    new_quantity INTEGER NOT NULL CHECK (new_quantity >= 0),
    changed_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_modification_history_order_id_idx ON public.order_modification_history(order_id);
CREATE INDEX IF NOT EXISTS order_modification_history_req_item_id_idx ON public.order_modification_history(requirement_item_id);

-- 2. Enable RLS
ALTER TABLE public.order_modification_history ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies for Admin Order Management

-- EvenVive Admins can view all orders
CREATE POLICY "EvenVive Admins can view all orders" 
    ON public.orders FOR SELECT
    USING (public.get_my_role() = 'evenvibe_admin');

-- EvenVive Admins can update all orders
CREATE POLICY "EvenVive Admins can update all orders" 
    ON public.orders FOR UPDATE
    USING (public.get_my_role() = 'evenvibe_admin');

-- EvenVive Admins can view order status history
CREATE POLICY "EvenVive Admins can view order status history" 
    ON public.order_status_history FOR SELECT
    USING (public.get_my_role() = 'evenvibe_admin');

-- EvenVive Admins can insert order status history
CREATE POLICY "EvenVive Admins can insert order status history" 
    ON public.order_status_history FOR INSERT
    WITH CHECK (public.get_my_role() = 'evenvibe_admin');

-- EvenVive Admins can view requirement items
CREATE POLICY "EvenVive Admins can view requirement items" 
    ON public.requirement_items FOR SELECT
    USING (public.get_my_role() = 'evenvibe_admin');

-- EvenVive Admins can update requirement items (for quantity changes)
CREATE POLICY "EvenVive Admins can update requirement items" 
    ON public.requirement_items FOR UPDATE
    USING (public.get_my_role() = 'evenvibe_admin');

-- EvenVive Admins can view order modification history
CREATE POLICY "EvenVive Admins can view order modification history" 
    ON public.order_modification_history FOR SELECT
    USING (public.get_my_role() = 'evenvibe_admin');

-- EvenVive Admins can insert order modification history
CREATE POLICY "EvenVive Admins can insert order modification history" 
    ON public.order_modification_history FOR INSERT
    WITH CHECK (public.get_my_role() = 'evenvibe_admin' AND changed_by = auth.uid());

-- School Admins can view order modification history (read-only for their orders)
CREATE POLICY "School Admins can view own order modification history"
    ON public.order_modification_history FOR SELECT
    USING (
        order_id IN (
            SELECT id FROM public.orders WHERE school_id = public.get_my_school_id()
        )
        AND public.get_my_role() = 'school_admin'
    );
