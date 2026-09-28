-- Lets QA leave comments scoped to one SKU (po_line_item) instead of only the whole PO.
-- Nullable: existing rows (line_item_id IS NULL) remain the PO-wide "Inspection Comments" thread.
ALTER TABLE po_comments ADD COLUMN IF NOT EXISTS line_item_id uuid REFERENCES po_line_items(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS po_comments_line_item_id_idx ON po_comments(line_item_id);

NOTIFY pgrst, 'reload schema';
