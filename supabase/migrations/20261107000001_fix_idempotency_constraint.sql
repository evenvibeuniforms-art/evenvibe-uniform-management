-- Migration: 20261107000001_fix_idempotency_constraint.sql
-- Description: Add proper UNIQUE constraint on idempotency_key for ON CONFLICT support

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS uq_notifications_idempotency_key;
ALTER TABLE public.notifications ADD CONSTRAINT uq_notifications_idempotency_key UNIQUE (idempotency_key);
