// Summary Mode bucketing — mirrors the exact completion checks WorkspaceModal.jsx uses for its
// own tabs (buyer brief presence, findings save-guard, shipping mode-lock fields) so a SKU only
// ever lands here if the actual workspace UI would still show it as incomplete.

// Same required set handleApproveToSample (WorkspaceModal.jsx:1938-1940) uses to gate "Proceed
// to Sample" — a brief only actually unblocks the pipeline once all of these are filled, not
// just buyer_ref. Resolved per WorkspaceModal's own seeding rules (WorkspaceModal.jsx:1640-1652),
// which are NOT uniform:
//   - buyer_ref lives on the workspace row itself (ws.buyer_ref / sku.buyer_ref), never inside
//     the buyer_brief jsonb — checking buyer_brief.buyer_ref would near-always read empty.
//   - description/material fall back to the SKU's own catalog attribute when the brief doesn't
//     override it.
//   - color/unit_price/unit_qty/image_url have no fallback — must be set on buyer_brief itself.
export function resolveBriefField(field, sku) {
  const brief = sku.buyer_brief || {}
  switch (field) {
    case 'buyer_ref':   return sku.buyer_ref
    case 'description': return brief.description || sku.description
    case 'material':    return brief.material    || sku.material
    default:             return brief[field]
  }
}
export const REQUIRED_BRIEF_FIELDS = [
  ['buyer_ref',   'Buyer Reference'],
  ['description', 'Description'],
  ['color',       'Colour'],
  ['material',    'Material'],
  ['unit_price',  'Target Price'],
  ['unit_qty',    'Unit Qty'],
  ['image_url',   'Reference Image'],
]

const REQUIRED_FINDING_FIELDS = [
  ['actual_weight', 'Actual Weight'], ['actual_l', 'Actual Length'], ['actual_w', 'Actual Width'], ['actual_h', 'Actual Height'],
  ['inner_qty', 'Inner Qty'], ['inner_l', 'Inner Length'], ['inner_w', 'Inner Width'], ['inner_h', 'Inner Height'],
  ['master_qty', 'Master Qty'], ['master_l', 'Master Length'], ['master_w', 'Master Width'], ['master_h', 'Master Height'],
  ['cbm', 'CBM'],
]

// Same mapping WorkspaceModal's Shipping tab uses to decide which fields a chosen mode needs.
export const SHIP_MODE_FIELDS = {
  air:       [['courier_company', 'Courier Company'], ['tracking_ref', 'Tracking Ref'], ['sample_delivered_date', 'Sample Delivered Date']],
  container: [['container_no', 'Container No'], ['vessel_no', 'Vessel No'], ['etd', 'ETD'], ['eta', 'ETA']],
}

// key: bucket id · label: header text · tab: which WorkspaceModal tab "Open" should jump to
// (see initialTab in plmStore) · status buckets (on_hold/dropped/inactive) carry no missing-field
// detail, they're paused/stopped states rather than a data gap.
export const SUMMARY_BUCKETS = [
  { key: 'brief',       label: 'Need Briefs',                   tab: 'buyer' },
  { key: 'price_qty',   label: 'Need Price & Quantity',         tab: 'sample' },
  { key: 'ready_date',  label: 'Need Sample Ready Date',        tab: 'sample' },
  { key: 'findings',    label: 'Need Sample Findings & Images', tab: 'sample' },
  { key: 'shipping',    label: 'Need Shipping Details',         tab: 'shipping' },
  { key: 'complete',    label: 'Completed',                     tab: null },
  { key: 'on_hold',        label: 'On Hold',       tab: null },
  { key: 'dropped',        label: 'Dropped',       tab: null },
  { key: 'inactive',       label: 'Inactive',      tab: null },
  { key: 'production_sku', label: 'Production SKU', tab: null },
]

// Returns { bucket, missing: [label, ...] } for a single catalog-list sku row (as shaped by
// plmStore's fetchCatalog merchant branch — needs workspace_id, workspace_status, buyer_brief,
// sample_order). Every SKU lands in exactly one bucket — even ones with no workspace at all get
// 'inactive', matching how the top filter bar's Status: Inactive already counts them (see
// SKUStatusBadge/usePLMFiltered's `workspace_status ?? 'inactive'` fallback) — except ones
// mid-sample with a ready date already set, which return null (on track, nothing currently
// blocking, so surfacing them anywhere would just be noise).
export function classifySku(sku) {
  // Production-linked SKUs (created from an already-production SKU) never get a workspace of
  // their own — see PLMPage.jsx's handleCreateWorkspaces guard — so they'd otherwise fall
  // through to the workspace_id check below and get miscounted as Inactive. usePLMFiltered
  // already special-cases this exact thing for the Status filter's 'production_sku' value;
  // this bucket needs to agree with it rather than diverge.
  if (sku.production_sku_id) return { bucket: 'production_sku', missing: [] }

  // No workspace at all reads as "Inactive" everywhere else in the app (filter bar, SKU card
  // badge) via the same fallback — Summary Mode's Inactive count needs to agree with that,
  // not silently drop these SKUs from every bucket.
  if (!sku.workspace_id) return { bucket: 'inactive', missing: [] }

  // Paused/stopped workspaces are pulled out before any data-gap check — being on hold,
  // dropped, or never having had a buyer accept the invite (the 'inactive' fallback used
  // throughout the app, see SKUStatusBadge/usePLMFiltered) isn't a "gap to fill", it's a
  // separate state that would otherwise get miscounted as e.g. "Need Briefs".
  if (sku.workspace_status === 'on_hold')  return { bucket: 'on_hold',  missing: [] }
  if (sku.workspace_status === 'rejected') return { bucket: 'dropped',  missing: [] }
  // workspace_status is 'inactive' either literally (a real DB value, see STATUS_LABELS) or
  // by omission (null/undefined — the fallback SKUStatusBadge/usePLMFiltered apply) — both
  // read the same way in the UI, so both need to land here rather than falling through.
  if (!sku.workspace_status || sku.workspace_status === 'inactive') return { bucket: 'inactive', missing: [] }

  // Whole-brief-missing and partially-filled-brief both land here, reporting exactly which of
  // the fields "Proceed to Sample" actually requires are still empty — not just buyer_ref.
  const briefMissing = REQUIRED_BRIEF_FIELDS
    .filter(([f]) => !resolveBriefField(f, sku)?.toString().trim())
    .map(([, label]) => label)
  if (briefMissing.length) return { bucket: 'brief', missing: briefMissing }

  const so = sku.sample_order
  const priceMissing = !so || so.confirmed_price == null
  const qtyMissing   = !so || so.confirmed_qty   == null
  if (priceMissing || qtyMissing) {
    const missing = []
    if (priceMissing) missing.push('Confirmed price')
    if (qtyMissing)   missing.push('Confirmed qty')
    return { bucket: 'price_qty', missing }
  }

  // Sample order exists and is priced/qty'd but not yet marked "ready" — the only thing to
  // chase at this stage is the ready date; findings/images don't make sense to ask for until
  // the sample is physically ready, so that check is deliberately gated behind sample_status
  // below rather than evaluated unconditionally like it used to be.
  if (so.sample_status !== 'ready') {
    if (!so.target_ready_date) return { bucket: 'ready_date', missing: ['Sample Ready Date'] }
    return null // ready date is set — waiting on the physical sample, nothing to flag yet
  }

  const findings = so.findings || {}
  const findingsMissing = REQUIRED_FINDING_FIELDS
    .filter(([f]) => findings[f] == null || findings[f] === '')
    .map(([, label]) => label)
  if (!findings.sample_images?.length) findingsMissing.unshift('Sample images')
  if (findingsMissing.length) return { bucket: 'findings', missing: findingsMissing }

  // findings.cbm is guaranteed set past this point (it's in REQUIRED_FINDING_FIELDS) — matching
  // WorkspaceModal's own gate for when the Shipping tab appears at all.
  const modeFields = SHIP_MODE_FIELDS[so.ship_mode]
  if (!modeFields) return { bucket: 'shipping', missing: ['Shipping mode'] }
  const shippingMissing = modeFields
    .filter(([f]) => !so[f])
    .map(([, label]) => label)
  if (shippingMissing.length) return { bucket: 'shipping', missing: shippingMissing }

  return { bucket: 'complete', missing: [] }
}

// Buckets an array of catalog-list skus (see classifySku) into { [bucketKey]: sku[] }.
export function bucketSkus(skus) {
  const out = Object.fromEntries(SUMMARY_BUCKETS.map(b => [b.key, []]))
  for (const sku of skus) {
    const result = classifySku(sku)
    if (result) out[result.bucket].push({ ...sku, _missing: result.missing })
  }
  return out
}
