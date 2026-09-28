-- Tech Enhancement Request (TER), brought in-app from the external Google
-- Form. Requesters submit and track their own rows; IT/Tech staff triage
-- every row via a second "All Requests" view. No RLS, matching every other
-- domain table in this app (access control is enforced at the app layer via
-- department checks, not in Postgres).

CREATE TABLE IF NOT EXISTS tech_enhancement_requests (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_member_id  uuid NOT NULL REFERENCES organization_members(id),
  title                   text NOT NULL,
  description             text NOT NULL,
  priority                text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  status                  text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'in_review', 'in_progress', 'done', 'rejected')),
  attachment_url          text,
  resolution_comment      text,
  created_at              timestamptz DEFAULT now(),
  updated_at              timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tech_enhancement_requests_member_id ON tech_enhancement_requests(organization_member_id);

NOTIFY pgrst, 'reload schema';
