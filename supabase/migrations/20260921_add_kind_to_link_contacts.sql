-- Vendor, Buyer and Other contacts are now all saved per Customer + Vendor pair in
-- buyer_supplier_link_contacts. `kind` keeps which Send Mail section a contact belongs to
-- (shown as the tag next to the name). Existing rows are 'other'.
ALTER TABLE buyer_supplier_link_contacts ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'other';
NOTIFY pgrst, 'reload schema';
-- Rollback: ALTER TABLE buyer_supplier_link_contacts DROP COLUMN kind;
