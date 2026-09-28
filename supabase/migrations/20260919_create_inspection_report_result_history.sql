-- Permanent, tamper-evident history of every change to a report's status or
-- result, written by the database itself so it catches EVERY writer (the
-- wizard, autosave, offline sync, Overview bulk Accept/status, an old open
-- browser tab, manual SQL) - not just the code paths that remember to log.
--
-- Why this exists: inspection_reports only keeps the CURRENT result, and the
-- app-level inspection_report_logs never recorded what the result was (its
-- `result` column was never applied in production). So when a QA says "I put
-- this SKU On Hold and it is Accepted now", nothing could prove what changed,
-- when, or who did it. With this table that becomes one query.
--
-- old_submitted_at vs new_submitted_at is the key signal: a real Submit always
-- stamps a new submitted_at. A result that changed while submitted_at stayed
-- the same was NOT a Submit - it is exactly the silent flip worth reviewing.
--
-- No FK to inspection_reports on purpose: history must survive a report row
-- being deleted (e.g. a mistaken reopened round removed by a data correction).
-- RLS is enabled with no policies (anon/authenticated cannot read it); the
-- trigger function is SECURITY DEFINER so it can still write. The insert is
-- wrapped so a history failure can never block the real write.

CREATE TABLE IF NOT EXISTS inspection_report_result_history (
  id                bigserial PRIMARY KEY,
  report_id         uuid NOT NULL,
  po_line_item_id   uuid,
  inspection_type   text,
  round             integer,
  old_status        text,
  new_status        text,
  old_result        text,
  new_result        text,
  old_submitted_at  timestamptz,
  new_submitted_at  timestamptz,
  changed_by        text,
  changed_at        timestamptz NOT NULL DEFAULT now(),
  source            text NOT NULL DEFAULT 'trigger'
);
CREATE INDEX IF NOT EXISTS idx_irrh_report ON inspection_report_result_history (report_id, changed_at);
CREATE INDEX IF NOT EXISTS idx_irrh_changed_at ON inspection_report_result_history (changed_at);
ALTER TABLE inspection_report_result_history ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION log_inspection_report_result_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    IF TG_OP = 'INSERT' THEN
      INSERT INTO inspection_report_result_history
        (report_id, po_line_item_id, inspection_type, round, old_status, new_status, old_result, new_result, old_submitted_at, new_submitted_at, changed_by)
      VALUES
        (NEW.id, NEW.po_line_item_id, NEW.inspection_type, NEW.round, NULL, NEW.status, NULL, NEW.inspection_result, NULL, NEW.submitted_at, COALESCE(NEW.updated_by, NEW.created_by));
    ELSE
      INSERT INTO inspection_report_result_history
        (report_id, po_line_item_id, inspection_type, round, old_status, new_status, old_result, new_result, old_submitted_at, new_submitted_at, changed_by)
      VALUES
        (NEW.id, NEW.po_line_item_id, NEW.inspection_type, NEW.round, OLD.status, NEW.status, OLD.inspection_result, NEW.inspection_result, OLD.submitted_at, NEW.submitted_at, COALESCE(NEW.updated_by, 'unknown'));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL; -- history is best-effort: never block the real write
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_irrh_insert ON inspection_reports;
CREATE TRIGGER trg_irrh_insert AFTER INSERT ON inspection_reports
  FOR EACH ROW EXECUTE FUNCTION log_inspection_report_result_change();

DROP TRIGGER IF EXISTS trg_irrh_update ON inspection_reports;
CREATE TRIGGER trg_irrh_update AFTER UPDATE ON inspection_reports
  FOR EACH ROW
  WHEN (OLD.inspection_result IS DISTINCT FROM NEW.inspection_result OR OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION log_inspection_report_result_change();

-- One-time baseline so every existing report has a starting row to diff against.
INSERT INTO inspection_report_result_history
  (report_id, po_line_item_id, inspection_type, round, old_status, new_status, old_result, new_result, old_submitted_at, new_submitted_at, changed_by, source)
SELECT r.id, r.po_line_item_id, r.inspection_type, r.round, NULL, r.status, NULL, r.inspection_result, NULL, r.submitted_at, 'baseline', 'baseline'
FROM inspection_reports r
WHERE NOT EXISTS (SELECT 1 FROM inspection_report_result_history h WHERE h.report_id = r.id);

NOTIFY pgrst, 'reload schema';

-- ── Detector: run any time someone says "I put it On Hold and it became Accepted" ──
-- On Hold / Plan Aborted / Feedback in Progress that turned into a verdict:
--   SELECT (h.changed_at AT TIME ZONE 'Asia/Kolkata') AS changed_at_ist, po.po_number, li.buyer_sku_ref,
--          h.inspection_type, h.round, h.old_result, h.new_result, h.changed_by,
--          (h.old_submitted_at IS NOT DISTINCT FROM h.new_submitted_at) AS no_real_submit
--   FROM inspection_report_result_history h
--   JOIN po_line_items li ON li.id = h.po_line_item_id
--   JOIN purchase_orders po ON po.id = li.po_id
--   WHERE h.old_result IN ('on_hold', 'plan_aborted', 'feedback_inprogress')
--     AND h.new_result IN ('accepted', 'accepted_with_deviations', 'partially_accepted', 'rejected')
--   ORDER BY h.changed_at DESC;
-- Any result change on an already-submitted report:
--   ... WHERE h.old_status = 'submitted' AND h.old_result IS DISTINCT FROM h.new_result ORDER BY h.changed_at DESC;

-- ── Rollback, if ever needed ──
--   DROP TRIGGER IF EXISTS trg_irrh_insert ON inspection_reports;
--   DROP TRIGGER IF EXISTS trg_irrh_update ON inspection_reports;
--   DROP FUNCTION IF EXISTS log_inspection_report_result_change();
