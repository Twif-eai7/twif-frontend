-- What was actually available on-site at inspection time, as recorded by the
-- inspector for this report only — distinct from po_line_items.balance_quantity
-- (the SKU's real, shared Balance shown in the sidebar/PO Overview/scheduling).
-- Seeded from that Balance in the UI as a starting default, but editing it here
-- never writes back to po_line_items.
ALTER TABLE inspection_reports ADD COLUMN IF NOT EXISTS available_quantity numeric;

NOTIFY pgrst, 'reload schema';
