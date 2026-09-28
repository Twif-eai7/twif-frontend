-- Add a fourth status, "declined", alongside submitted/accepted/done — a
-- request the TER approver doesn't want to build, distinct from "done".
-- Reachable via the new "Decline" button on the Admin Approvals page.

ALTER TABLE tech_enhancement_requests
  DROP CONSTRAINT IF EXISTS tech_enhancement_requests_status_check;

ALTER TABLE tech_enhancement_requests
  ADD CONSTRAINT tech_enhancement_requests_status_check
  CHECK (status IN ('submitted', 'accepted', 'done', 'declined'));

NOTIFY pgrst, 'reload schema';
