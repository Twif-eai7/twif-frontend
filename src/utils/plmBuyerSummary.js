// Buyer Summary — a second, separate pipeline view from Summary Mode (plmSummary.js). That one
// buckets SKUs by data GAPS (missing brief, missing price, ...). This one buckets by PIPELINE
// STAGE (Design to be Sent, Negotiate Costing, ...) for one buyer at a time, mirroring an
// existing Excel report the merchandising team keeps by hand. There is no dedicated "stage"
// column anywhere in the DB — every stage below is inferred from the same workspace_status /
// buyer_brief / sample_order fields plmSummary.js already reads, per an explicit field-by-field
// mapping worked out with the merchandising team (see PR discussion for the full reasoning):
//   - Design to be Sent   → no workspace, or workspace_status inactive/invited
//   - Negotiate Costing   → active, no sample order yet, buyer_brief still missing required fields
//   - Costing Under Review→ active, no sample order yet, buyer_brief fully filled (confirm pending)
//   - Revise Design       → active, but a sample order already exists (rolled back via "Confirm
//                            Roll Back" — requestRevision in plmStore.js resets status to 'active'
//                            without deleting the existing sample order, which is what
//                            distinguishes this from the two costing stages above)
//   - Approved to Sample  → approved, sample order exists, shipping fields not all filled yet
//   - At JYC               → approved, sample order exists, shipping fields (per ship_mode) all
//                            filled — i.e. sample physically shipped and received
//   - Sample Approved     → workspace_status sample/production (buyer clicked Accept Sample)
// on_hold / rejected / production_sku SKUs are deliberately excluded (classifyBuyerStage returns
// null) — matching the source report, which has no columns for them.
import { resolveBriefField, REQUIRED_BRIEF_FIELDS, SHIP_MODE_FIELDS } from './plmSummary'

// tab: which WorkspaceModal tab "Open" should jump to for a SKU in that stage (see initialTab
// in plmStore) — mirrors the same idea plmSummary.js's SUMMARY_BUCKETS uses.
export const BUYER_STAGES = [
  { key: 'design_to_be_sent',    label: 'Design to be Sent',     tab: null },
  { key: 'negotiate_costing',    label: 'Negotiate Costing',     tab: 'buyer' },
  { key: 'costing_under_review', label: 'Costing Under Review',  tab: 'buyer' },
  { key: 'at_jyc',               label: 'At JYC',                tab: 'shipping' },
  { key: 'revise_design',        label: 'Revise Design',         tab: 'buyer' },
  { key: 'approved_to_sample',   label: 'Approved to Sample',    tab: 'sample' },
  { key: 'sample_approved',      label: 'Sample Approved',       tab: 'shipping' },
]

// 'At JYC' names the buyer's own review step, so its header/text reads as "At <Buyer Name>"
// instead of the internal-only "JYC" abbreviation once a specific buyer is in view.
export function labelForStage(key, buyerName) {
  if (key === 'at_jyc' && buyerName) return `At ${buyerName}`
  return BUYER_STAGES.find(s => s.key === key)?.label || key
}

function isBriefComplete(sku) {
  return REQUIRED_BRIEF_FIELDS.every(([f]) => !!resolveBriefField(f, sku)?.toString().trim())
}

function isShippingComplete(so) {
  const fields = SHIP_MODE_FIELDS[so.ship_mode]
  if (!fields) return false
  return fields.every(([f]) => !!so[f])
}

// Returns a BUYER_STAGES key, or null if the SKU shouldn't appear in this report at all
// (production-linked, on hold, or dropped).
export function classifyBuyerStage(sku) {
  if (sku.production_sku_id) return null
  if (sku.workspace_status === 'on_hold' || sku.workspace_status === 'rejected') return null

  if (!sku.workspace_id || !sku.workspace_status || ['inactive', 'invited'].includes(sku.workspace_status))
    return 'design_to_be_sent'

  if (sku.workspace_status === 'active') {
    if (sku.sample_order) return 'revise_design'
    return isBriefComplete(sku) ? 'costing_under_review' : 'negotiate_costing'
  }

  if (sku.workspace_status === 'approved') {
    const so = sku.sample_order
    return (so && isShippingComplete(so)) ? 'at_jyc' : 'approved_to_sample'
  }

  if (['sample', 'sample_shipped', 'production'].includes(sku.workspace_status)) return 'sample_approved'

  return null
}

// Rows = one per category present in `skus`, columns = BUYER_STAGES counts, plus a row total
// ("Total in Development" — the sum of the 7 stage columns, matching the source report). Each
// cell also carries its own sku list (cellSkus) so the table can drill into "which SKUs" on click.
export function buildCategoryStageMatrix(skus) {
  const categories = [...new Set(skus.map(s => s.category).filter(Boolean))].sort()
  const rows = categories.map(category => {
    const cellSkus = Object.fromEntries(BUYER_STAGES.map(s => [s.key, []]))
    skus.filter(s => s.category === category).forEach(s => {
      const stage = classifyBuyerStage(s)
      if (stage) cellSkus[stage].push(s)
    })
    const counts = Object.fromEntries(BUYER_STAGES.map(s => [s.key, cellSkus[s.key].length]))
    const total  = Object.values(counts).reduce((a, b) => a + b, 0)
    return { category, counts, cellSkus, total }
  })
  const totals = Object.fromEntries(
    BUYER_STAGES.map(s => [s.key, rows.reduce((sum, r) => sum + r.counts[s.key], 0)])
  )
  const grandTotal = rows.reduce((sum, r) => sum + r.total, 0)
  // categories is derived from ALL skus, not just in-development ones — a category whose
  // every SKU is outside the buyer-stage pipeline (classifyBuyerStage returns null for all
  // of them) ends up here with every cell empty. Drop those rather than show an all-dash row.
  return { rows: rows.filter(r => r.total > 0), totals, grandTotal }
}

// Rows = one per factory (sku.supplier), columns = category counts — only SKUs that classify
// into some stage (i.e. are actually "in development") are counted, matching the category table.
// Each cell also carries its own sku list (cellSkus) for drill-down, same as above.
export function buildFactoryCategoryMatrix(skus) {
  const inDev = skus.filter(s => classifyBuyerStage(s) != null)
  const categories = [...new Set(inDev.map(s => s.category).filter(Boolean))].sort()
  const factories  = [...new Set(inDev.map(s => s.supplier || 'Unassigned'))].sort()
  const rows = factories.map(factory => {
    const cellSkus = Object.fromEntries(categories.map(c => [c, []]))
    inDev.filter(s => (s.supplier || 'Unassigned') === factory).forEach(s => {
      if (s.category) cellSkus[s.category].push(s)
    })
    const counts = Object.fromEntries(categories.map(c => [c, cellSkus[c].length]))
    const total  = Object.values(counts).reduce((a, b) => a + b, 0)
    return { factory, counts, cellSkus, total }
  })
  const totals = Object.fromEntries(
    categories.map(c => [c, rows.reduce((sum, r) => sum + (r.counts[c] || 0), 0)])
  )
  const grandTotal = rows.reduce((sum, r) => sum + r.total, 0)
  // A factory can end up here with every cell empty when its only in-development SKU(s)
  // have no category assigned (classifyBuyerStage matched, but the per-category push above
  // is gated on s.category being truthy) — drop those rather than show an all-dash row.
  return { categories, rows: rows.filter(r => r.total > 0), totals, grandTotal }
}

// One-line auto-generated summary — surfaces the 3 stages with the most SKUs so the text
// actually says something useful rather than just restating the total.
export function buildSummaryText(buyerName, { grandTotal, totals }) {
  const leaders = BUYER_STAGES
    .map(s => ({ label: labelForStage(s.key, buyerName), count: totals[s.key] }))
    .filter(s => s.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .map(s => `${s.count} ${s.label.toLowerCase()}`)

  const name = buyerName || 'This buyer'
  if (!grandTotal) return `${name} has no SKUs currently in development.`
  return `${name} has ${grandTotal} SKU${grandTotal === 1 ? '' : 's'} in development` +
    (leaders.length ? ` — ${leaders.join(', ')}.` : '.')
}
