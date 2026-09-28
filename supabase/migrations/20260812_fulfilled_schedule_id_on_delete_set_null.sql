-- inspection_reports.fulfilled_schedule_id had no ON DELETE behavior, so it
-- defaulted to NO ACTION: deleting an inspection_schedules row that any
-- report (even an abandoned draft) referenced would fail with a foreign key
-- violation. The "Delete Permanently" button on Inspection Schedule needs to
-- actually be able to delete a row regardless of whether some report once
-- pointed at it -- that link is just bookkeeping for the auto-reschedule
-- feature and becomes moot once the schedule row itself is gone, so ON
-- DELETE SET NULL is the right behavior here, not blocking the delete.

ALTER TABLE inspection_reports DROP CONSTRAINT IF EXISTS inspection_reports_fulfilled_schedule_id_fkey;
ALTER TABLE inspection_reports ADD CONSTRAINT inspection_reports_fulfilled_schedule_id_fkey
  FOREIGN KEY (fulfilled_schedule_id) REFERENCES inspection_schedules(id) ON DELETE SET NULL;

NOTIFY pgrst, 'reload schema';
