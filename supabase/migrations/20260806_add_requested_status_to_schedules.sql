-- Links an IRF submission straight onto the Inspection Schedule calendar as a
-- 'requested' entry, which QA then converts to 'scheduled' by assigning a QA
-- member. Extending the existing table (rather than adding a parallel one)
-- is what keeps request -> schedule a single record with no re-keying.

ALTER TABLE inspection_schedules
  ADD COLUMN IF NOT EXISTS request_id uuid REFERENCES inspection_requests(id);

-- A requested entry has no QA assigned yet; one is set when it becomes 'scheduled'.
ALTER TABLE inspection_schedules ALTER COLUMN assigned_qa_id DROP NOT NULL;

ALTER TABLE inspection_schedules DROP CONSTRAINT IF EXISTS inspection_schedules_status_check;
ALTER TABLE inspection_schedules ADD CONSTRAINT inspection_schedules_status_check
  CHECK (status IN ('requested', 'scheduled', 'completed', 'cancelled'));

NOTIFY pgrst, 'reload schema';
