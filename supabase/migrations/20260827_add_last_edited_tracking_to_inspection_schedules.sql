-- Same idea as 20260804_add_last_edited_tracking.sql (inspection_reports),
-- applied to inspection_schedules: a single overwritten fact (not a log
-- row) of who most recently edited this schedule entry, shown in the Edit
-- Scheduled Inspection modal. updateSchedule() already sets updated_at on
-- every save; this adds who alongside it.
ALTER TABLE inspection_schedules ADD COLUMN IF NOT EXISTS updated_by text;
ALTER TABLE inspection_schedules ADD COLUMN IF NOT EXISTS updated_by_email text;

NOTIFY pgrst, 'reload schema';
