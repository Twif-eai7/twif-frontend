-- Extends the existing OTIF-exception request/approval flow (proof photo,
-- pending/approved/rejected, admin review) to also cover per-SKU order
-- quantity cancellation requests, instead of adding a second, near-identical
-- table for the same "request + proof + approval" shape. Existing OTIF rows
-- are unaffected (exception_type defaults to their existing meaning).
ALTER TABLE otif_exceptions
  ADD COLUMN IF NOT EXISTS exception_type text NOT NULL DEFAULT 'otif_date_change'
    CHECK (exception_type IN ('otif_date_change', 'quantity_cancellation')),
  ADD COLUMN IF NOT EXISTS line_item_id uuid REFERENCES po_line_items(id),
  ADD COLUMN IF NOT EXISTS requested_quantity numeric;

-- One pending cancellation request per SKU at a time, enforced at the DB
-- level (not just in the UI) so two racing submissions can't both land.
CREATE UNIQUE INDEX IF NOT EXISTS uq_otif_exceptions_one_pending_cancellation
  ON otif_exceptions(line_item_id)
  WHERE exception_type = 'quantity_cancellation' AND status = 'pending';

-- Approving a cancellation needs a relative adjustment (col = col +/- amount),
-- unlike OTIF's plain single-column overwrite, which a client-side .update()
-- can't express atomically. balance_quantity is floored at 0 as a defensive
-- clamp -- it's otherwise maintained by a separate, untracked shipment
-- function this doesn't need to know the formula of.
CREATE OR REPLACE FUNCTION apply_line_item_cancellation(p_line_item_id uuid, p_amount numeric)
RETURNS void AS $$
  UPDATE po_line_items
  SET cancelled_quantity = coalesce(cancelled_quantity, 0) + p_amount,
      balance_quantity   = greatest(0, coalesce(balance_quantity, 0) - p_amount)
  WHERE id = p_line_item_id;
$$ LANGUAGE sql;

NOTIFY pgrst, 'reload schema';
