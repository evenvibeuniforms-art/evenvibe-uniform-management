-- 1. Grant INSERT, UPDATE, DELETE on public.school_uniform_designs to authenticated users (secured by RLS)
GRANT INSERT, UPDATE, DELETE ON TABLE public.school_uniform_designs TO authenticated;

-- 2. Update allowed_mime_types for uniform-designs storage bucket to include image/jpg and application/pdf
UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf']::text[]
WHERE id = 'uniform-designs';
