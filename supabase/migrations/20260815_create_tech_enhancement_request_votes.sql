-- One upvote per member per Tech Enhancement Request, toggleable (a vote is
-- removed by deleting its row rather than flipping a boolean). The unique
-- constraint is what actually enforces "one vote per person", not app logic.
-- No RLS, matching every other domain table in this app (access control is
-- enforced at the app layer via department checks, not in Postgres).

CREATE TABLE IF NOT EXISTS tech_enhancement_request_votes (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id              uuid NOT NULL REFERENCES tech_enhancement_requests(id) ON DELETE CASCADE,
  organization_member_id  uuid NOT NULL REFERENCES organization_members(id),
  created_at              timestamptz DEFAULT now(),
  UNIQUE (request_id, organization_member_id)
);
CREATE INDEX IF NOT EXISTS idx_ter_votes_request_id ON tech_enhancement_request_votes(request_id);

NOTIFY pgrst, 'reload schema';
