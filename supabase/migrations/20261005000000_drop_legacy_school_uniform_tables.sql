-- ==============================================================================
-- Migration: 20261005000000_drop_legacy_school_uniform_tables.sql
-- Description: Permanently drop unused legacy tables public.school_logos and
--              public.school_uniform_designs after full dependency audit.
--
-- Preserved Systems (STRICTLY UNTOUCHED):
--   - public.uniform_styles
--   - public.uniform_style_classes
--   - public.uniform_style_images
--   - public.uniform_style_colors
--   - public.student_uniform_sizes
--   - public.requirements
--   - public.requirement_items
--   - public.orders
--   - public.order_items
--   - storage.buckets ('uniform-designs' bucket & policies preserved)
-- ==============================================================================

-- 1. Drop triggers on legacy tables
DROP TRIGGER IF EXISTS set_school_logos_updated_at ON public.school_logos;
DROP TRIGGER IF EXISTS update_school_uniform_designs_modtime ON public.school_uniform_designs;

-- 2. Drop RLS policies on public.school_logos
DROP POLICY IF EXISTS school_logos_select_school_admin ON public.school_logos;
DROP POLICY IF EXISTS school_logos_insert_school_admin ON public.school_logos;
DROP POLICY IF EXISTS school_logos_update_school_admin ON public.school_logos;
DROP POLICY IF EXISTS school_logos_delete_school_admin ON public.school_logos;
DROP POLICY IF EXISTS school_logos_select_evenvibe_admin ON public.school_logos;

-- 3. Drop RLS policies on public.school_uniform_designs
DROP POLICY IF EXISTS school_uniform_designs_select ON public.school_uniform_designs;
DROP POLICY IF EXISTS school_uniform_designs_insert ON public.school_uniform_designs;
DROP POLICY IF EXISTS school_uniform_designs_update ON public.school_uniform_designs;
DROP POLICY IF EXISTS school_uniform_designs_delete ON public.school_uniform_designs;

-- 4. Drop obsolete storage policies on storage.objects for legacy school-logos bucket
DROP POLICY IF EXISTS school_logos_storage_select_school_admin ON storage.objects;
DROP POLICY IF EXISTS school_logos_storage_insert_school_admin ON storage.objects;
DROP POLICY IF EXISTS school_logos_storage_update_school_admin ON storage.objects;
DROP POLICY IF EXISTS school_logos_storage_delete_school_admin ON storage.objects;
DROP POLICY IF EXISTS school_logos_storage_select_evenvibe_admin ON storage.objects;

-- 5. Drop the legacy tables (No CASCADE used - zero dependent foreign keys exist)
DROP TABLE IF EXISTS public.school_logos;
DROP TABLE IF EXISTS public.school_uniform_designs;
