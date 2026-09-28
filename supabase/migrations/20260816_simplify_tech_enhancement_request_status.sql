-- Simplify TER status to a 3-stage pipeline (submitted -> accepted -> done),
-- driven only by the "Approve" / "Done" buttons on the Admin Approvals page
-- rather than a free-form status dropdown. Priority is now fixed at
-- submission time too (no more in-app editing), so this migration only
-- needs to touch the status CHECK constraint.

ALTER TABLE tech_enhancement_requests
  DROP CONSTRAINT IF EXISTS tech_enhancement_requests_status_check;

-- Map any rows already sitting in a status that no longer exists.
-- in_review/in_progress collapse into the new middle stage, "accepted".
-- rejected has no equivalent stage anymore, so it goes back to "submitted"
-- rather than being silently marked done.
UPDATE tech_enhancement_requests SET status = 'accepted'  WHERE status IN ('in_review', 'in_progress');
UPDATE tech_enhancement_requests SET status = 'submitted' WHERE status = 'rejected';

ALTER TABLE tech_enhancement_requests
  ADD CONSTRAINT tech_enhancement_requests_status_check
  CHECK (status IN ('submitted', 'accepted', 'done'));

NOTIFY pgrst, 'reload schema';
