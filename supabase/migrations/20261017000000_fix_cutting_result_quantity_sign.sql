-- Migration: 20261017000000_fix_cutting_result_quantity_sign.sql
-- Description: Fix Cutting Result Quantity Sign to be: cut_quantity - required_quantity

ALTER TABLE public.order_cutting_items DROP COLUMN IF EXISTS result_quantity;

ALTER TABLE public.order_cutting_items
    ADD COLUMN result_quantity INTEGER GENERATED ALWAYS AS (cut_quantity - required_quantity) STORED;
