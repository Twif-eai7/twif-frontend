-- Activity log for inspection_reports: records meaningful lifecycle
-- transitions (first draft save, submission, post-submission edit,
-- re-inspection start) -- NOT an autosave trail. po_line_item_id and
-- inspection_type/round are denormalized from the parent report row so a
-- SKU's combined timeline across all 3 stages (and all rounds) can be
-- fetched with one filter, no join needed.

CREATE TABLE IF NOT EXISTS inspection_report_logs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id         uuid NOT NULL REFERENCES inspection_reports(id) ON DELETE CASCADE,
  po_line_item_id   uuid NOT NULL REFERENCES po_line_items(id),
  inspection_type   text NOT NULL CHECK (inspection_type IN ('inline', 'midline', 'final')),
  round             integer NOT NULL DEFAULT 1,
  event_type        text NOT NULL CHECK (event_type IN ('draft_saved', 'submitted', 'edited', 'reinspection_started')),
  actor_name        text,
  reason            text,   -- required for 'edited' and 'reinspection_started'
  created_at        timestamptz DEFAULT now(),
  CHECK (event_type NOT IN ('edited', 'reinspection_started') OR (reason IS NOT NULL AND length(btrim(reason)) > 0))
);
CREATE INDEX IF NOT EXISTS idx_inspection_report_logs_po_line_item_id ON inspection_report_logs(po_line_item_id);
CREATE INDEX IF NOT EXISTS idx_inspection_report_logs_report_id ON inspection_report_logs(report_id);

-- Multi-round support for Final only in practice (Inline/Midline always stay
-- round 1), added at the inspection_reports level so the same UNIQUE
-- constraint mechanics apply uniformly. IF NOT EXISTS / dynamic lookup below
-- make this whole block safe to re-run if a prior attempt partially failed.
ALTER TABLE inspection_reports ADD COLUMN IF NOT EXISTS round integer NOT NULL DEFAULT 1;

DO $$
DECLARE
  old_uq_name text;
BEGIN
  -- Find whatever Postgres actually named the original
  -- UNIQUE(po_line_item_id, inspection_type) constraint, rather than
  -- assuming its default auto-generated name.
  SELECT con.conname INTO old_uq_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'inspection_reports'
    AND con.contype = 'u'
    AND (
      SELECT array_agg(a.attname::text ORDER BY a.attname)
      FROM unnest(con.conkey) AS k(attnum)
      JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum
    ) = ARRAY['inspection_type', 'po_line_item_id']::text[];

  IF old_uq_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE inspection_reports DROP CONSTRAINT %I', old_uq_name);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'inspection_reports'::regclass
      AND conname = 'inspection_reports_po_line_item_id_inspection_type_round_key'
  ) THEN
    ALTER TABLE inspection_reports ADD CONSTRAINT inspection_reports_po_line_item_id_inspection_type_round_key
      UNIQUE (po_line_item_id, inspection_type, round);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
