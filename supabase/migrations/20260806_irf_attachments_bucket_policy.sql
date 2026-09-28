-- Storage bucket for PO documents attached to an Inspection Request.
-- storage.objects always has RLS enabled and denies everything until a bucket
-- policy exists, so this clones the permissive bucket-scoped policy created
-- for inspection-reports in 20260804_inspection_reports_bucket_storage_policy.sql.

INSERT INTO storage.buckets (id, name, public)
  VALUES ('irf-attachments', 'irf-attachments', true)
  ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "irf_attachments_bucket_all" ON storage.objects;
CREATE POLICY "irf_attachments_bucket_all"
  ON storage.objects
  FOR ALL
  USING (bucket_id = 'irf-attachments')
  WITH CHECK (bucket_id = 'irf-attachments');
