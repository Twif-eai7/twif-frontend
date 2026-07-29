import { useState } from 'react'
import { usePlmStore } from '../../stores/plmStore'
import SKUStatusBadge from './SKUStatusBadge'

const parseBrief = (raw) => {
  if (!raw) return {}
  if (typeof raw === 'string') { try { return JSON.parse(raw) } catch { return {} } }
  return raw
}

const CURRENCY_SYMBOLS = { USD: '$', GBP: '£', EUR: '€' }

export default function SKUCard({ sku, role, onEdit, onCardClick, onEditImage, isDuplicateLink }) {
  const selectedIds   = usePlmStore(s => s.selectedIds)
  const toggleSelect  = usePlmStore(s => s.toggleSelect)
  const openWorkspace = usePlmStore(s => s.openWorkspace)
  const toast         = usePlmStore(s => s.toast)

  const [showCatalog, setShowCatalog] = useState(false)

  const isSelected   = selectedIds.has(sku.id)
  const hasWorkspace = !!sku.workspace_id
  const brief        = parseBrief(sku.buyer_brief)

  const handleClick = () => {
    if (sku.production_sku_id) return  // production-linked SKUs are view-only
    // Block-list: only a batch explicitly uploaded via "Existing Production SKU" is blocked.
    // Historical uploads (sku_source is null, from before this column existed) are allowed,
    // same as they always were — sku_source only restricts NEW uploads going forward.
    if (sku.sku_source === 'existing') return
    // A temp_sku_ref alone only blocks opening for batches explicitly tagged 'existing' —
    // a 'new' (or historical/untagged) batch should open even while it still carries a temp
    // ref pending a real buyer ref, since that's expected for brand-new SKUs.
    if (sku.buyer_ref_status === 'pending_buyer_ref' && sku.sku_source === 'existing') return
    if (sku.workspace_id) {
      if (role === 'supplier' && !sku.supplier_invited) {
        toast?.('Workspace not yet active for your organisation')
        return
      }
      openWorkspace(sku.workspace_id, sku)
    } else if (role === 'supplier') {
      toast?.('Workspace not yet active for your organisation')
    } else {
      onCardClick?.(sku)
    }
  }

  // ── Display data ─────────────────────────────────────────────────────────────
  // When workspace active: default = brief data, toggle = catalog data
  const useBrief = hasWorkspace && !showCatalog && (brief.description || brief.material || brief.color || brief.image_url)

  const displayImg  = useBrief
    ? (brief.image_url || sku.image_url)
    : sku.image_url

  // Catalog dimensions: L×W×H if available, else nothing
  const catalogDims = [sku.length, sku.width, sku.height].filter(Boolean).length
    ? `${sku.length || '?'} × ${sku.width || '?'} × ${sku.height || '?'} ${sku.measurement || 'cm'}`
    : null

  // Frozen at "Proceed to Sample" time — shown once the workspace has actually been approved,
  // independent of whatever the (still-editable) buyer brief's target price says afterward.
  // Stays visible through every later stage of the same round (sample/production), not just
  // the moment it first flips to "approved" — a workspace that's since moved on to sample or
  // production still has that same frozen price, it just shouldn't disappear from the card.
  const approvedCurrency = sku.approved_currency || brief.currency || 'USD'
  const approvedPriceLabel = ['Price', ['approved', 'sample', 'production'].includes(sku.workspace_status) && sku.approved_price != null
    ? `${CURRENCY_SYMBOLS[approvedCurrency] || approvedCurrency}${sku.approved_price}`
    : null]

  const attrs = useBrief
    ? [
        ['Description', brief.description],
        ['Material',    brief.material],
        ['Colour',      brief.color],
        ['Dimensions',  brief.dimensions],
        ['Finish',      brief.finish],
        ['Weight',      brief.weight ? `${brief.weight} kg` : null],
        approvedPriceLabel,
      ]
    : [
        ['Description', sku.description],
        ['Material',    sku.material],
        ['Dimensions',  catalogDims],
        ['Finish',      sku.finish],
        ['Weight',      sku.weight ? `${sku.weight} kg` : null],
        approvedPriceLabel,
      ]

  return (
    <div
      className={`bg-white cursor-pointer relative flex flex-col transition-opacity active:opacity-60 group
        ${isSelected ? 'ring-2 ring-[#1A1A18]' : ''}
      `}
      onClick={handleClick}
    >
      {/* Select checkbox — merchant (non-read-only) always, buyer only on sample-stage SKUs.
          Kept selectable even for production-linked/non-'new' SKUs since selection also
          drives Edit Attributes / Delete / Create Sample PO — only "Create Workspaces"
          specifically excludes them (see handleCreateWorkspaces in PLMPage). */}
      {((role === 'merchant' && !sku.is_read_only) || (role === 'buyer' && !!sku.workspace_id)) && (
        <button
          type="button"
          title={isSelected ? 'Deselect' : 'Select'}
          onClick={e => { e.stopPropagation(); toggleSelect(sku.id) }}
          className={`absolute top-2 left-2 z-10 w-[22px] h-[22px] rounded-full flex items-center justify-center cursor-pointer transition-all
            border-[1.5px] shadow-sm
            ${isSelected
              ? 'bg-[#1A1A18] border-transparent'
              : 'bg-[rgba(245,243,239,.9)] border-black/30 opacity-0 group-hover:opacity-100'
            }`}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <polyline points="1.5 5 4 7.5 8.5 2.5" stroke={isSelected ? '#F5F3EF' : 'transparent'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      )}

      {/* Edit attributes button — merchant only, hidden when read-only */}
      {role === 'merchant' && !sku.is_read_only && (
        <button
          type="button"
          title="Edit attributes"
          onClick={e => { e.stopPropagation(); onEdit(sku) }}
          className="absolute top-2 right-2 z-10 w-9 h-9 rounded-full border border-black/20 bg-[rgba(245,243,239,.92)] flex items-center justify-center cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity shadow-sm hover:bg-[#1A1A18] hover:[&>svg]:stroke-[#F5F3EF]"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#1A1A18" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
      )}

      {/* Image */}
      <div className="bg-white relative overflow-hidden aspect-square w-full group-hover:bg-[#F5F3EF] transition-colors">
        {sku.image_processing && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white/80 backdrop-blur-[2px]">
            <svg className="animate-spin w-6 h-6 text-[#1A1A18]/50" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" strokeDasharray="40" strokeDashoffset="15"/>
            </svg>
            <span className="mt-2 text-[9px] font-semibold uppercase tracking-[.06em] text-[#1A1A18]/50">Processing</span>
          </div>
        )}
        {/* Edit image — merchant only, shown even when no image exists */}
        {role === 'merchant' && !sku.is_read_only && (
          <button
            type="button"
            title={sku.image_url ? 'Edit image' : 'Add image'}
            onClick={e => { e.stopPropagation(); onEditImage?.(sku) }}
            className="absolute top-2 right-12 z-10 w-9 h-9 rounded-full border border-black/20 bg-[rgba(245,243,239,.92)] flex items-center justify-center cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity shadow-sm hover:bg-[#1A1A18] hover:[&>svg]:stroke-[#F5F3EF]"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#1A1A18" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
          </button>
        )}

        {displayImg ? (
          <>
            <img src={displayImg} alt={sku.description || sku.auto_code} loading="lazy" className="absolute inset-0 w-full h-full object-contain"/>

            {/* Chevron toggle — replaces edit icons when workspace active and brief data exists */}
            {hasWorkspace && (brief.description || brief.material || brief.color || brief.image_url) && (
              <button
                type="button"
                onClick={e => { e.stopPropagation(); setShowCatalog(v => !v) }}
                title={showCatalog ? 'Show buyer brief' : 'Show original catalog'}
                className="absolute top-2 right-[5.5rem] z-10 w-9 h-9 rounded-full border border-black/20 bg-[rgba(245,243,239,.92)] flex items-center justify-center cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity shadow-sm hover:bg-[#1A1A18] hover:[&>svg]:stroke-[#F5F3EF]"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#1A1A18" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  {showCatalog
                    ? <polyline points="15 18 9 12 15 6"/>
                    : <polyline points="9 18 15 12 9 6"/>
                  }
                </svg>
              </button>
            )}

            {useBrief && brief.image_url && (
              <span className="absolute bottom-1.5 right-1.5 bg-[rgba(123,104,238,.9)] text-white text-[7px] font-extrabold uppercase tracking-[.06em] px-1.5 py-0.5 rounded-full z-[2] pointer-events-none">
                Ref
              </span>
            )}
          </>
        ) : (
          <div className="w-10 h-10 bg-black/[.08] rounded-sm absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"/>
        )}
      </div>

      {/* Body */}
      <div className="px-3 pb-3 pt-2.5 flex flex-col gap-1.5 border-t border-black">
        {/* Code */}
        <div className="text-[14px] font-extrabold uppercase tracking-[.02em] text-[#1A1A18] font-mono">
          {sku.auto_code}
          {sku.buyer_sku_ref && <span className="text-black/40"> · {sku.buyer_sku_ref}</span>}
          {sku.buyer_ref && <span className="text-black/40"> · {sku.buyer_ref}</span>}
          {sku.vendor_sku_ref && <span className="text-black/40"> · {sku.vendor_sku_ref}</span>}
          {!sku.production_sku_id && sku.temp_sku_ref && <span className="text-amber-500/70"> · {sku.temp_sku_ref}</span>}
        </div>

        {/* Badges */}
        <div className="flex gap-1 flex-wrap">
          {sku.production_sku_id && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 uppercase tracking-[.06em] bg-emerald-700 text-white">Production SKU</span>
          )}
          {isDuplicateLink && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 uppercase tracking-[.06em] bg-amber-500 text-white">Duplicate Link</span>
          )}
          {!sku.production_sku_id && !(sku.sku_source === 'existing' && !sku.workspace_status && !sku.status) && (
            <SKUStatusBadge sku={sku}/>
          )}
          {sku.buyer_ref_status === 'pending_buyer_ref' && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 uppercase tracking-[.06em] bg-amber-100 text-amber-700 border border-amber-300">
              Pending Ref
            </span>
          )}
        </div>

        {/* Attributes */}
        <div className="flex flex-col gap-1">
          {attrs.map(([label, val]) => (
            <AttrRow key={label} label={label} val={val}/>
          ))}
        </div>

        {/* Label when toggled to catalog view */}
        {hasWorkspace && showCatalog && (
          <div className="text-[9px] text-black/25 font-semibold uppercase tracking-[.05em]">Original catalog</div>
        )}
      </div>
    </div>
  )
}

function AttrRow({ label, val }) {
  return (
    <div className="grid gap-10 text-[10px] leading-relaxed" style={{ gridTemplateColumns: '72px 1fr' }}>
      <span className="text-[9px] font-medium uppercase tracking-[.06em] text-black/75">{label}</span>
      <span className={`text-[9px] font-bold uppercase tracking-[.03em] break-words ${val ? 'text-[#1A1A18]' : 'text-black/25'}`}>{val || 'empty'}</span>
    </div>
  )
}
