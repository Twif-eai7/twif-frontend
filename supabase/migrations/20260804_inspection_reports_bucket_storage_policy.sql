-- The earlier "new row violates row-level security policy" fix targeted the
-- wrong table. Uploading a file to Supabase Storage is implemented as an
-- INSERT into storage.objects, which always has RLS enabled (it can't be
-- disabled like a normal table) and denies everything until a bucket policy
-- explicitly allows it. No policy was ever created for the inspection-reports
-- bucket, so every upload was rejected before it ever reached
-- inspection_report_photos. This app authenticates with the anon/publishable
-- key and has no auth-session-based access model for this domain (matching
-- the rest of the inspection_reports tables, which have no RLS at all), so
-- the policy here is intentionally permissive -- scoped only to this bucket.

DROP POLICY IF EXISTS "inspection_reports_bucket_all" ON storage.objects;
CREATE POLICY "inspection_reports_bucket_all"
  ON storage.objects
  FOR ALL
  USING (bucket_id = 'inspection-reports')
  WITH CHECK (bucket_id = 'inspection-reports');
