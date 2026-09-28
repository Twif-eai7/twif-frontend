-- A QA requests permission to redo a SKU's already-accepted, currently-
-- furthest inspection stage (something the wizard otherwise locks forever
-- once submitted) - a QA admin reviews and approves/rejects it. One row per
-- request, covering a whole checked batch of SKUs at once (a batch can mix
-- SKUs currently sitting at different furthest stages) - `items` captures
-- exactly which submitted report (stage + round) is being reworked per SKU,
-- so approval knows precisely what to reset even if other reports for the
-- same SKU change in the meantime.
CREATE TABLE IF NOT EXISTS inspection_rework_requests (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id               uuid NOT NULL REFERENCES purchase_orders(id),
  items               jsonb NOT NULL, -- [{ po_line_item_id, inspection_type, round, report_id }, ...]
  reason              text NOT NULL,
  status              text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_by        text,
  requested_by_email  text,
  -- inspection_schedules.assigned_qa_id is NOT NULL, so approval's new
  -- schedule entry (below) can't be left unassigned - defaults to whoever
  -- requested the rework, the person presumably redoing it.
  requested_by_member_id uuid REFERENCES organization_members(id),
  requested_at        timestamptz NOT NULL DEFAULT now(),
  reviewed_by         text,
  reviewed_by_email   text,
  reviewed_at         timestamptz,
  review_note         text,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inspection_rework_requests_po_id ON inspection_rework_requests(po_id);
CREATE INDEX IF NOT EXISTS idx_inspection_rework_requests_status ON inspection_rework_requests(status);

-- Approving a request is multi-effect per SKU in its `items` array - a
-- fresh draft round (same shape InspectionForm.jsx's own startReInspection()
-- builds for the existing rejected-Final auto-reinspection flow), its own
-- audit-log line, and a fresh schedule entry so the SKU actually resurfaces
-- as "needing inspection" again (mirrors InspectionForm.jsx's own "re-book
-- the shortfall as a new entry" step right after startReInspection() -
-- without a live schedule entry a reset SKU would have nothing for
-- activeScheduleEntry/assignedQaName to resolve from and wouldn't show up
-- anywhere as pending work). Done as one Postgres function so a partial
-- failure partway through a multi-SKU batch can't leave some SKUs reset and
-- others not, the same reasoning apply_line_item_cancellation already
-- exists for OTIF's own multi-effect approval. The new schedule entry is
-- assigned to the original requesting QA (inspection_schedules.assigned_qa_id
-- is NOT NULL, so it can't be left unassigned; the requester is the person
-- who presumably wants to redo it).
CREATE OR REPLACE FUNCTION approve_inspection_rework(
  p_request_id uuid,
  p_reviewed_by text,
  p_reviewed_by_email text
) RETURNS void AS $$
DECLARE
  v_request inspection_rework_requests;
  v_item jsonb;
  v_new_round integer;
  v_new_report_id uuid;
  v_qty numeric;
BEGIN
  SELECT * INTO v_request FROM inspection_rework_requests WHERE id = p_request_id AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rework request % is not pending (already reviewed, or does not exist)', p_request_id;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_request.items)
  LOOP
    v_new_round := (v_item->>'round')::integer + 1;

    INSERT INTO inspection_reports (po_line_item_id, inspection_type, round, status, created_by)
    VALUES ((v_item->>'po_line_item_id')::uuid, v_item->>'inspection_type', v_new_round, 'draft', p_reviewed_by)
    RETURNING id INTO v_new_report_id;

    INSERT INTO inspection_report_logs (report_id, po_line_item_id, inspection_type, round, event_type, actor_name, reason)
    VALUES (v_new_report_id, (v_item->>'po_line_item_id')::uuid, v_item->>'inspection_type', v_new_round,
            'reinspection_started', p_reviewed_by, 'Rework approved: ' || v_request.reason);

    SELECT quantity_ordered INTO v_qty FROM po_line_items WHERE id = (v_item->>'po_line_item_id')::uuid;

    INSERT INTO inspection_schedules (po_id, inspection_type, scheduled_date, assigned_qa_id, status, line_items, created_by, created_by_email)
    VALUES (v_request.po_id, v_item->>'inspection_type', CURRENT_DATE, v_request.requested_by_member_id, 'scheduled',
            jsonb_build_array(jsonb_build_object('id', v_item->>'po_line_item_id', 'quantity', coalesce(v_qty, 0))),
            p_reviewed_by, p_reviewed_by_email);
  END LOOP;

  UPDATE inspection_rework_requests
  SET status = 'approved', reviewed_by = p_reviewed_by, reviewed_by_email = p_reviewed_by_email, reviewed_at = now()
  WHERE id = p_request_id;
END;
$$ LANGUAGE plpgsql;

NOTIFY pgrst, 'reload schema';
