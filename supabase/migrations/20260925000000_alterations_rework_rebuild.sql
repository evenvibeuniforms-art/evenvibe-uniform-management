-- Migration: Rebuild Alterations & Rework Module
-- Updates alteration_requests and alteration_request_history, sets up alteration-proofs storage bucket

-- 1. Alter alteration_requests table schema
ALTER TABLE public.alteration_requests DROP CONSTRAINT IF EXISTS alteration_requests_issue_type_check;
ALTER TABLE public.alteration_requests DROP CONSTRAINT IF EXISTS alteration_requests_item_type_check;
ALTER TABLE public.alteration_requests DROP CONSTRAINT IF EXISTS alteration_requests_uniform_type_check;
ALTER TABLE public.alteration_requests DROP CONSTRAINT IF EXISTS alteration_requests_status_check;

ALTER TABLE public.alteration_requests ALTER COLUMN uniform_type DROP NOT NULL;
ALTER TABLE public.alteration_requests ALTER COLUMN item_type DROP NOT NULL;
ALTER TABLE public.alteration_requests ALTER COLUMN description DROP NOT NULL;

-- Add new columns if missing
ALTER TABLE public.alteration_requests ADD COLUMN IF NOT EXISTS item_name TEXT;
ALTER TABLE public.alteration_requests ADD COLUMN IF NOT EXISTS current_size TEXT;
ALTER TABLE public.alteration_requests ADD COLUMN IF NOT EXISTS required_size TEXT;
ALTER TABLE public.alteration_requests ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.alteration_requests ADD COLUMN IF NOT EXISTS remarks TEXT;
ALTER TABLE public.alteration_requests ADD COLUMN IF NOT EXISTS proof_photo_url TEXT;
ALTER TABLE public.alteration_requests ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE public.alteration_requests ADD COLUMN IF NOT EXISTS rework_remarks TEXT;
ALTER TABLE public.alteration_requests ADD COLUMN IF NOT EXISTS completed_remarks TEXT;

-- Update existing records if any
UPDATE public.alteration_requests SET item_name = item_type WHERE item_name IS NULL AND item_type IS NOT NULL;

-- New status check constraint
ALTER TABLE public.alteration_requests ADD CONSTRAINT alteration_requests_status_check
  CHECK (status IN ('requested', 'under_review', 'approved', 'rejected', 'rework', 'completed'));

-- New reason / issue_type check constraint (supports both new formatted names and legacy keys)
ALTER TABLE public.alteration_requests ADD CONSTRAINT alteration_requests_issue_type_check
  CHECK (issue_type IN (
    'Size Correction',
    'Wrong Size Received',
    'Wrong Item Received',
    'Damaged Item',
    'Stitching Issue',
    'Measurement Issue',
    'Missing Item',
    'Other',
    'wrong_size',
    'stitching_issue',
    'measurement_issue',
    'damaged_item',
    'missing_item',
    'wrong_item',
    'other'
  ));

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_alteration_requests_order_id ON public.alteration_requests(order_id);
CREATE INDEX IF NOT EXISTS idx_alteration_requests_student_id ON public.alteration_requests(student_id);
CREATE INDEX IF NOT EXISTS idx_alteration_requests_school_id ON public.alteration_requests(school_id);
CREATE INDEX IF NOT EXISTS idx_alteration_requests_status ON public.alteration_requests(status);
CREATE INDEX IF NOT EXISTS idx_alteration_requests_created_at ON public.alteration_requests(created_at);

-- 2. RLS Policies on alteration_requests
DROP POLICY IF EXISTS "School Admin can view their own school's alteration requests" ON public.alteration_requests;
DROP POLICY IF EXISTS "school_admin_select_alteration_requests" ON public.alteration_requests;
DROP POLICY IF EXISTS "school_admin_insert_alteration_requests" ON public.alteration_requests;
DROP POLICY IF EXISTS "evenvibe_admin_select_alteration_requests" ON public.alteration_requests;
DROP POLICY IF EXISTS "evenvibe_admin_update_alteration_requests" ON public.alteration_requests;

CREATE POLICY "school_admin_select_alteration_requests"
  ON public.alteration_requests FOR SELECT
  TO authenticated
  USING (
    school_id = public.get_my_school_id()
    AND public.get_my_role() = 'school_admin'::app_role
  );

CREATE POLICY "school_admin_insert_alteration_requests"
  ON public.alteration_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    school_id = public.get_my_school_id()
    AND public.get_my_role() = 'school_admin'::app_role
  );

CREATE POLICY "evenvibe_admin_select_alteration_requests"
  ON public.alteration_requests FOR SELECT
  TO authenticated
  USING (
    public.get_my_role() = 'evenvibe_admin'::app_role
  );

CREATE POLICY "evenvibe_admin_update_alteration_requests"
  ON public.alteration_requests FOR UPDATE
  TO authenticated
  USING (
    public.get_my_role() = 'evenvibe_admin'::app_role
  )
  WITH CHECK (
    public.get_my_role() = 'evenvibe_admin'::app_role
  );

-- 3. RLS Policies on alteration_request_history
DROP POLICY IF EXISTS "School Admin can view their own school's alteration request his" ON public.alteration_request_history;
DROP POLICY IF EXISTS "school_admin_select_alteration_request_history" ON public.alteration_request_history;
DROP POLICY IF EXISTS "school_admin_insert_alteration_request_history" ON public.alteration_request_history;
DROP POLICY IF EXISTS "evenvibe_admin_select_alteration_request_history" ON public.alteration_request_history;
DROP POLICY IF EXISTS "evenvibe_admin_insert_alteration_request_history" ON public.alteration_request_history;

CREATE POLICY "school_admin_select_alteration_request_history"
  ON public.alteration_request_history FOR SELECT
  TO authenticated
  USING (
    alteration_request_id IN (
      SELECT id FROM public.alteration_requests
      WHERE school_id = public.get_my_school_id()
    )
    AND public.get_my_role() = 'school_admin'::app_role
  );

CREATE POLICY "school_admin_insert_alteration_request_history"
  ON public.alteration_request_history FOR INSERT
  TO authenticated
  WITH CHECK (
    alteration_request_id IN (
      SELECT id FROM public.alteration_requests
      WHERE school_id = public.get_my_school_id()
    )
    AND public.get_my_role() = 'school_admin'::app_role
  );

CREATE POLICY "evenvibe_admin_select_alteration_request_history"
  ON public.alteration_request_history FOR SELECT
  TO authenticated
  USING (
    public.get_my_role() = 'evenvibe_admin'::app_role
  );

CREATE POLICY "evenvibe_admin_insert_alteration_request_history"
  ON public.alteration_request_history FOR INSERT
  TO authenticated
  WITH CHECK (
    public.get_my_role() = 'evenvibe_admin'::app_role
  );

-- Grants
GRANT SELECT, INSERT, UPDATE ON public.alteration_requests TO authenticated, service_role;
GRANT SELECT, INSERT ON public.alteration_request_history TO authenticated, service_role;

-- 4. Storage Bucket: alteration-proofs
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'alteration-proofs',
  'alteration-proofs',
  false,
  5242880,
  ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

-- Storage Policies for alteration-proofs
DROP POLICY IF EXISTS "alteration_proofs_insert_school_admin" ON storage.objects;
DROP POLICY IF EXISTS "alteration_proofs_select_school_admin" ON storage.objects;
DROP POLICY IF EXISTS "alteration_proofs_select_evenvibe_admin" ON storage.objects;
DROP POLICY IF EXISTS "alteration_proofs_delete_school_admin" ON storage.objects;
DROP POLICY IF EXISTS "alteration_proofs_delete_evenvibe_admin" ON storage.objects;

CREATE POLICY "alteration_proofs_insert_school_admin"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'alteration-proofs'
    AND public.get_my_role() = 'school_admin'::app_role
    AND (storage.foldername(name))[1] = 'schools'
    AND (storage.foldername(name))[2] = public.get_my_school_id()::text
  );

CREATE POLICY "alteration_proofs_select_school_admin"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'alteration-proofs'
    AND public.get_my_role() = 'school_admin'::app_role
    AND (storage.foldername(name))[1] = 'schools'
    AND (storage.foldername(name))[2] = public.get_my_school_id()::text
  );

CREATE POLICY "alteration_proofs_select_evenvibe_admin"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'alteration-proofs'
    AND public.get_my_role() = 'evenvibe_admin'::app_role
  );

CREATE POLICY "alteration_proofs_delete_evenvibe_admin"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'alteration-proofs'
    AND public.get_my_role() = 'evenvibe_admin'::app_role
  );
