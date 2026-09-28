-- "Other" recipients saved for one Customer (buyer) + Vendor (exporter) pair.
--
-- The Send Mail dialog's "Add other contact" used to be one-off (this send
-- only). These are now saved per buyer_supplier_link (the Customer + Vendor
-- combination), so they show up pre-checked on every future PO for that exact
-- pair and nowhere else - unlike vendor_contacts / buyer_contacts, which follow
-- the vendor or the buyer across all their POs.
--
-- Email is stored lower-cased so the unique key really is one row per person
-- per pair. RLS enabled with no policies: only the backend (service role)
-- reads or writes it.

CREATE TABLE IF NOT EXISTS buyer_supplier_link_contacts (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_supplier_link_id  uuid NOT NULL,
  name                    text,
  email                   text NOT NULL,
  created_by              text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bslc_unique_email UNIQUE (buyer_supplier_link_id, email)
);
CREATE INDEX IF NOT EXISTS idx_bslc_link ON buyer_supplier_link_contacts (buyer_supplier_link_id);
ALTER TABLE buyer_supplier_link_contacts ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';

-- Rollback: DROP TABLE buyer_supplier_link_contacts;
