-- Two lightweight, overwritten facts (not log rows) powering the live
-- per-stage status row: who/when last touched the record at all (any save,
-- including autosave), and which of the 9 form steps that save happened on.
-- Deliberately separate from inspection_report_logs, which only records
-- meaningful lifecycle transitions.
ALTER TABLE inspection_reports ADD COLUMN IF NOT EXISTS updated_by text;
ALTER TABLE inspection_reports ADD COLUMN IF NOT EXISTS last_step text;

NOTIFY pgrst, 'reload schema';
