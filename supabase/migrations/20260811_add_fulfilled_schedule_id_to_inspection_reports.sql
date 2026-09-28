-- Links a report to the specific inspection_schedules entry it's fulfilling,
-- set once at report-creation time (never re-resolved later, so it can't
-- drift if new schedule entries get added for the same PO+stage afterward).
-- Nullable: ad-hoc inspections with no matching schedule entry leave this
-- null and are unaffected by the auto-reschedule-on-shortfall feature that
-- reads it.
ALTER TABLE inspection_reports ADD COLUMN IF NOT EXISTS fulfilled_schedule_id uuid REFERENCES inspection_schedules(id);

NOTIFY pgrst, 'reload schema';
