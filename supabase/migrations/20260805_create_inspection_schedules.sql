-- Inspection Schedule feature: lets QA/Tech staff plan ahead which PO + stage
-- (inline/midline/final) a given QA team member is assigned to inspect on a
-- given date, shown as a calendar. One row per planned visit -- a PO can have
-- several rows (one per stage, or re-scheduled history), so there is no
-- uniqueness constraint on (po_id, inspection_type). No RLS, matching every
-- other domain table in this app (access control is enforced at the app
-- layer via department checks, not in Postgres).

CREATE TABLE IF NOT EXISTS inspection_schedules (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id           uuid NOT NULL REFERENCES purchase_orders(id),
  inspection_type text NOT NULL CHECK (inspection_type IN ('inline', 'midline', 'final')),
  scheduled_date  date NOT NULL,
  assigned_qa_id  uuid NOT NULL REFERENCES organization_members(id),
  status          text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  notes           text,
  created_by      text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inspection_schedules_date  ON inspection_schedules(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_inspection_schedules_po_id ON inspection_schedules(po_id);

NOTIFY pgrst, 'reload schema';
