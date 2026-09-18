-- 20260917000001_fix_table_grants.sql
-- Fix missing table privileges for uniform configuration tables

BEGIN;

-- 1. Grant SELECT on configuration and classes tables
GRANT SELECT ON TABLE public.school_uniform_configurations TO authenticated;
GRANT SELECT ON TABLE public.school_uniform_configuration_classes TO authenticated;

-- 2. Grant SELECT, INSERT, UPDATE on items table because the Next.js server action
-- explicitly runs .upsert() and .update() directly on this table.
GRANT SELECT, INSERT, UPDATE ON TABLE public.school_uniform_configuration_items TO authenticated;

COMMIT;
