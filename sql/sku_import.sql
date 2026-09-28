-- ─────────────────────────────────────────────────────────────────────────────
-- SKU Import — staging for the Order Management "SKU Import" tab.
--
-- The backend route (POST /skus/import, separate service) only parses the
-- uploaded vendor sheet and returns rows split into confidence tiers
-- (confirmed / needs_confirm / needs_input) — it persists nothing. These two
-- tables hold that parsed batch so a review can survive a page reload and
-- leave an audit trail, mirroring po_shipment_plans.sql's shape.
--
-- Row confirmation (staging row -> real `skus` row) is done through the
-- confirm_sku_import_row RPC below rather than two separate client writes,
-- so a mid-flight failure can't leave a confirmed SKU with its staging row
-- still marked pending — same reasoning as create_shipment_plan_group.
-- ─────────────────────────────────────────────────────────────────────────────

-- file_name is nullable: a batch started via "Create SKUs" (manual entry,
-- no vendor sheet — the common case in practice) has no file at all.
CREATE TABLE IF NOT EXISTS sku_import_batches (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_org_id  uuid NOT NULL REFERENCES organizations(id),
  vendor_org_id uuid NOT NULL REFERENCES organizations(id),
  file_name     text,
  sheet_used    text,
  status        text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed')),
  uploaded_by   uuid REFERENCES organization_members(id),
  created_on    timestamptz NOT NULL DEFAULT now(),
  updated_on    timestamptz NOT NULL DEFAULT now()
);

-- Re-running this file after the table already existed with file_name NOT NULL:
ALTER TABLE sku_import_batches ALTER COLUMN file_name DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sku_import_batches_status ON sku_import_batches (status);

CREATE TABLE IF NOT EXISTS sku_import_rows (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id      uuid NOT NULL REFERENCES sku_import_batches(id) ON DELETE CASCADE,
  row_index     int NOT NULL,
  status        text NOT NULL DEFAULT 'pending_review' CHECK (status IN ('pending_review', 'confirmed')),
  confirmed     jsonb NOT NULL DEFAULT '{}'::jsonb,
  needs_confirm jsonb NOT NULL DEFAULT '{}'::jsonb,
  needs_input   jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_mapped    jsonb,
  sku_id        uuid REFERENCES skus(id),
  created_on    timestamptz NOT NULL DEFAULT now(),
  updated_on    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sku_import_rows_batch_id ON sku_import_rows (batch_id);
CREATE INDEX IF NOT EXISTS idx_sku_import_rows_status ON sku_import_rows (status);


-- ─────────────────────────────────────────────────────────────────────────────
-- Auto-flip a batch to 'completed' once every row in it is confirmed
-- (and back to 'in_progress' if a row is ever un-confirmed — not exposed
-- today, but keeps the derived status correct if that's added later).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION sync_sku_import_batch_status()
RETURNS trigger AS $$
BEGIN
  UPDATE sku_import_batches b
  SET status = CASE WHEN EXISTS (
        SELECT 1 FROM sku_import_rows r WHERE r.batch_id = NEW.batch_id AND r.status = 'pending_review'
      ) THEN 'in_progress' ELSE 'completed' END,
      updated_on = now()
  WHERE b.id = NEW.batch_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_sku_import_batch_status ON sku_import_rows;
CREATE TRIGGER trg_sync_sku_import_batch_status
AFTER INSERT OR UPDATE OF status ON sku_import_rows
FOR EACH ROW EXECUTE FUNCTION sync_sku_import_batch_status();


-- ─────────────────────────────────────────────────────────────────────────────
-- confirm_sku_import_row
-- Insert-or-update: first call for a row inserts into `skus` and marks the
-- staging row confirmed; any later call (editing an already-confirmed row —
-- fields stay editable in the review drawer after confirmation) updates that
-- same `skus` row instead of creating a second one. SECURITY DEFINER, so it
-- re-checks the caller itself (erp/tech/it dept, or no dept set, same bar
-- as inserting a batch).
--
-- `skus` has no dedicated colour column — colour lives in `sku_variant`
-- (the same column PoDrawer/LineItemForm already display/autocomplete as a
-- SKU's variant), so p_colour is written there instead.
--
-- p_primary_base_material_id / p_secondary_base_material_id reference
-- material_options — run sql/material_options.sql BEFORE this file (it adds
-- both the table and the skus.*_id columns this function writes to).
-- ─────────────────────────────────────────────────────────────────────────────

-- Safety net in case this hasn't been added separately yet:
ALTER TABLE skus ADD COLUMN IF NOT EXISTS packing_material text;

-- `image_url` follows the same "bucket::path" or bare-path convention as
-- po_file_url/pi_file_url (see poUtils.jsx's publicUrl) — resolved to a
-- Supabase Storage public URL client-side, not stored as a full URL.
ALTER TABLE skus ADD COLUMN IF NOT EXISTS image_url text;

CREATE OR REPLACE FUNCTION confirm_sku_import_row(
  p_row_id                 uuid,
  p_created_by             uuid,
  p_vendor_id              uuid,
  p_buyer_org_id           uuid,
  p_category_id            uuid,
  p_buyer_sku_ref          text,
  p_vendor_sku_ref         text,
  p_description            text,
  p_colour                 text,
  p_primary_base_material  text,
  p_base_price             numeric,
  p_weight_kg              numeric,
  p_length                 numeric,
  p_breadth                numeric,
  p_height                 numeric,
  p_inner_pack_length      numeric,
  p_inner_pack_breadth     numeric,
  p_inner_pack_height      numeric,
  p_inner_pack_qty         numeric,
  p_inner_pack_weight_kg   numeric,
  p_master_pack_length     numeric,
  p_master_pack_breadth    numeric,
  p_master_pack_height     numeric,
  p_master_pack_qty        numeric,
  p_master_pack_weight_kg  numeric,
  p_item_cbm               numeric,
  p_master_pack_cbm        numeric,
  p_units_per_20ft         numeric,
  p_units_per_40ft         numeric,
  p_packing_material       text,
  p_image_url              text DEFAULT NULL,
  p_primary_base_material_id   uuid DEFAULT NULL,
  p_secondary_base_material_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sku_id         uuid;
  v_batch_id       uuid;
  v_existing_sku_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM organization_members om JOIN organizations o ON o.id = om.organization_id
    WHERE om.id = p_created_by AND o.type = 'merchant'
      AND (om.department IN ('erp', 'tech', 'it') OR om.department IS NULL)
  ) THEN
    RAISE EXCEPTION 'Not authorized to confirm SKU imports';
  END IF;

  IF p_buyer_sku_ref IS NULL OR p_description IS NULL OR p_base_price IS NULL THEN
    RAISE EXCEPTION 'buyer_sku_ref, description and base_price are required';
  END IF;

  SELECT batch_id, sku_id INTO v_batch_id, v_existing_sku_id FROM sku_import_rows WHERE id = p_row_id;
  IF v_batch_id IS NULL THEN
    RAISE EXCEPTION 'Row not found';
  END IF;

  IF v_existing_sku_id IS NULL THEN
    INSERT INTO skus (
      vendor_id, buyer_org_id, category_id,
      buyer_sku_ref, vendor_sku_ref, description, sku_variant, primary_base_material, base_price, weight_kg,
      length, breadth, height,
      inner_pack_length, inner_pack_breadth, inner_pack_height, inner_pack_qty, inner_pack_weight_kg,
      master_pack_length, master_pack_breadth, master_pack_height, master_pack_qty, master_pack_weight_kg,
      item_cbm, master_pack_cbm, units_per_20ft, units_per_40ft, packing_material, image_url,
      primary_base_material_id, secondary_base_material_id
    ) VALUES (
      p_vendor_id, p_buyer_org_id, p_category_id,
      p_buyer_sku_ref, p_vendor_sku_ref, p_description, p_colour, p_primary_base_material, p_base_price, p_weight_kg,
      p_length, p_breadth, p_height,
      p_inner_pack_length, p_inner_pack_breadth, p_inner_pack_height, p_inner_pack_qty, p_inner_pack_weight_kg,
      p_master_pack_length, p_master_pack_breadth, p_master_pack_height, p_master_pack_qty, p_master_pack_weight_kg,
      p_item_cbm, p_master_pack_cbm, p_units_per_20ft, p_units_per_40ft, p_packing_material, p_image_url,
      p_primary_base_material_id, p_secondary_base_material_id
    )
    RETURNING id INTO v_sku_id;

    UPDATE sku_import_rows
    SET status = 'confirmed', sku_id = v_sku_id, updated_on = now()
    WHERE id = p_row_id;
  ELSE
    -- COALESCE throughout: this branch is hit both when a reviewer re-edits
    -- their own already-confirmed row (where a field genuinely being blank
    -- is rare/deliberate) AND now when a later batch's row gets pre-linked
    -- to an existing SKU by sku_id (e.g. a product sheet enriching a SKU a
    -- PI already created) — in that second case a null here just means
    -- "this document didn't have that field", not "clear it", so it must
    -- never overwrite a value a previous confirm already set.
    UPDATE skus SET
      vendor_id = COALESCE(p_vendor_id, vendor_id), buyer_org_id = COALESCE(p_buyer_org_id, buyer_org_id),
      category_id = COALESCE(p_category_id, category_id),
      buyer_sku_ref = COALESCE(p_buyer_sku_ref, buyer_sku_ref), vendor_sku_ref = COALESCE(p_vendor_sku_ref, vendor_sku_ref),
      description = COALESCE(p_description, description),
      sku_variant = COALESCE(p_colour, sku_variant), primary_base_material = COALESCE(p_primary_base_material, primary_base_material),
      base_price = COALESCE(p_base_price, base_price),
      weight_kg = COALESCE(p_weight_kg, weight_kg), length = COALESCE(p_length, length),
      breadth = COALESCE(p_breadth, breadth), height = COALESCE(p_height, height),
      inner_pack_length = COALESCE(p_inner_pack_length, inner_pack_length), inner_pack_breadth = COALESCE(p_inner_pack_breadth, inner_pack_breadth),
      inner_pack_height = COALESCE(p_inner_pack_height, inner_pack_height), inner_pack_qty = COALESCE(p_inner_pack_qty, inner_pack_qty),
      inner_pack_weight_kg = COALESCE(p_inner_pack_weight_kg, inner_pack_weight_kg),
      master_pack_length = COALESCE(p_master_pack_length, master_pack_length), master_pack_breadth = COALESCE(p_master_pack_breadth, master_pack_breadth),
      master_pack_height = COALESCE(p_master_pack_height, master_pack_height), master_pack_qty = COALESCE(p_master_pack_qty, master_pack_qty),
      master_pack_weight_kg = COALESCE(p_master_pack_weight_kg, master_pack_weight_kg),
      item_cbm = COALESCE(p_item_cbm, item_cbm), master_pack_cbm = COALESCE(p_master_pack_cbm, master_pack_cbm),
      units_per_20ft = COALESCE(p_units_per_20ft, units_per_20ft), units_per_40ft = COALESCE(p_units_per_40ft, units_per_40ft),
      packing_material = COALESCE(p_packing_material, packing_material),
      image_url = COALESCE(p_image_url, image_url),
      primary_base_material_id = COALESCE(p_primary_base_material_id, primary_base_material_id),
      secondary_base_material_id = COALESCE(p_secondary_base_material_id, secondary_base_material_id)
    WHERE id = v_existing_sku_id;

    v_sku_id := v_existing_sku_id;
    UPDATE sku_import_rows SET updated_on = now() WHERE id = p_row_id;
  END IF;

  RETURN v_sku_id;
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- delete_sku_import_row
-- Deletes a staging row outright (it's just workflow scaffolding — no other
-- table references it). If the row was already confirmed (has a sku_id),
-- soft-deletes the linked `skus` record instead of touching it directly,
-- using the same delete_meta {deleted, deletedAt, deletedById, deletedByName,
-- reason} shape usePOActions.deletePO already writes — every existing reader
-- already filters on `.is('delete_meta', null)`.
-- ─────────────────────────────────────────────────────────────────────────────

-- Safety net in case this hasn't been added separately yet:
ALTER TABLE skus ADD COLUMN IF NOT EXISTS delete_meta jsonb;

CREATE OR REPLACE FUNCTION delete_sku_import_row(
  p_row_id     uuid,
  p_deleted_by uuid,
  p_reason     text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sku_id        uuid;
  v_deleter_name  text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM organization_members om JOIN organizations o ON o.id = om.organization_id
    WHERE om.id = p_deleted_by AND o.type = 'merchant'
      AND (om.department IN ('erp', 'tech', 'it') OR om.department IS NULL)
  ) THEN
    RAISE EXCEPTION 'Not authorized to delete SKU import rows';
  END IF;

  SELECT sku_id INTO v_sku_id FROM sku_import_rows WHERE id = p_row_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Row not found';
  END IF;

  IF v_sku_id IS NOT NULL THEN
    SELECT full_name INTO v_deleter_name FROM organization_members WHERE id = p_deleted_by;

    UPDATE skus SET delete_meta = jsonb_build_object(
      'deleted',       true,
      'deletedAt',     now(),
      'deletedById',   p_deleted_by,
      'deletedByName', v_deleter_name,
      'reason',        p_reason
    )
    WHERE id = v_sku_id AND delete_meta IS NULL;
  END IF;

  DELETE FROM sku_import_rows WHERE id = p_row_id;
END;
$$;


-- ══════════════════════════════════════════════════════════════════════════════
-- RLS
--   SELECT → any merchant org member (same visibility bar as po_shipment_plans)
--   INSERT → erp/tech/it dept, or no dept set, must insert as themselves
--   No client-side UPDATE policy on either table: batch status is trigger-
--   maintained and row confirmation goes through confirm_sku_import_row
--   (SECURITY DEFINER, bypasses RLS internally after its own auth check).
-- ══════════════════════════════════════════════════════════════════════════════
ALTER TABLE sku_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE sku_import_rows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "merchant members can view sku_import_batches" ON sku_import_batches;
CREATE POLICY "merchant members can view sku_import_batches"
ON sku_import_batches FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM organization_members om
    JOIN organizations o ON o.id = om.organization_id
    WHERE om.user_id = auth.uid()
      AND o.type = 'merchant'
  )
);

DROP POLICY IF EXISTS "merchandising can insert sku_import_batches" ON sku_import_batches; -- old name, pre-erp-department cutover
DROP POLICY IF EXISTS "erp can insert sku_import_batches" ON sku_import_batches;
CREATE POLICY "erp can insert sku_import_batches"
ON sku_import_batches FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM organization_members om
    JOIN organizations o ON o.id = om.organization_id
    WHERE om.user_id = auth.uid()
      AND o.type = 'merchant'
      AND (om.department IN ('erp', 'tech', 'it') OR om.department IS NULL)
      AND om.id = uploaded_by
  )
);

-- Deleting a batch cascades its (staging-only) rows via the FK; it never
-- touches `skus` — a confirmed row's real SKU record persists regardless.
DROP POLICY IF EXISTS "merchandising can delete sku_import_batches" ON sku_import_batches; -- old name, pre-erp-department cutover
DROP POLICY IF EXISTS "erp can delete sku_import_batches" ON sku_import_batches;
CREATE POLICY "erp can delete sku_import_batches"
ON sku_import_batches FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM organization_members om
    JOIN organizations o ON o.id = om.organization_id
    WHERE om.user_id = auth.uid()
      AND o.type = 'merchant'
      AND (om.department IN ('erp', 'tech', 'it') OR om.department IS NULL)
  )
);

DROP POLICY IF EXISTS "merchant members can view sku_import_rows" ON sku_import_rows;
CREATE POLICY "merchant members can view sku_import_rows"
ON sku_import_rows FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM organization_members om
    JOIN organizations o ON o.id = om.organization_id
    WHERE om.user_id = auth.uid()
      AND o.type = 'merchant'
  )
);

DROP POLICY IF EXISTS "merchandising can insert sku_import_rows" ON sku_import_rows; -- old name, pre-erp-department cutover
DROP POLICY IF EXISTS "erp can insert sku_import_rows" ON sku_import_rows;
CREATE POLICY "erp can insert sku_import_rows"
ON sku_import_rows FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM organization_members om
    JOIN organizations o ON o.id = om.organization_id
    WHERE om.user_id = auth.uid()
      AND o.type = 'merchant'
      AND (om.department IN ('erp', 'tech', 'it') OR om.department IS NULL)
  )
);


-- ══════════════════════════════════════════════════════════════════════════════
-- Storage bucket: product_images (existing bucket — not created here)
-- One photo per SKU, uploaded client-side from SkuReviewDrawer and referenced
-- from `skus.image_url` (same "bucket::path" convention as po_file_url/
-- pi_file_url — see poUtils.jsx's publicUrl). Same visibility/authorship bar
-- as sku_import_rows above. DROP+CREATE so this is safe to re-run even if
-- the bucket already has policies from another feature.
-- ══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "merchant members can read product_images" ON storage.objects;
CREATE POLICY "merchant members can read product_images"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'product_images'
  AND EXISTS (
    SELECT 1 FROM organization_members om
    JOIN organizations o ON o.id = om.organization_id
    WHERE om.user_id = auth.uid()
      AND o.type = 'merchant'
  )
);

DROP POLICY IF EXISTS "erp can upload to product_images" ON storage.objects;
CREATE POLICY "erp can upload to product_images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'product_images'
  AND EXISTS (
    SELECT 1 FROM organization_members om
    JOIN organizations o ON o.id = om.organization_id
    WHERE om.user_id = auth.uid()
      AND o.type = 'merchant'
      AND (om.department IN ('erp', 'tech', 'it') OR om.department IS NULL)
  )
);

DROP POLICY IF EXISTS "erp can update files in product_images" ON storage.objects;
CREATE POLICY "erp can update files in product_images"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'product_images'
  AND EXISTS (
    SELECT 1 FROM organization_members om
    JOIN organizations o ON o.id = om.organization_id
    WHERE om.user_id = auth.uid()
      AND o.type = 'merchant'
      AND (om.department IN ('erp', 'tech', 'it') OR om.department IS NULL)
  )
);
