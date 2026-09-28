-- A combined-document reference number for a PDF that bundles several SKUs'
-- inspection reports into one file (Send Mail's bulk send, the SKU-level
-- export picker's multi-select, QC Reports' "Export All"). Each individual
-- report already has its own real, DB-generated report_no (see
-- 20260730_create_inspection_reports.sql/20260908_change_report_no_format.sql)
-- - this is a SEPARATE reference for the combined document itself, not a
-- client-side list/range of the per-SKU numbers. Every current caller only
-- ever combines reports from one PO into one document (confirmed by
-- tracing every call site), so this is scoped to a PO, not open-ended.
--
-- report_ids_key is a SHA-256 hex digest of the SORTED, comma-joined report
-- id list - fixed-length, index-friendly, and order-independent (picking
-- SKUs A,B,C vs C,B,A must resolve to the same batch). SHA-256 (not MD5) is
-- what the client can actually compute natively via the browser's
-- SubtleCrypto API with no extra dependency - MD5 isn't exposed by it. Its
-- UNIQUE constraint is what
-- makes get-or-create idempotent: re-exporting/re-previewing the exact same
-- set of reports always returns the same batch_no instead of minting a new
-- one every click; a genuinely different selection gets its own number.
--
-- No RLS - matches every sibling table in this feature area (see
-- 20260804_disable_rls_inspection_report_photos.sql,
-- 20260907_create_po_comment_photos.sql): this app authenticates with the
-- anon/publishable key and enforces access control at the application
-- layer, not in Postgres. Disabled explicitly rather than left unset, to
-- guard against the same "dashboard default enabled it" issue that bit
-- inspection_report_photos.

CREATE SEQUENCE IF NOT EXISTS inspection_batch_no_seq;

CREATE TABLE IF NOT EXISTS inspection_report_batches (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_no        text UNIQUE NOT NULL DEFAULT ('TWFCMB' || nextval('inspection_batch_no_seq')::text),
  report_ids_key  text UNIQUE NOT NULL,
  report_ids      uuid[] NOT NULL,
  po_id           uuid REFERENCES purchase_orders(id),
  created_by      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inspection_report_batches_po_id ON inspection_report_batches(po_id);

ALTER TABLE inspection_report_batches DISABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
