-- PO-wide Inspection Level preset for the AQL sampling plan. Lives directly
-- on purchase_orders (one PO, one level) rather than a separate settings
-- table -- setting it drives sample-size/Ac-Re computation for every SKU on
-- that PO from its own quantity_ordered, instead of every inspector
-- re-typing Inspection Level / Sample Size / AQL by hand per SKU.

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS inspection_level text
    CHECK (inspection_level IN ('G-I', 'G-II', 'G-III', 'S-1', 'S-2', 'S-3', 'S-4'));

NOTIFY pgrst, 'reload schema';
