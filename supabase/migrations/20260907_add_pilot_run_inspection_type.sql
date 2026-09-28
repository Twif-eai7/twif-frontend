-- Adds 'pilot_run' as a schedulable inspection_type, alongside the existing
-- ppm/inline/midline/final. Schedule-side only -- this does not touch
-- inspection_reports.inspection_type or the wizard/gating system, which
-- still only knows inline/midline/final; a Pilot Run entry can be planned
-- and shown on the calendar, but has no report/wizard of its own yet
-- (same treatment as 'ppm', see 20260812_add_ppm_inspection_type.sql).

ALTER TABLE inspection_schedules DROP CONSTRAINT IF EXISTS inspection_schedules_inspection_type_check;
ALTER TABLE inspection_schedules ADD CONSTRAINT inspection_schedules_inspection_type_check
  CHECK (inspection_type IN ('ppm', 'pilot_run', 'inline', 'midline', 'final'));

NOTIFY pgrst, 'reload schema';
