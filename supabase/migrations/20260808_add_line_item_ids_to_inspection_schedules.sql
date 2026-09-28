-- Lets a schedule entry optionally scope itself to a specific subset of the
-- PO's SKUs, rather than always implicitly meaning "the whole PO". NULL (the
-- default, and every existing row) keeps today's behavior — no explicit
-- selection was ever made, so it still reads as "the whole PO". A plain
-- uuid[] rather than a join table: this is a simple, single-owner set with no
-- per-row metadata of its own, not a real many-to-many relationship worth a
-- table for.
ALTER TABLE inspection_schedules ADD COLUMN IF NOT EXISTS line_item_ids uuid[];

NOTIFY pgrst, 'reload schema';
