-- Fields specific to the /auth/vendor entrance flow: IEC code (replaces ISI code
-- for this entrance only) and the submitter's job title/role at their company.
ALTER TABLE supplier_details ADD COLUMN IF NOT EXISTS iec_code text;
ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS job_title text;
