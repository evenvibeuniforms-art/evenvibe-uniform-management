-- Migration: Safely remove only the broken local test order EV-ORD-2026-CF1216 and its requirement snapshot
-- Targets:
-- Order: f79b66af-92ea-4334-99dd-7bb49841208d (EV-ORD-2026-CF1216)
-- Requirement: de1eb832-7ef6-4820-aff2-db9519813cfa (EV-REQ-2026-394C2D)

DO $$
BEGIN
    -- 1. Remove order status history for this order
    DELETE FROM public.order_status_history
    WHERE order_id = 'f79b66af-92ea-4334-99dd-7bb49841208d';

    -- 2. Remove order
    DELETE FROM public.orders
    WHERE id = 'f79b66af-92ea-4334-99dd-7bb49841208d';

    -- 3. Remove requirement items
    DELETE FROM public.requirement_items
    WHERE requirement_id = 'de1eb832-7ef6-4820-aff2-db9519813cfa';

    -- 4. Remove requirement students
    DELETE FROM public.requirement_students
    WHERE requirement_id = 'de1eb832-7ef6-4820-aff2-db9519813cfa';

    -- 5. Remove requirement
    DELETE FROM public.requirements
    WHERE id = 'de1eb832-7ef6-4820-aff2-db9519813cfa';
END $$;
