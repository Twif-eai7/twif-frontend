-- Caches a generated inspection-report export (Preview/Download/Send Mail's
-- attachment, QC Reports' Export All) so re-exporting the exact same set of
-- reports doesn't rebuild from scratch - see shopify-backend's
-- routes/inspectionSchedule.js POST /generate-pdf. Building one is real
-- work (every original photo has to be fetched fresh from Storage before it
-- can be laid onto a page), so a first-time export always takes real time
-- proportional to photo count - this only helps a REPEAT of the identical
-- set (someone re-downloading, or Preview then Download of the same
-- reports later) reuse the already-built file instead of paying that cost
-- again.
--
-- report_ids_key - same SHA-256-of-sorted-ids convention as
-- inspection_report_batches (20260917_create_inspection_report_batches.sql)
-- - order-independent, fixed-length, index-friendly.
--
-- mode - 'preview' and 'final' are cached separately (different quality/
-- split/batch-number rules - see generateInspectionReportPdf's own doc) -
-- part of the uniqueness key, not a filter on one shared row.
--
-- source_max_updated_at - the freshest updated_at across the batch's own
-- reports AND created_at across their photos, snapshotted at generation
-- time. A cache hit is only used when this still matches the CURRENT
-- freshest value for that same report set - if any report's fields changed,
-- or a photo was added, since this was generated, the cache is treated as
-- stale and a fresh export is built (and this row overwritten), rather than
-- silently serving outdated content.
--
-- No RLS: unlike inspection_report_batches, this table is only ever read/
-- written by the backend's own service-role client - never called by the
-- frontend directly - so it's left at Postgres's default (enabled, no
-- policies), which blocks anon/authenticated access outright rather than
-- needing to be explicitly disabled.

CREATE TABLE IF NOT EXISTS inspection_report_exports (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_ids_key          text NOT NULL,
  mode                    text NOT NULL,
  url                     text NOT NULL,
  path                    text NOT NULL,
  filename                text NOT NULL,
  is_zip                  boolean NOT NULL DEFAULT false,
  size                    bigint NOT NULL,
  part_count              int NOT NULL DEFAULT 1,
  source_max_updated_at   timestamptz NOT NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (report_ids_key, mode)
);

NOTIFY pgrst, 'reload schema';
