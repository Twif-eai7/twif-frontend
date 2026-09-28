-- approve_inspection_rework computed the new round as simply "the round
-- captured on the rework request at REQUEST time, plus 1" - a rework
-- request can sit pending for a while before it's reviewed, and if
-- anything else creates a newer round for that same SKU/stage in the
-- meantime (another re-inspection, another rework approval, an offline
-- sync landing late), that captured number is stale by approval time and
-- collides with a round that already exists - inspection_reports'
-- (po_line_item_id, inspection_type, round) unique constraint then rejects
-- the insert, and the whole approval fails with a raw Postgres error
-- surfaced straight to the reviewer ("duplicate key value violates unique
-- constraint...").
--
-- Fixed to always compute the new round from the CURRENT actual max round
-- for that SKU/stage at approval time (falling back to the request's own
-- captured round only if, somehow, no rows exist yet for it) - this can
-- only ever land on a round number that's genuinely free, regardless of
-- how stale the request's own snapshot has become.
CREATE OR REPLACE FUNCTION approve_inspection_rework(
  p_request_id uuid,
  p_reviewed_by text,
  p_reviewed_by_email text
) RETURNS void AS $$
DECLARE
  v_request inspection_rework_requests;
  v_item jsonb;
  v_old_report inspection_reports;
  v_new_round integer;
  v_new_report_id uuid;
  v_new_schedule_id uuid;
  v_qty numeric;
BEGIN
  SELECT * INTO v_request FROM inspection_rework_requests WHERE id = p_request_id AND status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rework request % is not pending (already reviewed, or does not exist)', p_request_id;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_request.items)
  LOOP
    -- Always derived from the CURRENT max round for this exact SKU/stage,
    -- not the request's own possibly-stale captured round - see this
    -- migration's own header comment for the race this closes.
    SELECT COALESCE(MAX(round), (v_item->>'round')::integer) + 1
    INTO v_new_round
    FROM inspection_reports
    WHERE po_line_item_id = (v_item->>'po_line_item_id')::uuid
      AND inspection_type = v_item->>'inspection_type';

    SELECT * INTO v_old_report FROM inspection_reports WHERE id = (v_item->>'report_id')::uuid;

    SELECT quantity_ordered INTO v_qty FROM po_line_items WHERE id = (v_item->>'po_line_item_id')::uuid;

    INSERT INTO inspection_schedules (po_id, inspection_type, scheduled_date, assigned_qa_id, status, line_items, created_by, created_by_email)
    VALUES (v_request.po_id, v_item->>'inspection_type', CURRENT_DATE, v_request.requested_by_member_id, 'scheduled',
            jsonb_build_array(jsonb_build_object('id', v_item->>'po_line_item_id', 'quantity', coalesce(v_qty, 0))),
            p_reviewed_by, p_reviewed_by_email)
    RETURNING id INTO v_new_schedule_id;

    INSERT INTO inspection_reports (
      po_line_item_id, inspection_type, round, status, created_by, fulfilled_schedule_id,
      inspector_name, arrival_time, start_time, complete_time, contact, inspection_date, ship_via,
      inspected_qty, accepted_quantity, carton_available, available_quantity,
      packaging_appearance, packaging_measurement_findings, barcode_results, onsite_tests,
      workmanship_inspection_level, workmanship_sample_size, aql_critical, aql_major, aql_minor, workmanship_remarks,
      attachments
    )
    VALUES (
      (v_item->>'po_line_item_id')::uuid, v_item->>'inspection_type', v_new_round, 'draft', p_reviewed_by, v_new_schedule_id,
      v_old_report.inspector_name, v_old_report.arrival_time, v_old_report.start_time, v_old_report.complete_time,
      v_old_report.contact, v_old_report.inspection_date, v_old_report.ship_via,
      v_old_report.inspected_qty, v_old_report.accepted_quantity, v_old_report.carton_available, v_old_report.available_quantity,
      coalesce(v_old_report.packaging_appearance, '{}'::jsonb), coalesce(v_old_report.packaging_measurement_findings, '{}'::jsonb),
      coalesce(v_old_report.barcode_results, '{}'::jsonb), coalesce(v_old_report.onsite_tests, '{}'::jsonb),
      v_old_report.workmanship_inspection_level, v_old_report.workmanship_sample_size,
      v_old_report.aql_critical, v_old_report.aql_major, v_old_report.aql_minor, v_old_report.workmanship_remarks,
      coalesce(v_old_report.attachments, '[]'::jsonb)
    )
    RETURNING id INTO v_new_report_id;

    -- Workmanship defect rows and Digitals photos are separate child
    -- tables - duplicated (new rows; photos reference the SAME
    -- storage_path, no file is re-uploaded/duplicated in storage) rather
    -- than moved, so the original round's own defects/photos stay exactly
    -- where they are too.
    INSERT INTO inspection_report_defects (report_id, defect_description, critical_count, major_count, minor_count, remarks)
    SELECT v_new_report_id, defect_description, critical_count, major_count, minor_count, remarks
    FROM inspection_report_defects WHERE report_id = v_old_report.id;

    INSERT INTO inspection_report_photos (report_id, storage_path, caption, sort_order)
    SELECT v_new_report_id, storage_path, caption, sort_order
    FROM inspection_report_photos WHERE report_id = v_old_report.id;

    INSERT INTO inspection_report_logs (report_id, po_line_item_id, inspection_type, round, event_type, actor_name, reason)
    VALUES (v_new_report_id, (v_item->>'po_line_item_id')::uuid, v_item->>'inspection_type', v_new_round,
            'reinspection_started', p_reviewed_by, 'Rework approved: ' || v_request.reason);
  END LOOP;

  UPDATE inspection_rework_requests
  SET status = 'approved', reviewed_by = p_reviewed_by, reviewed_by_email = p_reviewed_by_email, reviewed_at = now()
  WHERE id = p_request_id;
END;
$$ LANGUAGE plpgsql;

NOTIFY pgrst, 'reload schema';
