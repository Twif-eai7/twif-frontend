-- Overall Result at Sign-off widens from a hard Accepted/Rejected binary to
-- the 10 statuses the legacy inspection system used (a mix of in-process
-- workflow states and final quality verdicts). Existing 'accepted'/'rejected'
-- rows remain valid under the new constraint -- no data migration needed.

ALTER TABLE inspection_reports DROP CONSTRAINT IF EXISTS inspection_reports_inspection_result_check;
ALTER TABLE inspection_reports ADD CONSTRAINT inspection_reports_inspection_result_check
  CHECK (inspection_result IN (
    'making_a_plan', 'plan_ready', 'plan_aborted', 'feedback_inprogress',
    'accepted', 'partially_accepted', 'accepted_with_deviations', 'rejected', 'resubmit', 'on_hold'
  ));

NOTIFY pgrst, 'reload schema';
