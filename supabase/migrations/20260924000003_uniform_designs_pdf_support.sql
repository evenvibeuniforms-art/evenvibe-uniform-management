-- Allow PDF files in uniform-designs bucket
UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']::text[]
WHERE id = 'uniform-designs';
