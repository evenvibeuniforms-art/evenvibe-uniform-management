-- Migration: 20261101000000_delivery_proof_images.sql
-- Goal: Add delivery proof image table, storage bucket, and RLS policies for Admin upload & School Admin view

-- 1. Create dedicated private storage bucket: delivery-proofs
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'delivery-proofs',
  'delivery-proofs',
  false,
  10485760, -- 10MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/jpg']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];

-- 2. Storage Policies for delivery-proofs bucket
DROP POLICY IF EXISTS "delivery_proofs_insert_admin" ON storage.objects;
DROP POLICY IF EXISTS "delivery_proofs_select_admin" ON storage.objects;
DROP POLICY IF EXISTS "delivery_proofs_delete_admin" ON storage.objects;
DROP POLICY IF EXISTS "delivery_proofs_select_school_admin" ON storage.objects;

-- Admin: can insert images
CREATE POLICY "delivery_proofs_insert_admin"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'delivery-proofs'
    AND public.get_my_role() = 'evenvibe_admin'::app_role
  );

-- Admin: can select/view images
CREATE POLICY "delivery_proofs_select_admin"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'delivery-proofs'
    AND public.get_my_role() = 'evenvibe_admin'::app_role
  );

-- Admin: can delete images
CREATE POLICY "delivery_proofs_delete_admin"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'delivery-proofs'
    AND public.get_my_role() = 'evenvibe_admin'::app_role
  );

-- School Admin: can ONLY view images belonging to their own school's orders
CREATE POLICY "delivery_proofs_select_school_admin"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'delivery-proofs'
    AND public.get_my_role() = 'school_admin'::app_role
    AND (storage.foldername(name))[1]::uuid IN (
      SELECT id FROM public.orders WHERE school_id = public.get_my_school_id()
    )
  );

-- 3. Database Table: delivery_proof_images
CREATE TABLE IF NOT EXISTS public.delivery_proof_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size BIGINT,
  caption TEXT,
  uploaded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  display_order INTEGER NOT NULL DEFAULT 0
);

-- Index for order isolation queries
CREATE INDEX IF NOT EXISTS idx_delivery_proof_images_order_id ON public.delivery_proof_images(order_id);

-- 4. Enable RLS on delivery_proof_images
ALTER TABLE public.delivery_proof_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "delivery_proof_images_admin_all" ON public.delivery_proof_images;
DROP POLICY IF EXISTS "delivery_proof_images_school_admin_select" ON public.delivery_proof_images;

-- Admin: full access (SELECT, INSERT, UPDATE, DELETE)
CREATE POLICY "delivery_proof_images_admin_all"
  ON public.delivery_proof_images
  FOR ALL
  TO authenticated
  USING (public.get_my_role() = 'evenvibe_admin'::app_role)
  WITH CHECK (public.get_my_role() = 'evenvibe_admin'::app_role);

-- School Admin: SELECT only for orders belonging to their school
CREATE POLICY "delivery_proof_images_school_admin_select"
  ON public.delivery_proof_images
  FOR SELECT
  TO authenticated
  USING (
    public.get_my_role() = 'school_admin'::app_role
    AND order_id IN (
      SELECT id FROM public.orders WHERE school_id = public.get_my_school_id()
    )
  );

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_proof_images TO authenticated, service_role;

-- 5. Realtime publication
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables 
            WHERE pubname = 'supabase_realtime' 
            AND schemaname = 'public' 
            AND tablename = 'delivery_proof_images'
        ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_proof_images;
        END IF;
    END IF;
END $$;
