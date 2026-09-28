-- inspection_report_logs already wrote a 'submitted' event on every
-- submission, but never captured what the result actually WAS at that
-- moment - only event_type/actor_name/round. A report submitted with a
-- non-verdict result (Plan Aborted, On Hold - deliberately excluded from
-- VERDICT_RESULTS so it stays editable) that later gets reopened and
-- resubmitted with a real verdict is an in-place UPDATE on the SAME row -
-- no new round, so the prior result vanished with no trace anywhere the
-- moment it was overwritten.
--
-- result is nullable and only meaningful on 'submitted' events (draft_saved
-- has no verdict yet) - existing rows stay null, this only prevents the
-- loss going forward, it can't retroactively recover a transition that
-- already happened before this shipped.
ALTER TABLE inspection_report_logs ADD COLUMN IF NOT EXISTS result text;

NOTIFY pgrst, 'reload schema';
