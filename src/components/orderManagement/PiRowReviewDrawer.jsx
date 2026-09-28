import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useSkuImport } from '../../hooks/useSkuImport'
import PiPreviewPanel from './PiPreviewPanel'
import { publicUrl } from './poUtils'

// Much smaller field set than SkuReviewDrawer's full FIELD_GROUPS — a PI
// line item only ever needs identity + qty/price, never the physical/
// logistics fields a product sheet has — so this is its own drawer rather
// than a pile of conditional branches inside that much larger component.
const FIELDS = [
  ['buyer_sku_ref', 'Buyer SKU Ref', true],
  ['sku_variant', 'Variant / Colour', false],
  ['description', 'Description', true],
  ['quantity_ordered', 'Quantity', true],
  ['unit_price', 'Unit Price', true],
  ['currency', 'Currency', false],
]
const REQUIRED_FIELDS = ['buyer_sku_ref', 'quantity_ordered', 'unit_price']
const NUMERIC_FIELDS = new Set(['quantity_ordered', 'unit_price'])
const CURRENCY_OPTIONS = ['USD', 'EUR', 'GBP', 'INR']

const DRAWER_WIDTH_PX = 480

function initValues(row, defaultCurrency) {
  const values = {}
  for (const [key] of FIELDS) {
    const v = row.confirmed?.[key] ?? row.needsConfirm?.[key]
    values[key] = v ?? (key === 'currency' ? (defaultCurrency || 'USD') : '')
  }
  return values
}

function tierOf(row, key) {
  if (row.confirmed?.[key] !== undefined && row.confirmed[key] !== null) return 'confirmed'
  if (row.needsConfirm?.[key] !== undefined) return 'flagged'
  if (row.needsInput && key in row.needsInput) return 'required'
  return 'empty'
}

function TierBadge({ tier }) {
  if (tier === 'confirmed') return <span className="text-[10px] font-medium text-emerald-600">Auto-filled</span>
  if (tier === 'flagged')   return <span className="text-[10px] font-medium text-amber-600">Please verify</span>
  if (tier === 'required')  return <span className="text-[10px] font-medium text-red-500">Required — missing</span>
  return null
}

// Rate implied by the PO's own amount/amount_usd — same convention
// PoDrawer.jsx's impliedRateFor/orderedValueUsd use, duplicated here rather
// than imported since both are one-line pure helpers private to their own
// drawer. A USD PO always converts at 1 regardless of whether amount_usd
// happens to be populated — ERP-synced POs routinely only set `amount`,
// which used to make this return null and blank out the order value even
// though no real conversion was ever needed.
function impliedRateFor(poAmount, poAmountUsd, poCurrency) {
  if (!poCurrency || poCurrency === 'USD') return 1
  return poAmountUsd && poAmount ? poAmountUsd / poAmount : null
}
function orderedValueUsd(qty, price, rate) {
  const q = parseFloat(qty)
  const p = parseFloat(price)
  if (Number.isNaN(q) || Number.isNaN(p) || rate == null) return null
  return q * p * rate
}

export default function PiRowReviewDrawer({ row, poId, poAmount, poAmountUsd, poCurrency, buyerOrgId, vendorId, memberId, piFileUrl, poFileUrl, onClose, onSaved }) {
  const { confirmPiRow } = useSkuImport()
  const [values, setValues] = useState(() => initValues(row, poCurrency))
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)
  const [missing, setMissing] = useState(new Set())
  // 'pi' | 'po' | null — same toggle pattern SkuReviewDrawer's own
  // View PI/Sheet/PO buttons use.
  const [previewDoc, setPreviewDoc] = useState(null)

  const setField = (key, value) => {
    setValues(prev => ({ ...prev, [key]: value }))
    setMissing(prev => { if (!prev.has(key)) return prev; const next = new Set(prev); next.delete(key); return next })
  }

  const handleSave = async () => {
    const missingNow = new Set(REQUIRED_FIELDS.filter(f => String(values[f] ?? '').trim() === ''))
    if (missingNow.size) {
      setMissing(missingNow)
      setError('Please fill in the required fields.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      const rate = impliedRateFor(poAmount, poAmountUsd, poCurrency)
      const orderValueUsd = orderedValueUsd(values.quantity_ordered, values.unit_price, rate)
      await confirmPiRow(row.rowId, {
        savedBy: memberId,
        poId,
        vendorId,
        buyerOrgId,
        fields: values,
        orderValueUsd,
      })
      onSaved(row.rowId, values)
    } catch (err) {
      setError(err.message || 'Could not save this line item. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <>
      <div className="fixed inset-0 z-[130] bg-black/40" onClick={!saving ? onClose : undefined} />
      <div className="fixed inset-y-0 right-0 z-[140] w-full bg-white shadow-2xl flex flex-col" style={{ maxWidth: DRAWER_WIDTH_PX }}>
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 flex-shrink-0 bg-gradient-to-r from-gray-50 to-white">
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-gray-900">Review PI Line Item</h2>
            <p className="text-xs text-gray-500 mt-0.5 truncate">
              {values.buyer_sku_ref || values.description || 'Unreviewed row'}
            </p>
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
          {poFileUrl && (
            <button type="button" onClick={() => setPreviewDoc(d => d === 'po' ? null : 'po')}
              className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-gray-200 bg-white text-[10px] font-semibold text-gray-600 hover:bg-gray-50 transition-colors flex-shrink-0 cursor-pointer">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" /><circle cx="12" cy="12" r="3" />
              </svg>
              {previewDoc === 'po' ? 'Hide PO' : 'View PO'}
            </button>
          )}
          <button type="button" onClick={!saving ? onClose : undefined}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-black transition-colors flex-shrink-0 cursor-pointer">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
          {row.skuId && (
            <div className="px-3 py-2 bg-indigo-50 border border-indigo-100 rounded-lg text-xs text-indigo-800">
              This ref already exists as a SKU — confirming will link this line item to it without changing
              any of its fields.
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {FIELDS.map(([key, label, required]) => {
              if (key === 'currency') {
                return (
                  <div key={key}>
                    <label className="text-xs font-semibold text-gray-700 block mb-1">{label}</label>
                    <select value={values.currency} onChange={e => setField('currency', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900 transition-colors cursor-pointer">
                      {CURRENCY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                )
              }
              const tier = tierOf(row, key)
              const showError = missing.has(key)
              return (
                <div key={key}>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-gray-700">
                      {label}{required && <span className="text-red-500 ml-0.5">*</span>}
                    </label>
                    <TierBadge tier={tier} />
                  </div>
                  <input
                    type={NUMERIC_FIELDS.has(key) ? 'number' : 'text'}
                    step={NUMERIC_FIELDS.has(key) ? 'any' : undefined}
                    value={values[key]}
                    onChange={e => setField(key, e.target.value)}
                    className={`w-full px-3 py-2 border rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900 transition-colors
                      ${showError ? 'border-red-400' : tier === 'flagged' ? 'border-amber-300' : 'border-gray-200'}`}
                  />
                </div>
              )
            })}
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 flex-shrink-0">
          <button type="button" onClick={onClose} disabled={saving}
            className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors cursor-pointer disabled:cursor-not-allowed">
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={saving}
            className="px-4 py-2 rounded-lg bg-gray-900 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 transition-colors cursor-pointer disabled:cursor-not-allowed">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {previewDoc === 'pi' && (
        <PiPreviewPanel url={publicUrl(piFileUrl)} offsetRightPx={DRAWER_WIDTH_PX} title="PI Document" onClose={() => setPreviewDoc(null)} />
      )}
      {previewDoc === 'po' && (
        <PiPreviewPanel url={publicUrl(poFileUrl)} offsetRightPx={DRAWER_WIDTH_PX} title="PO Document" onClose={() => setPreviewDoc(null)} />
      )}
    </>,
    document.body
  )
}
