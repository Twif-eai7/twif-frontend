-- Type/Draw/Upload signature capture for vendor NDA, a reusable admin-signature store
-- (used for JNG's countersignature on approval), and a simplified activity log for the
-- signed-PDF audit trail.

-- Vendor's signature (captured at submission)
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS nda_signature_type text; -- 'typed' | 'drawn' | 'uploaded'
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS nda_signature_image text; -- base64 PNG, drawn/uploaded modes

-- Reusable admin/JNG signature store — set up once, reused for every future approval.
CREATE TABLE IF NOT EXISTS admin_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  designation text,
  signature_type text NOT NULL, -- 'typed' | 'drawn' | 'uploaded'
  signature_image text, -- base64 PNG, drawn/uploaded modes only
  updated_at timestamptz DEFAULT now()
);

-- Activity log for the signed-PDF audit trail
CREATE TABLE IF NOT EXISTS nda_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_type text NOT NULL, -- 'created' | 'vendor_signed' | 'jng_countersigned' | 'sent'
  actor_name text,
  actor_email text,
  ip_address text,
  created_at timestamptz DEFAULT now()
);
