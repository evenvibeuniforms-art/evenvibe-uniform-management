-- Migration: 20261113000000_delivery_batches_and_style_print.sql
-- Description: Supports multiple delivery batches per order, batch lifecycle,
-- batch-specific actual delivery items, and remaining quantity tracking without netting across colors.

BEGIN;

-- 1. Create table public.order_delivery_batches
CREATE TABLE IF NOT EXISTS public.order_delivery_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    batch_number INTEGER NOT NULL DEFAULT 1 CHECK (batch_number >= 1),
    batch_reference TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'dispatched', 'in_transit', 'delivered', 'cancelled')),
    dispatched_at TIMESTAMPTZ NULL,
    delivered_at TIMESTAMPTZ NULL,
    courier_name TEXT NULL,
    tracking_number TEXT NULL,
    estimated_delivery DATE NULL,
    remarks TEXT NULL,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_order_delivery_batch UNIQUE (order_id, batch_number)
);

CREATE INDEX IF NOT EXISTS idx_order_delivery_batches_order ON public.order_delivery_batches(order_id);
CREATE INDEX IF NOT EXISTS idx_order_delivery_batches_status ON public.order_delivery_batches(status);

DROP TRIGGER IF EXISTS set_order_delivery_batches_updated_at ON public.order_delivery_batches;
CREATE TRIGGER set_order_delivery_batches_updated_at
    BEFORE UPDATE ON public.order_delivery_batches
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.order_delivery_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage order delivery batches" ON public.order_delivery_batches;
CREATE POLICY "Admins can manage order delivery batches"
    ON public.order_delivery_batches FOR ALL
    USING (public.get_my_role() = 'evenvibe_admin'::public.app_role);

DROP POLICY IF EXISTS "School Admins can view own order delivery batches" ON public.order_delivery_batches;
CREATE POLICY "School Admins can view own order delivery batches"
    ON public.order_delivery_batches FOR SELECT
    USING (
        public.get_my_role() = 'school_admin'::public.app_role
        AND order_id IN (
            SELECT id FROM public.orders WHERE school_id = public.get_my_school_id()
        )
    );

-- 2. Extend order_delivery_actual_items with batch_id and batch_number
ALTER TABLE public.order_delivery_actual_items
    ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES public.order_delivery_batches(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS batch_number INTEGER NOT NULL DEFAULT 1 CHECK (batch_number >= 1);

CREATE INDEX IF NOT EXISTS idx_order_delivery_actual_batch ON public.order_delivery_actual_items(batch_id);
CREATE INDEX IF NOT EXISTS idx_order_delivery_actual_batch_num ON public.order_delivery_actual_items(order_id, batch_number);

-- 3. Backfill batch for existing order_delivery_actual_items records if any exist
INSERT INTO public.order_delivery_batches (order_id, batch_number, batch_reference, status, created_at, updated_at)
SELECT DISTINCT order_id, 1, 'BATCH-001', 'delivered', now(), now()
FROM public.order_delivery_actual_items
WHERE batch_id IS NULL
ON CONFLICT (order_id, batch_number) DO NOTHING;

UPDATE public.order_delivery_actual_items i
SET batch_id = b.id, batch_number = b.batch_number
FROM public.order_delivery_batches b
WHERE i.order_id = b.order_id AND b.batch_number = 1 AND i.batch_id IS NULL;

-- 4. Update unique constraint on order_delivery_actual_items to be per batch
ALTER TABLE public.order_delivery_actual_items
    DROP CONSTRAINT IF EXISTS uq_order_delivery_actual_item;

ALTER TABLE public.order_delivery_actual_items
    DROP CONSTRAINT IF EXISTS uq_order_delivery_actual_item_batch;

ALTER TABLE public.order_delivery_actual_items
    ADD CONSTRAINT uq_order_delivery_actual_item_batch
    UNIQUE (order_id, batch_number, style_name, item_name, color, size);

-- 5. Optional batch linkage on delivery_proof_images
ALTER TABLE public.delivery_proof_images
    ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES public.order_delivery_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_delivery_proof_batch ON public.delivery_proof_images(batch_id);

COMMIT;
