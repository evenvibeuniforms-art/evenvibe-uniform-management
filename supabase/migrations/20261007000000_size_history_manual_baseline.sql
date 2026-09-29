-- ============================================================================
-- Migration: 20261007000000_size_history_manual_baseline.sql
-- Description: Add source_type to student_uniform_size_history to differentiate
--              between automatically recorded yearly sizes and manual initial baselines.
-- ============================================================================

BEGIN;

-- 1. Add source_type column to student_uniform_size_history
ALTER TABLE public.student_uniform_size_history
    ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL 
    DEFAULT 'historical_record'
    CHECK (source_type IN ('historical_record', 'manual_baseline'));

-- 2. Index for source_type filtering and analytics
CREATE INDEX IF NOT EXISTS idx_student_size_history_source_type
    ON public.student_uniform_size_history (source_type);

COMMIT;
