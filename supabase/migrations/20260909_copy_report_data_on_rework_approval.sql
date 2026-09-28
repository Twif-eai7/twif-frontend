-- Rework approval used to start the new round completely blank (only
-- po_line_item_id/inspection_type/round/status/created_by set, every real
-- field left at its table default) - a reviewer had to re-type every
-- packaging/measurement/barcode/workmanship finding and re-upload every
-- photo from scratch, even though rework is specifically for an
-- already-accepted stage (see getReworkableStage in stageStatus.jsx) where
-- none of that factual data is actually in question - only the sign-off/
-- verdict itself is what's being redone.
--
-- Now copies every objective/factual field from the report being reworked
-- into the new draft round (inspection details, packaging appearance,
-- measurements, barcodes, on-site tests, workmanship notes/defects,
-- quantities, attachments, and photos) so the new round opens pre-filled
-- and editable - the reviewer corrects/verifies rather than starting over.
-- The sign-off itself resets to blank (status stays 'draft',
-- inspection_result/submitted_at/remarks/signatures/last_step all null)
-- since this round still needs its own fresh verdict. The original
-- submitted round this copies FROM is never touched - still there, still
-- complete, exactly as before.
--
-- Also links the new round to its own fresh schedule entry via
-- fulfilled_schedule_id (the prior version left this null, same gap
-- InspectionForm.jsx's own startReInspection() had until it was fixed to
-- take an explicit fulfilled_schedule_id) - without it this round reads as
-- "nothing started yet" everywhere that checks fulfilled_schedule_id
-- (Inspection Schedule's processing badge, InspectionScheduleForm.jsx's own
-- scheduledSkuInfo) even once someone's genuinely begun reworking it.
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
    v_new_round := (v_item->>'round')::integer + 1;

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
