-- Storage bucket for optional attachments on a Tech Enhancement Request.
-- storage.objects always has RLS enabled and denies everything until a bucket
-- policy exists, so this clones the permissive bucket-scoped policy created
-- for irf-attachments in 20260806_irf_attachments_bucket_policy.sql.

INSERT INTO storage.buckets (id, name, public)
  VALUES ('tech-enhancement-attachments', 'tech-enhancement-attachments', true)
  ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "tech_enhancement_attachments_bucket_all" ON storage.objects;
CREATE POLICY "tech_enhancement_attachments_bucket_all"
  ON storage.objects
  FOR ALL
  USING (bucket_id = 'tech-enhancement-attachments')
  WITH CHECK (bucket_id = 'tech-enhancement-attachments');
