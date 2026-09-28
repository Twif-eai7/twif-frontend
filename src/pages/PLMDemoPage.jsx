import { useState } from 'react'
import { Navigate, Link } from 'react-router-dom'
import { useOrgDepartment } from '../stores/profileStore'
import { STATUS_LABELS, STATUS_COLORS } from '../stores/plmStore'
import DemoWorkspaceModal from '../components/plm/modals/DemoWorkspaceModal'
import ImageEditorModal from '../components/plm/modals/ImageEditorModal'
import { loadDemoState, saveDemoState, resetDemoState } from '../utils/plmDemoState'

const LABELS = { description: 'Description', category: 'Category', season: 'Season', material: 'Material', finish: 'Finish', weight: 'Weight (kg)', dimensions: 'Dimensions' }

// Local-only "Edit Attributes" form — same single-card layout as the real BulkEditModal
// (300×300 image thumbnail with hover-to-edit, same field styling), but for exactly one SKU
// and writing to sessionSku (plain component state) instead of the backend, so it never saves.
function EditAttributesModal({ sku, onSave, onClose, onEditImage }) {
  const [draft, setDraft] = useState(() => ({
    description: sku.description || '',
    category:    sku.category    || '',
    season:      sku.season      || '',
    material:    sku.material    || '',
    finish:      sku.finish      || '',
    weight:      sku.weight != null ? String(sku.weight) : '',
    dimensions:  sku.dimensions  || '',
  }))
  const setField = (field, val) => setDraft(d => ({ ...d, [field]: val }))

  return (
    <div className="fixed inset-0 z-[1050] flex items-center justify-center bg-black/40">
      <div className="bg-white w-full max-w-5xl mx-4 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-black/10 flex-shrink-0">
          <div>
            <span className="text-[13px] font-bold uppercase tracking-[.06em]">Edit attributes</span>
            <span className="text-[12px] text-black/50 ml-2">1 SKU</span>
          </div>
          <button onClick={onClose} className="text-black/40 hover:text-black text-lg leading-none cursor-pointer border-none bg-none">×</button>
        </div>

        {/* Card */}
        <div className="overflow-y-auto p-5">
          <div className="border border-black/10 flex">
            {/* Image */}
            <div className="bg-white flex-shrink-0 relative group/img overflow-hidden" style={{ width: 300, height: 300 }}>
              {sku.image_url ? (
                <>
                  <img src={sku.image_url} alt={sku.auto_code} className="absolute inset-0 w-full h-full object-contain" />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={onEditImage}
                      className="flex flex-col items-center gap-1.5 bg-black/50 hover:bg-black/70 px-4 py-3 rounded transition-colors cursor-pointer border-none"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                      </svg>
                      <span className="text-[10px] font-bold uppercase tracking-[.07em] text-white">Edit Image</span>
                    </button>
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  onClick={onEditImage}
                  className="absolute inset-0 flex flex-col items-center justify-center gap-2 hover:opacity-60 transition-opacity cursor-pointer border-none bg-transparent w-full"
                >
                  <div className="w-10 h-10 bg-black/[.08] rounded-sm flex items-center justify-center">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1A1A18" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="17 8 12 3 7 8"/>
                      <line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                  </div>
                  <span className="text-[9px] font-bold uppercase tracking-[.07em] text-black/40">Add Image</span>
                </button>
              )}
            </div>

            {/* Fields */}
            <div className="flex-1 p-3 flex flex-col gap-1.5 border-l border-black/10 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold uppercase tracking-[.08em] text-black/70 font-mono">{sku.auto_code}</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {['category', 'season'].map(f => (
                  <div key={f} className="flex flex-col gap-0.5">
                    <span className="text-[9px] font-bold uppercase tracking-[.07em] text-black/55">{LABELS[f]}</span>
                    <input
                      className="px-2 py-1.5 border-b border-black/20 text-[12px] bg-[#e9e9e93d] outline-none uppercase focus:border-black/60"
                      value={draft[f]}
                      onChange={ev => setField(f, ev.target.value)}
                      placeholder={LABELS[f]}
                    />
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-0.5">
                <span className="text-[9px] font-bold uppercase tracking-[.07em] text-black/55">Description</span>
                <input
                  className="px-2 py-1.5 border-b border-black/20 text-[12px] bg-[#e9e9e93d] outline-none uppercase focus:border-black/60"
                  value={draft.description}
                  onChange={ev => setField('description', ev.target.value)}
                  placeholder="Description"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                {['finish', 'material'].map(f => (
                  <div key={f} className="flex flex-col gap-0.5">
                    <span className="text-[9px] font-bold uppercase tracking-[.07em] text-black/55">{LABELS[f]}</span>
                    <input
                      className="px-2 py-1.5 border-b border-black/20 text-[12px] bg-[#e9e9e93d] outline-none uppercase focus:border-black/60"
                      value={draft[f]}
                      onChange={ev => setField(f, ev.target.value)}
                      placeholder={LABELS[f]}
                    />
                  </div>
                ))}
              </div>

              <div className="flex gap-2 items-end">
                <div className="flex flex-col gap-0.5 flex-1">
                  <span className="text-[9px] font-bold uppercase tracking-[.07em] text-black/55">Weight (kg)</span>
                  <input
                    className="px-2 py-1.5 border-b border-black/20 text-[12px] bg-[#e9e9e93d] outline-none focus:border-black/60 w-full"
                    value={draft.weight}
                    onChange={ev => setField('weight', ev.target.value)}
                    placeholder="0"
                  />
                </div>
                <div className="flex flex-col gap-0.5 flex-1">
                  <span className="text-[9px] font-bold uppercase tracking-[.07em] text-black/55">Dimensions</span>
                  <input
                    className="px-2 py-1.5 border-b border-black/20 text-[12px] bg-[#e9e9e93d] outline-none focus:border-black/60 w-full"
                    value={draft.dimensions}
                    onChange={ev => setField('dimensions', ev.target.value)}
                    placeholder="L × W × H"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-3 border-t border-black/10 flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-[11px] font-bold uppercase tracking-[.06em] border border-black/20 bg-white cursor-pointer hover:bg-black/5">
            Cancel
          </button>
          <button onClick={() => onSave(draft)}
            className="px-4 py-2 text-[11px] font-bold uppercase tracking-[.06em] bg-[#1A1A18] text-[#F5F3EF] cursor-pointer hover:opacity-80"
          >
            Save attributes
          </button>
        </div>
      </div>
    </div>
  )
}

function readBlobAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export default function PLMDemoPage() {
  const department = useOrgDepartment()
  const [state, setState] = useState(loadDemoState)
  const [open, setOpen] = useState(false)

  // Session-only overrides for the card's attributes/image — deliberately kept OUT of
  // `state` (which persists to localStorage via saveDemoState) so Edit Attributes / Edit
  // Image changes vanish on refresh instead of sticking around like the workspace flow does.
  const [sessionSku, setSessionSku] = useState({})
  const [editingAttrs, setEditingAttrs] = useState(false)
  const [editingImage, setEditingImage] = useState(false)

  if (department !== 'tech') return <Navigate to="/dashboard" replace />

  const update = (next) => { setState(next); saveDemoState(next) }
  const handleReset = () => {
    const fresh = resetDemoState()
    setState(fresh)
    setOpen(false)
    setSessionSku({})
  }

  const displaySku = { ...state.sku, ...sessionSku }

  const status = state.workspace_status
  const label  = STATUS_LABELS[status] || status
  const cls    = STATUS_COLORS[status] || 'bg-black/[.07] text-[#1A1A18]'

  return (
    <div className="h-screen flex flex-col bg-[#fbf9f5]">
      <div className="flex items-center justify-between px-10 py-3 border-b-2 border-[#1A1A18] bg-[#fbf9f5] flex-shrink-0">
        <span className="text-[32px] font-black uppercase tracking-tight leading-none text-[#1A1A18]">Pd-PLM Demo</span>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={handleReset}
            className="text-[11px] font-bold uppercase tracking-[.08em] text-black/50 hover:opacity-60 transition-opacity"
          >
            Reset Demo
          </button>
          <Link to="/plm" className="text-[11px] font-bold uppercase tracking-[.08em] text-[#1A1A18] hover:opacity-45 transition-opacity">
            Back to PLM
          </Link>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide px-10 py-10 flex items-center justify-center">
       <div className="flex items-center justify-between gap-14 min-[1920px]:gap-20 w-full max-w-[1200px] min-[1920px]:max-w-[1400px]">
        {/* Only ever one card here, so a fixed-width card with a bit of left breathing
            room looks better on a wide screen than a multi-column grid built for dozens
            of SKUs (which just leaves a large empty gap to its right). order-2 puts it on
            the right, after the info panel (order-1). */}
        <div className="order-2 w-[280px] min-[1920px]:w-[380px] flex-shrink-0">
          <div
            className="bg-white cursor-pointer relative flex flex-col transition-opacity active:opacity-60 group"
            onClick={() => setOpen(true)}
          >
            {/* Edit attributes — matches real SKUCard's top-right pencil button */}
            <button
              type="button"
              title="Edit attributes"
              onClick={e => { e.stopPropagation(); setEditingAttrs(true) }}
              className="absolute top-2 right-2 min-[1920px]:top-3 min-[1920px]:right-3 z-10 w-9 h-9 min-[1920px]:w-11 min-[1920px]:h-11 rounded-full border border-black/20 bg-[rgba(245,243,239,.92)] flex items-center justify-center cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity shadow-sm hover:bg-[#1A1A18] hover:[&>svg]:stroke-[#F5F3EF]"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#1A1A18" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="min-[1920px]:w-[14px] min-[1920px]:h-[14px]">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>

            <div className="bg-white relative overflow-hidden aspect-square w-full group-hover:bg-[#F5F3EF] transition-colors">
              {/* Edit image — matches real SKUCard's second top-right button */}
              <button
                type="button"
                title={displaySku.image_url ? 'Edit image' : 'Add image'}
                onClick={e => { e.stopPropagation(); setEditingImage(true) }}
                className="absolute top-2 right-12 min-[1920px]:top-3 min-[1920px]:right-16 z-10 w-9 h-9 min-[1920px]:w-11 min-[1920px]:h-11 rounded-full border border-black/20 bg-[rgba(245,243,239,.92)] flex items-center justify-center cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity shadow-sm hover:bg-[#1A1A18] hover:[&>svg]:stroke-[#F5F3EF]"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#1A1A18" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="min-[1920px]:w-[14px] min-[1920px]:h-[14px]">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <polyline points="21 15 16 10 5 21"/>
                </svg>
              </button>

              {displaySku.image_url ? (
                <img src={displaySku.image_url} alt={displaySku.description} loading="lazy" className="absolute inset-0 w-full h-full object-contain" />
              ) : (
                <div className="w-10 h-10 bg-black/[.08] rounded-sm absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
              )}
            </div>
            <div className="px-3 min-[1920px]:px-4 pb-3 min-[1920px]:pb-4 pt-2.5 min-[1920px]:pt-3.5 flex flex-col gap-1.5 min-[1920px]:gap-2 border-t border-black">
              <div className="text-[14px] min-[1920px]:text-[18px] font-extrabold uppercase tracking-[.02em] text-[#1A1A18] font-mono">
                {state.sku.auto_code}
              </div>
              <div className="flex gap-1 flex-wrap">
                <span className={`text-[9px] min-[1920px]:text-[11px] font-bold px-1.5 min-[1920px]:px-2 py-0.5 min-[1920px]:py-1 uppercase tracking-[.06em] ${cls}`}>{label}</span>
              </div>
              <div className="flex flex-col gap-1 min-[1920px]:gap-1.5">
                {[
                  ['Description', displaySku.description],
                  ['Material', displaySku.material],
                  ['Dimensions', displaySku.dimensions],
                  ['Finish', displaySku.finish],
                  ['Weight', `${displaySku.weight} kg`],
                ].map(([lbl, val]) => (
                  <div key={lbl} className="grid gap-10 text-[10px] leading-relaxed grid-cols-[72px_1fr] min-[1920px]:grid-cols-[92px_1fr]">
                    <span className="text-[9px] min-[1920px]:text-[11px] font-medium uppercase tracking-[.06em] text-black/75">{lbl}</span>
                    <span className="text-[9px] min-[1920px]:text-[11px] font-bold uppercase tracking-[.03em] break-words text-[#1A1A18]">{val || 'empty'}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Info panel — sits beside the card instead of stacked above it, matching how a
            real product detail view pairs an image with a description panel. order-1 puts
            it on the left, before the card (order-2). */}
        <div className="order-1 flex flex-col gap-4 min-[1920px]:gap-5 flex-1 min-w-0 max-w-[780px] min-[1920px]:max-w-[860px] pt-1">
          <h1 className="text-[26px] min-[1920px]:text-[38px] font-extrabold text-[#1A1A18] tracking-tight leading-tight whitespace-nowrap">
            Try the full PLM workspace flow
          </h1>
          <p className="text-[13px] min-[1920px]:text-[16px] text-black/55 leading-relaxed">
            This dummy SKU walks through the entire workspace lifecycle — Active → Approved to Sample →
            Sample → Ready — without ever touching real SKUs, buyers, or the backend. Click the card to
            open the interactive workspace and click through it just like the real thing.
          </p>
          <div className="flex flex-col gap-2.5 min-[1920px]:gap-3.5 border-t border-black/10 pt-4 min-[1920px]:pt-5">
            {[
              ['Undo', 'Steps the workspace back one stage at a time, inside the modal.'],
              ['Reset Demo', 'Restores everything — card and workspace — to the starting state.'],
              ['Edit Attributes / Edit Image', 'Local-only changes on the card itself — they reset on page refresh, they never save.'],
            ].map(([label, body]) => (
              <div key={label} className="flex gap-3 items-baseline">
                <span className="text-[10px] min-[1920px]:text-[12px] font-bold uppercase tracking-[.06em] text-[#1A1A18] w-[190px] min-[1920px]:w-[220px] flex-shrink-0">{label}</span>
                <span className="text-[12px] min-[1920px]:text-[14px] text-black/55 leading-relaxed">{body}</span>
              </div>
            ))}
          </div>
        </div>
       </div>
      </div>

      {open && (
        <DemoWorkspaceModal state={state} onChange={update} onClose={() => setOpen(false)} />
      )}

      {editingAttrs && (
        <EditAttributesModal
          sku={displaySku}
          onClose={() => setEditingAttrs(false)}
          onSave={draft => { setSessionSku(s => ({ ...s, ...draft })); setEditingAttrs(false) }}
          onEditImage={() => setEditingImage(true)}
        />
      )}

      {editingImage && (
        <ImageEditorModal
          imageUrl={displaySku.image_url}
          onSave={async (blob) => {
            const dataUrl = await readBlobAsDataUrl(blob)
            setSessionSku(s => ({ ...s, image_url: dataUrl }))
            setEditingImage(false)
          }}
          onClose={() => setEditingImage(false)}
        />
      )}
    </div>
  )
}
