-- Migration: 20261104000000_school_admin_alteration_attempts.sql
-- Goal: Support Alteration Attempts (Max 2 per Student + per Item per Order)
-- Authoritative Given Size, Change Size, Attempt Number, Style, Color, Created By,
-- and DB constraints to strictly block race conditions and >2 attempts.

-- 1. Add columns to public.alteration_requests
ALTER TABLE public.alteration_requests
    ADD COLUMN IF NOT EXISTS attempt_number INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS given_size TEXT NULL,
    ADD COLUMN IF NOT EXISTS change_size TEXT NULL,
    ADD COLUMN IF NOT EXISTS style_id UUID REFERENCES public.uniform_styles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS style_name TEXT NULL,
    ADD COLUMN IF NOT EXISTS color TEXT NULL,
    ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. Backfill existing records: sync given_size with current_size, change_size with required_size
UPDATE public.alteration_requests
SET given_size = current_size
WHERE given_size IS NULL AND current_size IS NOT NULL;

UPDATE public.alteration_requests
SET change_size = required_size
WHERE change_size IS NULL AND required_size IS NOT NULL;

-- Backfill attempt numbers for existing records deterministically
WITH numbered AS (
    SELECT id, ROW_NUMBER() OVER (
        PARTITION BY order_id, student_id, item_name 
        ORDER BY created_at ASC
    ) as rn
    FROM public.alteration_requests
)
UPDATE public.alteration_requests ar
SET attempt_number = LEAST(2, n.rn)
FROM numbered n
WHERE ar.id = n.id;

-- 3. Check constraint: attempt_number must be 1 or 2
ALTER TABLE public.alteration_requests
    DROP CONSTRAINT IF EXISTS chk_alteration_attempt_number;

ALTER TABLE public.alteration_requests
    ADD CONSTRAINT chk_alteration_attempt_number 
    CHECK (attempt_number IN (1, 2));

-- 4. Unique index: strictly prevent duplicate attempt numbers for the same order, student, and delivered item
DROP INDEX IF EXISTS public.uq_alteration_order_student_item_attempt_idx;

CREATE UNIQUE INDEX uq_alteration_order_student_item_attempt_idx
ON public.alteration_requests (
    order_id, 
    student_id, 
    LOWER(TRIM(item_name)), 
    COALESCE(LOWER(TRIM(style_name)), ''), 
    COALESCE(LOWER(TRIM(color)), ''), 
    attempt_number
);

-- 5. Additional index for fast attempt counting
CREATE INDEX IF NOT EXISTS idx_alteration_requests_attempt_count
ON public.alteration_requests (
    order_id, 
    student_id, 
    LOWER(TRIM(item_name))
);
