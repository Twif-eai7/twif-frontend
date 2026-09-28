-- inspection_report_photos was somehow left with Row Level Security enabled
-- (not set by any tracked migration -- likely a dashboard default when the
-- table was created), rejecting every insert with "new row violates
-- row-level security policy" since this app authenticates with the anon/
-- publishable key and has no RLS policies defined for this domain. Its
-- sibling tables (inspection_reports, inspection_report_defects) never had
-- RLS enabled and work fine -- access control here is enforced at the
-- application layer (canManage/canComment), not in Postgres. Disabling RLS
-- brings this table back in line with its siblings.

ALTER TABLE inspection_report_photos DISABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
