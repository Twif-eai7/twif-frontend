-- PCT triggers: updated_at + auto-tick "Buyer PO uploaded" from purchase_orders.po_file_url

-- ── updated_at ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pct_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pct_lines_updated_at ON pct_lines;
CREATE TRIGGER pct_lines_updated_at
  BEFORE UPDATE ON pct_lines
  FOR EACH ROW EXECUTE FUNCTION pct_set_updated_at();

DROP TRIGGER IF EXISTS pct_po_headers_updated_at ON pct_po_headers;
CREATE TRIGGER pct_po_headers_updated_at
  BEFORE UPDATE ON pct_po_headers
  FOR EACH ROW EXECUTE FUNCTION pct_set_updated_at();

-- ── Stage 1: Buyer PO uploaded (check_index 0, stage_id 'po') ──
-- When purchase_orders.po_file_url is set/non-empty, tick the check for every
-- po_line_item on that PO that already has a po_stage_checks row.

CREATE OR REPLACE FUNCTION po_has_buyer_po_file(p_po_file_url TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN p_po_file_url IS NOT NULL AND btrim(p_po_file_url) <> '';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION po_sync_buyer_po_uploaded_for_po(p_po_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE po_stage_checks c
  SET
    done    = true,
    done_by = 'System',
    done_at = COALESCE(c.done_at, now())
  FROM po_line_items li
  JOIN purchase_orders po ON po.id = li.po_id
  WHERE li.po_id = p_po_id
    AND c.po_line_item_id = li.id
    AND c.stage_id = 'po'
    AND c.check_index = 0
    AND c.label = 'Buyer PO uploaded'
    AND po_has_buyer_po_file(po.po_file_url);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION po_sync_buyer_po_uploaded_on_po_change()
RETURNS TRIGGER AS $$
BEGIN
  IF po_has_buyer_po_file(NEW.po_file_url) THEN
    PERFORM po_sync_buyer_po_uploaded_for_po(NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS purchase_orders_sync_buyer_po_check ON purchase_orders;
CREATE TRIGGER purchase_orders_sync_buyer_po_check
  AFTER INSERT OR UPDATE OF po_file_url ON purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION po_sync_buyer_po_uploaded_on_po_change();

-- When a new po_line_item is linked (and stage checks already seeded), tick immediately if PO file exists.
CREATE OR REPLACE FUNCTION po_sync_buyer_po_uploaded_on_line_item()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM po_sync_buyer_po_uploaded_for_po(NEW.po_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS po_line_items_sync_buyer_po_check ON po_line_items;
CREATE TRIGGER po_line_items_sync_buyer_po_check
  AFTER INSERT ON po_line_items
  FOR EACH ROW
  EXECUTE FUNCTION po_sync_buyer_po_uploaded_on_line_item();

-- One-time backfill for existing POs that already have po_file_url + po_stage_checks rows.
-- Run manually after migration if needed:
--   SELECT po_backfill_buyer_po_uploaded_checks();
CREATE OR REPLACE FUNCTION po_backfill_buyer_po_uploaded_checks()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE po_stage_checks c
  SET
    done    = true,
    done_by = 'System',
    done_at = COALESCE(c.done_at, now())
  FROM po_line_items li
  JOIN purchase_orders po ON po.id = li.po_id
  WHERE c.po_line_item_id = li.id
    AND c.stage_id = 'po'
    AND c.check_index = 0
    AND c.label = 'Buyer PO uploaded'
    AND po_has_buyer_po_file(po.po_file_url)
    AND c.done = false;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;
