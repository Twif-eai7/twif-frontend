-- Adds 'ppm' (Pre-Production Meeting) as a schedulable inspection_type,
-- alongside the existing inline/midline/final. Schedule-side only -- this
-- does not touch inspection_reports.inspection_type or the wizard/gating
-- system, which still only knows inline/midline/final; a PPM entry can be
-- planned and shown on the calendar, but has no report/wizard of its own yet.

ALTER TABLE inspection_schedules DROP CONSTRAINT IF EXISTS inspection_schedules_inspection_type_check;
ALTER TABLE inspection_schedules ADD CONSTRAINT inspection_schedules_inspection_type_check
  CHECK (inspection_type IN ('ppm', 'inline', 'midline', 'final'));

NOTIFY pgrst, 'reload schema';
