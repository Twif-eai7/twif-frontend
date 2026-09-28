-- Superseded by line_items jsonb, which can carry a quantity per SKU
-- ({id, quantity}), not just which SKUs — plain uuid[] had no room for that.
-- Safe to run whether or not the prior migration (line_item_ids uuid[]) was
-- ever applied.
ALTER TABLE inspection_schedules DROP COLUMN IF EXISTS line_item_ids;
ALTER TABLE inspection_schedules ADD COLUMN IF NOT EXISTS line_items jsonb;

NOTIFY pgrst, 'reload schema';
