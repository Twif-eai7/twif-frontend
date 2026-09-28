-- Changes inspection_reports.report_no from the year-stamped, zero-padded
-- "IRF-2026-01194" format (set up in 20260730_create_inspection_reports.sql)
-- to a plain "JNGREP<n>" format - no year, no dashes, no padding.
--
-- Every existing report is renumbered too, chronologically: JNGREP1 is the
-- very first inspection report ever created, counting up in creation order.
-- The existing inspection_report_no_seq sequence is reused (just repointed
-- via setval, not recreated) so new reports created after this migration
-- continue cleanly from the last number assigned below, with no gap or
-- collision.
--
-- report_no's UNIQUE NOT NULL constraint is untouched throughout - every
-- assigned number here is already guaranteed distinct (row_number() over a
-- full ordering of every row), so the constraint never has to reject a
-- collision mid-migration.

WITH ordered AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn
  FROM inspection_reports
)
UPDATE inspection_reports ir
SET report_no = 'JNGREP' || ordered.rn
FROM ordered
WHERE ir.id = ordered.id;

-- Point the sequence at the count just assigned, so the next nextval() call
-- (the very next inspection report created) returns count+1, not a number
-- that collides with one just assigned above.
SELECT setval('inspection_report_no_seq', GREATEST((SELECT count(*) FROM inspection_reports), 1), (SELECT count(*) FROM inspection_reports) > 0);

ALTER TABLE inspection_reports
  ALTER COLUMN report_no SET DEFAULT ('JNGREP' || nextval('inspection_report_no_seq')::text);
