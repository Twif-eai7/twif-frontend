-- Permanent record of every time a report was submitted as Plan Aborted.
--
-- Why: inspection_reports keeps only the CURRENT result. When a Plan Aborted
-- report is later converted to Accepted (bulk Accept, a resubmit, a stray
-- overwrite) the fact that it was ever Plan Aborted vanished from every
-- screen. This table is written by the database itself, is append-only, and
-- feeds the Activity Log "Was Plan Aborted" row and the QC Reports "Previous
-- Result" column, so a Plan Aborted stays visible after it is converted.
--
-- No FK to inspection_reports on purpose (survives a report being deleted).
-- Readable by signed-in users (the app shows it); writable only by the trigger
-- (SECURITY DEFINER). No UPDATE/DELETE policy = nobody can edit or remove rows
-- through the API. The insert is best-effort so it can never block a real write.

CREATE TABLE IF NOT EXISTS inspection_plan_aborted_log (
  id               bigserial PRIMARY KEY,
  report_id        uuid NOT NULL,
  po_line_item_id  uuid,
  inspection_type  text,
  round            integer,
  result           text NOT NULL DEFAULT 'plan_aborted',
  actor_name       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  source           text NOT NULL DEFAULT 'trigger'
);
CREATE INDEX IF NOT EXISTS idx_ipal_line_item ON inspection_plan_aborted_log (po_line_item_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ipal_report ON inspection_plan_aborted_log (report_id);
ALTER TABLE inspection_plan_aborted_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ipal_read ON inspection_plan_aborted_log;
CREATE POLICY ipal_read ON inspection_plan_aborted_log FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION log_inspection_plan_aborted() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    IF NEW.status = 'submitted' AND NEW.inspection_result = 'plan_aborted' THEN
      INSERT INTO inspection_plan_aborted_log (report_id, po_line_item_id, inspection_type, round, actor_name)
      VALUES (NEW.id, NEW.po_line_item_id, NEW.inspection_type, NEW.round, COALESCE(NEW.updated_by, NEW.created_by, 'unknown'));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ipal_insert ON inspection_reports;
CREATE TRIGGER trg_ipal_insert AFTER INSERT ON inspection_reports
  FOR EACH ROW EXECUTE FUNCTION log_inspection_plan_aborted();

-- Only when it BECOMES submitted Plan Aborted (not on every later edit).
DROP TRIGGER IF EXISTS trg_ipal_update ON inspection_reports;
CREATE TRIGGER trg_ipal_update AFTER UPDATE ON inspection_reports
  FOR EACH ROW
  WHEN (NEW.status = 'submitted' AND NEW.inspection_result = 'plan_aborted'
        AND (OLD.status IS DISTINCT FROM 'submitted' OR OLD.inspection_result IS DISTINCT FROM 'plan_aborted'))
  EXECUTE FUNCTION log_inspection_plan_aborted();

-- Backfill 1: every report that is Plan Aborted right now.
INSERT INTO inspection_plan_aborted_log (report_id, po_line_item_id, inspection_type, round, actor_name, created_at, source)
SELECT r.id, r.po_line_item_id, r.inspection_type, r.round, COALESCE(r.updated_by, r.created_by, 'unknown'),
       COALESCE(r.submitted_at, r.updated_at), 'backfill'
FROM inspection_reports r
WHERE r.status = 'submitted' AND r.inspection_result = 'plan_aborted'
  AND NOT EXISTS (SELECT 1 FROM inspection_plan_aborted_log l WHERE l.report_id = r.id);

-- Backfill 2: reports that WERE Plan Aborted and have since changed (from the
-- 19 Sept history table). Skips any report already logged above.
INSERT INTO inspection_plan_aborted_log (report_id, po_line_item_id, inspection_type, round, actor_name, created_at, source)
SELECT DISTINCT ON (h.report_id) h.report_id, h.po_line_item_id, h.inspection_type, h.round,
       CASE WHEN h.changed_by = 'baseline' THEN 'unknown' ELSE h.changed_by END,
       COALESCE(h.new_submitted_at, h.changed_at), 'backfill'
FROM inspection_report_result_history h
WHERE h.new_status = 'submitted' AND h.new_result = 'plan_aborted'
  AND NOT EXISTS (SELECT 1 FROM inspection_plan_aborted_log l WHERE l.report_id = h.report_id)
ORDER BY h.report_id, h.changed_at;

NOTIFY pgrst, 'reload schema';

-- Rollback: DROP TRIGGER trg_ipal_insert ON inspection_reports; DROP TRIGGER trg_ipal_update ON inspection_reports;
--           DROP FUNCTION log_inspection_plan_aborted(); DROP TABLE inspection_plan_aborted_log;
