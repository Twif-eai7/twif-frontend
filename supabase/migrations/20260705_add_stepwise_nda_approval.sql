-- Explicit step-wise approval workflow for supplier NDAs: Verify (admin reviews the
-- exact PDF that will be sent) -> Sign (JNG countersigns, captured fresh per approval)
-- -> Approve (final; sends the executed PDF to both parties). Each step is gated on
-- the previous one via these columns.
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS nda_verified_at timestamptz;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS nda_verified_by text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS jng_signature_type text; -- 'typed' | 'drawn' | 'uploaded'
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS jng_signature_name text; -- typed signature text, 'typed' only
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS jng_signature_image text; -- base64 image, drawn/uploaded only
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS jng_signatory_name text; -- real name for the "Signatory Name" row
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS jng_signatory_designation text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS jng_signed_at timestamptz;

NOTIFY pgrst, 'reload schema';
