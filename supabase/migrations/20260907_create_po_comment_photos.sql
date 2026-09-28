-- Photo attachments for po_comments rows - lets PPM/Pilot Run Callouts
-- (CalloutModal.jsx) carry an uploaded image or a live-captured photo
-- alongside their text, same relationship shape inspection_report_photos
-- already has to inspection_reports. po_comments itself has no photo
-- column and predates the tracked migration history, so this is a new
-- companion table rather than an ALTER on it.

CREATE TABLE IF NOT EXISTS po_comment_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL REFERENCES po_comments(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS po_comment_photos_comment_id_idx ON po_comment_photos(comment_id);

-- App-layer access control only, no RLS anywhere in this feature area -
-- matches inspection_report_photos' own precedent exactly (see
-- 20260804_disable_rls_inspection_report_photos.sql).
ALTER TABLE po_comment_photos DISABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
