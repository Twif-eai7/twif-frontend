import { Fragment, useState } from 'react'
import { createPortal } from 'react-dom'
import { FIELD_GROUPS } from './skuFieldGroups'
import { publicUrl } from './poUtils'
import PiPreviewPanel from './PiPreviewPanel'

// This drawer's own fixed width (max-w-2xl) — PiPreviewPanel sits to the
// left of it, offset by this many px so the two never overlap. Same
// convention SkuReviewDrawer.jsx's DRAWER_WIDTH_PX uses.
const DRAWER_WIDTH_PX = 672

// These three groups are laid out column-major (see skuFieldGroups.js's field
// order for each) — qty/weight/barcode in column one, length/breadth/height
// in column two — rather than the default row-major 2-column flow.
const COLUMN_MAJOR_GROUPS = new Set(['Weight & Dimensions', 'Inner Pack', 'Master Pack'])

// weight_kg / inner_pack_weight_kg / master_pack_weight_kg are always stored
// in kg (see SkuReviewDrawer.jsx) — converted back to item_weight_unit here
// purely for display, so this view stays consistent with the "Weight Unit"
// field shown alongside it instead of showing a kg number next to "lbs".
const WEIGHT_KG_KEYS = new Set(['weight_kg', 'inner_pack_weight_kg', 'master_pack_weight_kg'])
const KG_PER_LB = 0.45359237

function ReadOnlyField({ label, value }) {
  return (
    <div>
      <div className="text-xs font-semibold text-gray-700 mb-1">{label}</div>
      <div className="text-sm font-semibold text-gray-900 min-h-[20px]">{value ?? <span className="text-gray-300 font-normal">—</span>}</div>
    </div>
  )
}

// colour reads from sku_variant — skus has no dedicated colour column, same
// as everywhere else this convention shows up (see confirm_sku_import_row's
// own comment on this in sql/sku_import.sql).
function valueFor(sku, key) {
  if (key === 'colour') return sku.sku_variant
  if (key === 'base_price') {
    if (sku.base_price == null) return null
    return sku.currency ? `${sku.base_price} ${sku.currency}` : sku.base_price
  }
  if (WEIGHT_KG_KEYS.has(key) && sku[key] != null && sku.item_weight_unit === 'lbs') {
    return Math.round((Number(sku[key]) / KG_PER_LB) * 1000) / 1000
  }
  return sku[key]
}

// Read-only viewer for Item Master — reuses SkuReviewDrawer's FIELD_GROUPS
// as the single source of truth for section/field labels, just renders
// plain text instead of inputs. Image/category/material/buyer-vendor are
// shown above the field groups since (like in SkuReviewDrawer) they aren't
// part of that flat field list. Edit hands off to the real edit drawer —
// this component has no save path of its own.
export default function SkuDetailDrawer({ sku, onClose, onEdit, piFileUrl, productDetailsFileUrl, poFileUrl, nested }) {
  // Which reference doc (if any) is currently shown alongside this drawer —
  // 'pi' | 'productDetails' | 'po' | null. Only relevant when opened from a
  // specific PO's line item (Item Master's own browsing has no PO context,
  // so none of these props get passed there and no buttons show). Declared
  // before the early return below — hooks must run in the same order every
  // render regardless of whether `sku` is set yet.
  const [previewDoc, setPreviewDoc] = useState(null)

  if (!sku) return null

  const imageUrl = sku.image_url ? publicUrl(sku.image_url) : null

  return createPortal(
    <>
      {/* PoDrawer's line-item click passes `nested` — no backdrop, so
          PoDrawer stays visible/usable behind this panel instead of being
          fully obscured by a second dimming overlay, same as
          SkuReviewDrawer's own `nested` prop. */}
      {!nested && <div className="fixed inset-0 z-[130] bg-black/40" onClick={onClose} />}
      <div className="fixed inset-y-0 right-0 z-[140] w-full max-w-2xl bg-white shadow-2xl flex flex-col">

        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 flex-shrink-0 bg-gradient-to-r from-gray-50 to-white">
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-gray-900">{sku.buyer_sku_ref || 'SKU'}</h2>
            <p className="text-xs text-gray-500 mt-0.5 truncate">{sku.description || 'No description'}</p>
          </div>
          {piFileUrl && (
            <button type="button" onClick={() => setPreviewDoc(d => d === 'pi' ? null : 'pi')}
              className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-gray-200 bg-white text-[10px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors flex-shrink-0 cursor-pointer">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" /><circle cx="12" cy="12" r="3" />
              </svg>
              {previewDoc === 'pi' ? 'Hide PI' : 'View PI'}
            </button>
          )}
          {productDetailsFileUrl && productDetailsFileUrl !== piFileUrl && (
            <button type="button" onClick={() => setPreviewDoc(d => d === 'productDetails' ? null : 'productDetails')}
              className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-gray-200 bg-white text-[10px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors flex-shrink-0 cursor-pointer">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" /><circle cx="12" cy="12" r="3" />
              </svg>
              {previewDoc === 'productDetails' ? 'Hide Sheet' : 'View Sheet'}
            </button>
          )}
          {poFileUrl && (
            <button type="button" onClick={() => setPreviewDoc(d => d === 'po' ? null : 'po')}
              className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-gray-200 bg-white text-[10px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors flex-shrink-0 cursor-pointer">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" /><circle cx="12" cy="12" r="3" />
              </svg>
              {previewDoc === 'po' ? 'Hide PO' : 'View PO'}
            </button>
          )}
          <button type="button" onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-black transition-colors flex-shrink-0 cursor-pointer">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-5">
          <div className="flex flex-col sm:flex-row items-start gap-4">
            {imageUrl ? (
              <img src={imageUrl} alt={sku.buyer_sku_ref} className="w-32 h-32 rounded-xl object-cover border border-gray-200 flex-shrink-0" />
            ) : (
              <div className="w-32 h-32 rounded-xl bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-300 flex-shrink-0">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </div>
            )}
            <div className="flex-1 min-w-0 grid grid-cols-2 gap-3">
              <ReadOnlyField label="Buyer" value={sku.buyer?.display_name} />
              <ReadOnlyField label="Category" value={sku.category?.name} />
              <ReadOnlyField label="Primary Material" value={sku.primary_material?.label || sku.primary_base_material} />
              <ReadOnlyField label="Secondary Material" value={sku.secondary_material?.label || sku.secondary_base_material} />
              <ReadOnlyField label="Auto-generated Ref" value={sku.auto_generated_sku_ref} />
              <ReadOnlyField label="Created By" value={sku.created_by?.full_name} />
            </div>
          </div>

          {FIELD_GROUPS.map(group => (
            <Fragment key={group.title}>
            <div>
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2">{group.title}</h3>
              <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 ${COLUMN_MAJOR_GROUPS.has(group.title) ? 'sm:grid-flow-col sm:grid-rows-3' : ''}`}>
                {group.fields.map(([key, label]) => (
                  <ReadOnlyField key={key} label={label} value={valueFor(sku, key)} />
                ))}
                {group.title === 'Pricing' && <ReadOnlyField label="Currency" value={sku.currency} />}
              </div>
            </div>
            {/* One unit choice covers item/inner pack/master pack alike —
                shown once, right after Pricing and before those groups
                start, so it reads as governing everything below it. */}
            {group.title === 'Pricing' && (
              <div>
                <h3 className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-2">Units</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <ReadOnlyField label="Measurement Unit" value={sku.item_measure_unit} />
                  <ReadOnlyField label="Weight Unit" value={sku.item_weight_unit} />
                </div>
              </div>
            )}
            </Fragment>
          ))}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-3 border-t border-gray-100 flex-shrink-0">
          <button type="button" onClick={onClose}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer">
            Close
          </button>
          <button type="button" onClick={onEdit}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gray-900 text-sm font-medium text-white hover:bg-gray-700 transition-colors cursor-pointer">
            Edit
          </button>
        </div>
      </div>

      {previewDoc === 'pi' && (
        <PiPreviewPanel url={publicUrl(piFileUrl)} offsetRightPx={DRAWER_WIDTH_PX} title="PI Document" onClose={() => setPreviewDoc(null)} />
      )}
      {previewDoc === 'productDetails' && (
        <PiPreviewPanel url={publicUrl(productDetailsFileUrl)} offsetRightPx={DRAWER_WIDTH_PX} title="Product Sheet" onClose={() => setPreviewDoc(null)} />
      )}
      {previewDoc === 'po' && (
        <PiPreviewPanel url={publicUrl(poFileUrl)} offsetRightPx={DRAWER_WIDTH_PX} title="PO Document" onClose={() => setPreviewDoc(null)} />
      )}
    </>,
    document.body
  )
}
