import { useAuthStore } from '../stores/authStore'
import { supabase } from '../lib/supabase'

const API_BASE = import.meta.env.VITE_BACKEND_URL

async function apiFormData(path, formData) {
  const session = useAuthStore.getState().session
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
    body: formData,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.detail || json.error || `Request failed: ${res.status}`)
  return json
}

// Defined at module scope (not inside useSkuImport) so consumers get stable
// function references across renders — these close over nothing reactive,
// so recreating them per-render only served to retrigger effects that key
// off them (e.g. a refresh-on-mount effect looping forever).

// Stateless parse — backend reads the sheet and returns rows split into
// confirmed / needs_confirm / needs_input tiers. Nothing is persisted there;
// createBatch() below is what actually saves the parsed rows. buyerOrgId is
// needed so the backend can drop rows that already match an existing SKU
// for this buyer (by buyer_sku_ref + variant) instead of surfacing them for
// review as if they were new.
async function importSkuSheet({ file, vendorId, buyerOrgId }) {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('vendor_id', vendorId)
  fd.append('buyer_org_id', buyerOrgId)
  return apiFormData('/skus/import', fd)
}

// Persists a freshly-parsed batch: one sku_import_batches row + one
// sku_import_rows row per parsed SKU. Returns the batch with real DB ids
// so the review UI can survive a page reload.
async function createBatch({ buyerOrgId, vendorId, poId, fileName, sheetUsed, uploadedBy, rows }) {
  const { data: batch, error: batchError } = await supabase
    .from('sku_import_batches')
    .insert({ buyer_org_id: buyerOrgId, vendor_org_id: vendorId, po_id: poId, file_name: fileName, sheet_used: sheetUsed, uploaded_by: uploadedBy })
    .select()
    .single()
  if (batchError) throw new Error(batchError.message)

  const { data: insertedRows, error: rowsError } = await supabase
    .from('sku_import_rows')
    .insert(rows.map((r, idx) => ({
      batch_id: batch.id,
      row_index: idx,
      confirmed: r.confirmed || {},
      needs_confirm: r.needs_confirm || {},
      needs_input: r.needs_input || {},
      raw_mapped: r.raw_mapped || null,
      sku_id: r.sku_id ?? null,
    })))
    .select()
  if (rowsError) throw new Error(rowsError.message)

  return { batch, rows: insertedRows.sort((a, b) => a.row_index - b.row_index) }
}

// Starts a batch with no file at all — the "Create SKUs" entry point for the
// (common in practice) case where there's no vendor sheet to parse from.
// Caller follows up with addManualRow() to add the first blank row.
async function createManualBatch({ buyerOrgId, vendorId, poId, uploadedBy }) {
  const { data: batch, error } = await supabase
    .from('sku_import_batches')
    .insert({ buyer_org_id: buyerOrgId, vendor_org_id: vendorId, po_id: poId, file_name: null, sheet_used: null, uploaded_by: uploadedBy })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return batch
}

// Blank staging row for sheets (or formats) the parser couldn't extract
// anything from — e.g. a batch that comes back "0 of 0 confirmed". Flags the
// same three fields the backend's own classifyRow marks required, so the
// review drawer shows them the same way it would for a parsed row.
async function addManualRow(batchId, rowIndex) {
  const { data, error } = await supabase
    .from('sku_import_rows')
    .insert({
      batch_id: batchId,
      row_index: rowIndex,
      confirmed: {},
      needs_confirm: {},
      needs_input: { buyer_sku_ref: null, description: null, base_price: null },
      raw_mapped: null,
    })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data
}

async function listBatches() {
  const { data, error } = await supabase
    .from('sku_import_batches')
    .select(`
      id, file_name, sheet_used, status, created_on, po_id, import_type,
      buyer:organizations!sku_import_batches_buyer_org_id_fkey(display_name),
      vendor:organizations!sku_import_batches_vendor_org_id_fkey(display_name),
      po:purchase_orders!sku_import_batches_po_id_fkey(po_number),
      sku_import_rows(status)
    `)
    .order('created_on', { ascending: false })
  if (error) throw new Error(error.message)
  return (data || []).map(b => ({
    id:           b.id,
    fileName:     b.file_name,
    sheetUsed:    b.sheet_used,
    status:       b.status,
    createdOn:    b.created_on,
    importType:   b.import_type,
    buyerName:    b.buyer?.display_name || '',
    vendorName:   b.vendor?.display_name || '',
    poId:         b.po_id,
    poNumber:     b.po?.po_number || null,
    totalRows:    b.sku_import_rows.length,
    confirmedRows: b.sku_import_rows.filter(r => r.status === 'confirmed').length,
  }))
}

async function getBatch(batchId) {
  const { data: batch, error: batchError } = await supabase
    .from('sku_import_batches')
    .select(`
      id, file_name, sheet_used, status, buyer_org_id, vendor_org_id, po_id, import_type,
      buyer:organizations!sku_import_batches_buyer_org_id_fkey(display_name),
      vendor:organizations!sku_import_batches_vendor_org_id_fkey(display_name),
      po:purchase_orders!sku_import_batches_po_id_fkey(po_number, po_file_url, pi_file_url, product_details_file_url, amount, amount_usd, currency)
    `)
    .eq('id', batchId)
    .single()
  if (batchError) throw new Error(batchError.message)

  const { data: rows, error: rowsError } = await supabase
    .from('sku_import_rows')
    .select('*')
    .eq('batch_id', batchId)
    .order('row_index', { ascending: true })
  if (rowsError) throw new Error(rowsError.message)

  return {
    batchId:    batch.id,
    fileName:   batch.file_name,
    sheetUsed:  batch.sheet_used,
    importType: batch.import_type,
    buyerOrgId: batch.buyer_org_id,
    buyerName:  batch.buyer?.display_name || '',
    vendorId:   batch.vendor_org_id,
    vendorName: batch.vendor?.display_name || '',
    poId:       batch.po_id,
    poNumber:   batch.po?.po_number || null,
    poFileUrl:  batch.po?.po_file_url || null,
    piFileUrl:  batch.po?.pi_file_url || null,
    productDetailsFileUrl: batch.po?.product_details_file_url || null,
    poAmount:    batch.po?.amount ?? null,
    poAmountUsd: batch.po?.amount_usd ?? null,
    poCurrency:  batch.po?.currency || null,
    rows,
  }
}

// Uploads a SKU photo to the product_images bucket and returns a
// "bucket::path" ref — the same convention publicUrl() (poUtils.jsx) already
// resolves for po_file_url/pi_file_url, so it can be stored on
// skus.image_url as-is and rendered anywhere else without extra plumbing.
// Path is buyerOrgId/skuRef/variant(.ext) rather than a random name, so
// re-uploading a photo for the same SKU+variant replaces it in place
// (upsert: true) instead of accumulating orphaned files.
function pathSegment(s, fallback) {
  const trimmed = (s ?? '').toString().trim()
  return trimmed ? trimmed.replace(/[\\/]+/g, '-') : fallback
}

async function uploadSkuImage(file, buyerOrgId, skuRef, variant) {
  const ext = file.name.includes('.') ? `.${file.name.split('.').pop()}` : ''
  const path = `${pathSegment(buyerOrgId, 'misc')}/${pathSegment(skuRef, 'unref')}/${pathSegment(variant, 'default')}${ext}`
  const { error } = await supabase.storage.from('product_images').upload(path, file, { upsert: true })
  if (error) throw new Error(error.message)
  return `product_images::${path}`
}

// Atomically inserts the reviewed fields into `skus` and marks the staging
// row confirmed — see confirm_sku_import_row in sql/sku_import.sql.
async function confirmRow(rowId, { createdBy, vendorId, buyerOrgId, categoryId, fields }) {
  const { data, error } = await supabase.rpc('confirm_sku_import_row', {
    p_row_id: rowId,
    p_created_by: createdBy,
    p_vendor_id: vendorId,
    p_buyer_org_id: buyerOrgId,
    p_category_id: categoryId,
    p_buyer_sku_ref: fields.buyer_sku_ref,
    p_vendor_sku_ref: fields.vendor_sku_ref,
    p_description: fields.description,
    p_colour: fields.colour,
    // Coalesced to null (not left undefined) since this param has no SQL
    // DEFAULT — SkuReviewDrawer no longer collects free-text material (it's
    // a picker now), so `fields.primary_base_material` won't be set on new
    // saves, but the key must still be present or PostgREST can't resolve
    // the RPC call.
    p_primary_base_material: fields.primary_base_material ?? null,
    p_base_price: fields.base_price,
    p_weight_kg: fields.weight_kg,
    p_length: fields.length,
    p_breadth: fields.breadth,
    p_height: fields.height,
    p_inner_pack_length: fields.inner_pack_length,
    p_inner_pack_breadth: fields.inner_pack_breadth,
    p_inner_pack_height: fields.inner_pack_height,
    p_inner_pack_qty: fields.inner_pack_qty,
    p_inner_pack_weight_kg: fields.inner_pack_weight_kg,
    p_master_pack_length: fields.master_pack_length,
    p_master_pack_breadth: fields.master_pack_breadth,
    p_master_pack_height: fields.master_pack_height,
    p_master_pack_qty: fields.master_pack_qty,
    p_master_pack_weight_kg: fields.master_pack_weight_kg,
    p_item_cbm: fields.item_cbm,
    p_master_pack_cbm: fields.master_pack_cbm,
    p_units_per_20ft: fields.units_per_20ft,
    p_units_per_40ft: fields.units_per_40ft,
    p_packing_material: fields.packing_material,
    p_image_url: fields.image_url,
    p_primary_base_material_id: fields.primary_base_material_id ?? null,
    p_secondary_base_material_id: fields.secondary_base_material_id ?? null,
    p_currency: fields.currency ?? null,
    p_padding_cm: fields.padding_cm ?? null,
    p_item_measure_unit: fields.item_measure_unit ?? null,
    p_item_weight_unit: fields.item_weight_unit ?? null,
    p_item_barcode: fields.item_barcode ?? null,
    p_inner_pack_measure_unit: fields.inner_pack_measure_unit ?? null,
    p_inner_pack_weight_unit: fields.inner_pack_weight_unit ?? null,
    p_inner_pack_barcode: fields.inner_pack_barcode ?? null,
    p_inner_pack_cbm: fields.inner_pack_cbm ?? null,
    p_master_pack_measure_unit: fields.master_pack_measure_unit ?? null,
    p_master_pack_weight_unit: fields.master_pack_weight_unit ?? null,
    p_master_pack_barcode: fields.master_pack_barcode ?? null,
    p_units_per_40hq: fields.units_per_40hq ?? null,
  })
  if (error) throw new Error(error.message)
  return data // new sku id
}

// PI rows never update an existing SKU's fields (see sql/pi_import.sql) —
// this only finds-or-creates a bare-identity SKU and writes the PO's line
// item. p_order_value_usd is precomputed by the caller (PiRowReviewDrawer),
// same convention PoDrawer's savePoLineItem already uses.
async function confirmPiRow(rowId, { savedBy, poId, vendorId, buyerOrgId, fields, orderValueUsd }) {
  const { data, error } = await supabase.rpc('confirm_pi_import_row', {
    p_row_id: rowId,
    p_saved_by: savedBy,
    p_po_id: poId,
    p_vendor_id: vendorId,
    p_buyer_org_id: buyerOrgId,
    p_buyer_sku_ref: fields.buyer_sku_ref,
    p_sku_variant: fields.sku_variant ?? null,
    p_description: fields.description ?? null,
    p_base_price: fields.unit_price ?? null,
    p_currency: fields.currency ?? null,
    p_quantity_ordered: fields.quantity_ordered,
    p_unit_price: fields.unit_price,
    p_order_value_usd: orderValueUsd,
  })
  if (error) throw new Error(error.message)
  return data // po_line_items id
}

async function deletePiRow(rowId, { poId, deletedBy }) {
  const { error } = await supabase.rpc('delete_pi_import_row', {
    p_row_id: rowId,
    p_po_id: poId,
    p_deleted_by: deletedBy,
  })
  if (error) throw new Error(error.message)
}

// Maps an already-fetched `skus` row back into the flat field-name shape
// `sku_import_rows.confirmed` snapshots already use elsewhere (1:1 with
// column names — same convention SkuImportTab.jsx's handleSaved relies on).
// `colour` reads from sku_variant, not a `colour` column (skus has none —
// see confirm_sku_import_row's own comment on this in sql/sku_import.sql).
export function skuToConfirmedFields(sku) {
  return {
    buyer_sku_ref: sku.buyer_sku_ref,
    vendor_sku_ref: sku.vendor_sku_ref,
    description: sku.description,
    colour: sku.sku_variant,
    base_price: sku.base_price,
    weight_kg: sku.weight_kg,
    length: sku.length,
    breadth: sku.breadth,
    height: sku.height,
    inner_pack_length: sku.inner_pack_length,
    inner_pack_breadth: sku.inner_pack_breadth,
    inner_pack_height: sku.inner_pack_height,
    inner_pack_qty: sku.inner_pack_qty,
    inner_pack_weight_kg: sku.inner_pack_weight_kg,
    master_pack_length: sku.master_pack_length,
    master_pack_breadth: sku.master_pack_breadth,
    master_pack_height: sku.master_pack_height,
    master_pack_qty: sku.master_pack_qty,
    master_pack_weight_kg: sku.master_pack_weight_kg,
    item_cbm: sku.item_cbm,
    master_pack_cbm: sku.master_pack_cbm,
    units_per_20ft: sku.units_per_20ft,
    units_per_40ft: sku.units_per_40ft,
    packing_material: sku.packing_material,
    image_url: sku.image_url,
    primary_base_material: sku.primary_base_material,
    primary_base_material_id: sku.primary_base_material_id,
    secondary_base_material_id: sku.secondary_base_material_id,
    category_id: sku.category_id,
    currency: sku.currency,
    padding_cm: sku.padding_cm,
    item_measure_unit: sku.item_measure_unit,
    item_weight_unit: sku.item_weight_unit,
    item_barcode: sku.item_barcode,
    inner_pack_measure_unit: sku.inner_pack_measure_unit,
    inner_pack_weight_unit: sku.inner_pack_weight_unit,
    inner_pack_barcode: sku.inner_pack_barcode,
    inner_pack_cbm: sku.inner_pack_cbm,
    master_pack_measure_unit: sku.master_pack_measure_unit,
    master_pack_weight_unit: sku.master_pack_weight_unit,
    master_pack_barcode: sku.master_pack_barcode,
    units_per_40hq: sku.units_per_40hq,
  }
}

// Item Master's "Edit" entry point — writes straight to `skus` via
// update_sku_direct (sql/update_sku_direct.sql), no sku_import_rows/
// sku_import_batches involved. (An earlier version re-anchored SKUs with no
// existing staging row to a freshly-created batch just to reuse
// confirm_sku_import_row — that showed up as a stray batch in the SKU Import
// list for every SKU edited this way, which wasn't wanted.) `fields` is the
// same flat shape confirmRow's RPC call already builds from SkuReviewDrawer.
async function updateSkuDirect(skuId, { updatedBy, categoryId, fields }) {
  const { error } = await supabase.rpc('update_sku_direct', {
    p_sku_id: skuId,
    p_updated_by: updatedBy,
    p_category_id: categoryId,
    p_buyer_sku_ref: fields.buyer_sku_ref,
    p_vendor_sku_ref: fields.vendor_sku_ref,
    p_description: fields.description,
    p_colour: fields.colour,
    p_primary_base_material: fields.primary_base_material ?? null,
    p_base_price: fields.base_price,
    p_weight_kg: fields.weight_kg,
    p_length: fields.length,
    p_breadth: fields.breadth,
    p_height: fields.height,
    p_inner_pack_length: fields.inner_pack_length,
    p_inner_pack_breadth: fields.inner_pack_breadth,
    p_inner_pack_height: fields.inner_pack_height,
    p_inner_pack_qty: fields.inner_pack_qty,
    p_inner_pack_weight_kg: fields.inner_pack_weight_kg,
    p_master_pack_length: fields.master_pack_length,
    p_master_pack_breadth: fields.master_pack_breadth,
    p_master_pack_height: fields.master_pack_height,
    p_master_pack_qty: fields.master_pack_qty,
    p_master_pack_weight_kg: fields.master_pack_weight_kg,
    p_item_cbm: fields.item_cbm,
    p_master_pack_cbm: fields.master_pack_cbm,
    p_units_per_20ft: fields.units_per_20ft,
    p_units_per_40ft: fields.units_per_40ft,
    p_packing_material: fields.packing_material,
    p_image_url: fields.image_url,
    p_primary_base_material_id: fields.primary_base_material_id ?? null,
    p_secondary_base_material_id: fields.secondary_base_material_id ?? null,
    p_currency: fields.currency ?? null,
    p_padding_cm: fields.padding_cm ?? null,
    p_item_measure_unit: fields.item_measure_unit ?? null,
    p_item_weight_unit: fields.item_weight_unit ?? null,
    p_item_barcode: fields.item_barcode ?? null,
    p_inner_pack_measure_unit: fields.inner_pack_measure_unit ?? null,
    p_inner_pack_weight_unit: fields.inner_pack_weight_unit ?? null,
    p_inner_pack_barcode: fields.inner_pack_barcode ?? null,
    p_inner_pack_cbm: fields.inner_pack_cbm ?? null,
    p_master_pack_measure_unit: fields.master_pack_measure_unit ?? null,
    p_master_pack_weight_unit: fields.master_pack_weight_unit ?? null,
    p_master_pack_barcode: fields.master_pack_barcode ?? null,
    p_units_per_40hq: fields.units_per_40hq ?? null,
  })
  if (error) throw new Error(error.message)
}

// PO Drawer's inline "+ Create new SKU" entry point — writes straight to
// `skus` via create_sku_direct (sql/po_line_items_direct_save.sql), no
// sku_import_rows/sku_import_batches involved at all, same as updateSkuDirect
// but for a brand new row instead of an existing one.
async function createSkuDirect({ createdBy, vendorId, buyerOrgId, categoryId, fields }) {
  const { data, error } = await supabase.rpc('create_sku_direct', {
    p_created_by: createdBy,
    p_vendor_id: vendorId,
    p_buyer_org_id: buyerOrgId,
    p_category_id: categoryId,
    p_buyer_sku_ref: fields.buyer_sku_ref,
    p_vendor_sku_ref: fields.vendor_sku_ref,
    p_description: fields.description,
    p_colour: fields.colour,
    p_primary_base_material: fields.primary_base_material ?? null,
    p_base_price: fields.base_price,
    p_weight_kg: fields.weight_kg,
    p_length: fields.length,
    p_breadth: fields.breadth,
    p_height: fields.height,
    p_inner_pack_length: fields.inner_pack_length,
    p_inner_pack_breadth: fields.inner_pack_breadth,
    p_inner_pack_height: fields.inner_pack_height,
    p_inner_pack_qty: fields.inner_pack_qty,
    p_inner_pack_weight_kg: fields.inner_pack_weight_kg,
    p_master_pack_length: fields.master_pack_length,
    p_master_pack_breadth: fields.master_pack_breadth,
    p_master_pack_height: fields.master_pack_height,
    p_master_pack_qty: fields.master_pack_qty,
    p_master_pack_weight_kg: fields.master_pack_weight_kg,
    p_item_cbm: fields.item_cbm,
    p_master_pack_cbm: fields.master_pack_cbm,
    p_units_per_20ft: fields.units_per_20ft,
    p_units_per_40ft: fields.units_per_40ft,
    p_packing_material: fields.packing_material,
    p_image_url: fields.image_url,
    p_primary_base_material_id: fields.primary_base_material_id ?? null,
    p_secondary_base_material_id: fields.secondary_base_material_id ?? null,
    p_currency: fields.currency ?? null,
    p_padding_cm: fields.padding_cm ?? null,
    p_item_measure_unit: fields.item_measure_unit ?? null,
    p_item_weight_unit: fields.item_weight_unit ?? null,
    p_item_barcode: fields.item_barcode ?? null,
    p_inner_pack_measure_unit: fields.inner_pack_measure_unit ?? null,
    p_inner_pack_weight_unit: fields.inner_pack_weight_unit ?? null,
    p_inner_pack_barcode: fields.inner_pack_barcode ?? null,
    p_inner_pack_cbm: fields.inner_pack_cbm ?? null,
    p_master_pack_measure_unit: fields.master_pack_measure_unit ?? null,
    p_master_pack_weight_unit: fields.master_pack_weight_unit ?? null,
    p_master_pack_barcode: fields.master_pack_barcode ?? null,
    p_units_per_40hq: fields.units_per_40hq ?? null,
  })
  if (error) throw new Error(error.message)
  return data // new sku id
}

// Deletes a staging row outright; if it was already confirmed, soft-deletes
// the linked `skus` record instead of touching it directly (see
// delete_sku_import_row in sql/sku_import.sql).
async function deleteRow(rowId, { deletedBy, reason }) {
  const { error } = await supabase.rpc('delete_sku_import_row', {
    p_row_id: rowId,
    p_deleted_by: deletedBy,
    p_reason: reason || null,
  })
  if (error) throw new Error(error.message)
}

// Deletes a whole batch — its rows cascade away via the FK. Never touches
// `skus`; a confirmed row's real SKU record persists regardless.
async function deleteBatch(batchId) {
  const { error } = await supabase.from('sku_import_batches').delete().eq('id', batchId)
  if (error) throw new Error(error.message)
}

export function useSkuImport() {
  return { importSkuSheet, createBatch, createManualBatch, addManualRow, deleteRow, deleteBatch, listBatches, getBatch, confirmRow, confirmPiRow, deletePiRow, uploadSkuImage, updateSkuDirect, createSkuDirect }
}
