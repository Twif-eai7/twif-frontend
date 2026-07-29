-- Vendor KYC/compliance/bank details and NDA e-signature capture for Supplier/Vendor onboarding.

-- Supplier-only compliance & bank fields
ALTER TABLE supplier_details ADD COLUMN IF NOT EXISTS cin_no text;
ALTER TABLE supplier_details ADD COLUMN IF NOT EXISTS udyam_no text;
ALTER TABLE supplier_details ADD COLUMN IF NOT EXISTS msme_no text;
ALTER TABLE supplier_details ADD COLUMN IF NOT EXISTS isi_code text;
ALTER TABLE supplier_details ADD COLUMN IF NOT EXISTS bank_account_number text;
ALTER TABLE supplier_details ADD COLUMN IF NOT EXISTS bank_ifsc_code text;

-- Shared org fields (populated for suppliers only, per current onboarding scope)
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS owner_name text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS owner_email text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS owner_phone text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS reason_for_contact text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS logo_url text;

-- NDA e-signature audit trail
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS nda_accepted boolean DEFAULT false;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS nda_signature_name text;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS nda_accepted_at timestamptz;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS nda_ip_address text;
