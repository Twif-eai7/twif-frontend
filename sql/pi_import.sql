-- ─────────────────────────────────────────────────────────────────────────────
-- PI parsing — a second flavor of the sku_import_batches/rows staging table,
-- alongside the existing product-sheet flow. Reuses the exact same tables
-- (batch/row shape, RLS, status-sync trigger) since the review UI (SKU
-- Import tab) is the same screen either way — only the confirm behavior
-- differs: a PI row must NEVER write to an existing SKU's fields (only
-- product-sheet rows enrich a SKU), it only finds-or-creates a bare-identity
-- SKU and writes the PO's line item (quantity/price) — the actual point of
-- parsing a PI. See the plan doc for the full "why".
--
-- Run AFTER sql/sku_import.sql (sku_import_batches/rows must already exist)
-- and sql/po_line_items_direct_save.sql (confirm_pi_import_row calls
-- save_po_line_item, defined there).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE sku_import_batches ADD COLUMN IF NOT EXISTS import_type text NOT NULL DEFAULT 'product_sheet';
ALTER TABLE sku_import_batches DROP CONSTRAINT IF EXISTS sku_import_batches_import_type_check;
ALTER TABLE sku_import_batches ADD CONSTRAINT sku_import_batches_import_type_check
  CHECK (import_type IN ('product_sheet', 'pi'));


-- ─────────────────────────────────────────────────────────────────────────────
-- confirm_pi_import_row
-- Unlike confirm_sku_import_row, this NEVER updates an existing skus row —
-- it either reuses one found by (buyer_org_id, buyer_sku_ref, sku_variant)
-- as-is, or creates a bare-identity one (mirroring create_sku_direct's
-- insert, sql/po_line_items_direct_save.sql). Either way it then calls the
-- existing save_po_line_item to write the PO's line item against whichever
-- sku_id was resolved — same insert/update/balance logic that function
-- already has, untouched.
--
-- p_order_value_usd is precomputed client-side (qty * unit_price converted
-- via the PO's implied rate) — same convention save_po_line_item already
-- uses; po_line_items has no currency column of its own (see PoDrawer.jsx's
-- savePoLineItem comment).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION confirm_pi_import_row(
  p_row_id            uuid,
  p_saved_by          uuid,
  p_po_id             uuid,
  p_vendor_id         uuid,
  p_buyer_org_id      uuid,
  p_buyer_sku_ref     text,
  p_sku_variant       text,
  p_description       text,
  p_base_price        numeric,
  p_currency          text,
  p_quantity_ordered  numeric,
  p_unit_price        numeric,
  p_order_value_usd   numeric
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sku_id        uuid;
  v_line_item_id  uuid;
  v_result_id     uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM organization_members om JOIN organizations o ON o.id = om.organization_id
    WHERE om.id = p_saved_by AND o.type = 'merchant'
      AND (om.department IN ('erp', 'tech', 'it') OR om.department IS NULL)
  ) THEN
    RAISE EXCEPTION 'Not authorized to confirm PI imports';
  END IF;

  IF p_buyer_sku_ref IS NULL OR p_quantity_ordered IS NULL OR p_unit_price IS NULL THEN
    RAISE EXCEPTION 'buyer_sku_ref, quantity_ordered and unit_price are required';
  END IF;

  -- Real catalog-wide lookup (unlike confirm_sku_import_row's row-reconfirm-
  -- only check) — this is what makes order-independence work: whichever
  -- document is confirmed first creates the SKU, this just finds it.
  SELECT id INTO v_sku_id
  FROM skus
  WHERE buyer_org_id = p_buyer_org_id
    AND buyer_sku_ref = p_buyer_sku_ref
    AND sku_variant IS NOT DISTINCT FROM p_sku_variant
    AND delete_meta IS NULL
  LIMIT 1;

  IF v_sku_id IS NULL THEN
    IF p_description IS NULL OR p_base_price IS NULL THEN
      RAISE EXCEPTION 'description and base_price are required to create a new SKU';
    END IF;

    INSERT INTO skus (
      vendor_id, buyer_org_id, buyer_sku_ref, sku_variant, description, base_price, currency
    ) VALUES (
      p_vendor_id, p_buyer_org_id, p_buyer_sku_ref, p_sku_variant, p_description, p_base_price, p_currency
    )
    RETURNING id INTO v_sku_id;
  END IF;
  -- No ELSE/UPDATE branch — an existing SKU's fields are never touched here.

  SELECT id INTO v_line_item_id FROM po_line_items WHERE po_id = p_po_id AND sku_id = v_sku_id;

  v_result_id := save_po_line_item(
    v_line_item_id, p_po_id, v_sku_id, p_buyer_sku_ref, p_sku_variant,
    p_quantity_ordered, p_unit_price, p_order_value_usd, p_saved_by
  );

  UPDATE sku_import_rows SET status = 'confirmed', sku_id = v_sku_id, updated_on = now() WHERE id = p_row_id;

  RETURN v_result_id;
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- delete_pi_import_row
-- Deliberately does NOT reuse delete_sku_import_row's "confirmed row ->
-- soft-delete the skus row" behavior: a PI row never owns the SKU it
-- resolved to (it might be a SKU a product sheet created, or one shared
-- with other POs) — only the po_line_item it created belongs to this PO's
-- review. Undoing a confirmed PI row removes that line item; the SKU
-- itself is left alone regardless.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION delete_pi_import_row(
  p_row_id     uuid,
  p_po_id      uuid,
  p_deleted_by uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sku_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM organization_members om JOIN organizations o ON o.id = om.organization_id
    WHERE om.id = p_deleted_by AND o.type = 'merchant'
      AND (om.department IN ('erp', 'tech', 'it') OR om.department IS NULL)
  ) THEN
    RAISE EXCEPTION 'Not authorized to delete PI import rows';
  END IF;

  SELECT sku_id INTO v_sku_id FROM sku_import_rows WHERE id = p_row_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Row not found';
  END IF;

  IF v_sku_id IS NOT NULL THEN
    DELETE FROM po_line_items WHERE po_id = p_po_id AND sku_id = v_sku_id;
  END IF;

  DELETE FROM sku_import_rows WHERE id = p_row_id;
END;
$$;
