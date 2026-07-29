import { useState, useRef, useCallback, useEffect } from 'react'
import { usePlmStore, SEASONS } from '../../../stores/plmStore'
import { useSupplierOrgs, useOrgsLoading } from '../../../stores/orgsStore'
import { useProfileStore } from '../../../stores/profileStore'
import { useCategorySelect } from '../../../hooks/useCategorySelect'
import CategorySelect from '../CategorySelect'
import ImageEditorModal from './ImageEditorModal'

function MinimiseIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  )
}
function ExpandIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
      <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
    </svg>
  )
}

export default function CreateSkuModal({ onClose }) {
  const createSku    = usePlmStore(s => s.createSku)
  const role         = usePlmStore(s => s.role)
  const supplierList = useSupplierOrgs()
  const orgsLoading  = useOrgsLoading()
  const orgMembership = useProfileStore(s => s.orgMembership)

  const [supplier, setSupplier] = useState(null)  // { id, name }
  const [mode,     setMode]     = useState('new') // 'new' | 'existing'

  useEffect(() => {
    if (role === 'supplier' && orgMembership?.orgId) {
      setSupplier({ id: orgMembership.orgId, name: orgMembership.orgDisplayName || orgMembership.orgName || 'My Organisation' })
    }
  }, [role, orgMembership])
  const { categoryLevels, categorySelections, catLoading, handleCategorySelect, deepestCategory } = useCategorySelect()

  const [saving,      setSaving]      = useState(false)
  const [minimized,   setMinimized]   = useState(false)
  const [dragging,    setDragging]    = useState(false)
  const [imageBlob,   setImageBlob]   = useState(null)
  const [preview,     setPreview]     = useState(null)
  const [editingUrl,  setEditingUrl]  = useState(null)
  const inputRef = useRef(null)

  const [fields, setFields] = useState({
    season:      '',
    description: '',
    material:        '',
    finish:          '',
    weight:          '',
    l:               '',
    w:               '',
    h:               '',
    measurement: 'cm',
  })

  const set = (k, v) => setFields(f => ({ ...f, [k]: v }))

  const handleFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return
    setEditingUrl(URL.createObjectURL(file))
  }

  const handleEditorSave = (blob) => {
    if (editingUrl) URL.revokeObjectURL(editingUrl)
    setEditingUrl(null)
    if (preview) URL.revokeObjectURL(preview)
    setImageBlob(blob)
    setPreview(URL.createObjectURL(blob))
  }

  const onDrop = useCallback(e => {
    e.preventDefault()
    setDragging(false)
    handleFile(e.dataTransfer.files[0])
  }, [])

  const handleSave = async () => {
    if (!imageBlob) { alert('Please add an image'); return }
    if (!supplier?.id) { alert(role === 'supplier' ? 'Organisation not resolved, try again' : 'Select a vendor first'); return }
    setSaving(true)
    try {
      const fd = new FormData()
      fd.append('image', imageBlob, `sku-${Date.now()}.png`)
      fd.append('supplierOrgId', supplier.id)
      fd.append('supplier', supplier.name)
      fd.append('mode', mode)
      Object.entries(fields).forEach(([k, v]) => { if (v) fd.append(k, v) })
      if (deepestCategory?.id) fd.append('categoryId', deepestCategory.id)
      await createSku(fd)
      onClose()
    } catch (err) {
      alert(err.message)
    } finally {
      setSaving(false)
    }
  }

  const MiniWidget = minimized && (
    <div
      onClick={() => setMinimized(false)}
      className="fixed bottom-5 right-5 z-[1001] cursor-pointer select-none flex items-center gap-3 px-4 py-3 bg-white shadow-[0_4px_20px_rgba(0,0,0,0.14)] border border-black/[.12] hover:border-black/25 transition-all duration-300"
      style={{ minWidth: 240 }}
    >
      <div className="flex-shrink-0">
        {saving
          ? <span className="block w-4 h-4 border-2 border-black/15 border-t-black/70 rounded-full animate-spin" />
          : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#1A1A18" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
        }
      </div>
      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
        <span className="text-[11px] font-bold uppercase tracking-[.07em] text-[#1A1A18]">Create SKU</span>
        <span className="text-[9px] font-semibold uppercase tracking-[.05em] text-black/45 truncate">
          {saving ? 'Creating…' : 'Fill in details'}
        </span>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0 ml-1">
        <button
          type="button"
          title="Expand"
          onClick={e => { e.stopPropagation(); setMinimized(false) }}
          className="w-6 h-6 flex items-center justify-center text-black/40 hover:text-black hover:bg-black/[.06] rounded cursor-pointer"
        >
          <ExpandIcon />
        </button>
        <button
          type="button"
          title="Close"
          onClick={e => { e.stopPropagation(); onClose() }}
          disabled={saving}
          className="w-6 h-6 flex items-center justify-center text-black/30 hover:text-black hover:bg-black/[.06] rounded cursor-pointer disabled:opacity-20 disabled:cursor-default text-[15px] leading-none"
        >
          ×
        </button>
      </div>
    </div>
  )

  return (
    <>
      {MiniWidget}

    <div className={`fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 ${minimized ? 'hidden' : ''}`}>
      <div className="bg-white w-full max-w-3xl mx-4 flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-black/10 flex-shrink-0">
          <span className="text-[13px] font-bold uppercase tracking-[.06em]">Create SKU</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMinimized(true)}
              title="Minimise"
              className="w-6 h-6 flex items-center justify-center text-black/35 hover:text-black hover:bg-black/[.06] rounded cursor-pointer"
            >
              <MinimiseIcon />
            </button>
            <button
              onClick={onClose}
              disabled={saving}
              title="Close"
              className="w-6 h-6 flex items-center justify-center text-black/35 hover:text-black hover:bg-black/[.06] rounded cursor-pointer disabled:opacity-25 disabled:cursor-default text-[17px] leading-none"
            >
              ×
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex overflow-hidden flex-1 min-h-0">

          {/* Image panel — 240px */}
          <div
            className={`w-[240px] flex-shrink-0 bg-[#EDEAE4] relative group/img transition-colors ${!preview ? (dragging ? 'bg-[#dedad3]' : '') : ''}`}
            style={{ minHeight: 280 }}
            onDragOver={e => { if (!preview) { e.preventDefault(); setDragging(true) } }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => handleFile(e.target.files[0])}
            />
            {preview ? (
              <>
                <img src={preview} alt="preview" className="absolute inset-0 w-full h-full object-cover" />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={() => setEditingUrl(preview)}
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
                onClick={() => inputRef.current?.click()}
                className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-black/30 cursor-pointer border-none bg-transparent w-full hover:bg-[#dedad3] transition-colors"
              >
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"
                    stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span className="text-[10px] font-bold uppercase tracking-[.07em]">Drop image here</span>
                <span className="text-[9px]">or click to browse</span>
              </button>
            )}
          </div>

          {/* Fields */}
          <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-2.5">

            {/* Mode picker */}
            <div className="flex flex-col gap-1">
              <span className="text-[9px] font-bold uppercase tracking-[.07em] text-black/55">SKU Type</span>
              <div className="flex border border-black/15 overflow-hidden self-start">
                {[['new', 'New SKU'], ['existing', 'Existing Production SKU']].map(([val, label]) => (
                  <button key={val} type="button" onClick={() => setMode(val)}
                    className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.06em] cursor-pointer border-none transition-colors ${mode === val ? 'bg-[#1A1A18] text-white' : 'bg-white text-black/45 hover:bg-black/5'}`}
                  >{label}</button>
                ))}
              </div>
            </div>

            {/* Vendor — merchant only */}
            {role !== 'supplier' && (
              <div className="flex flex-col gap-0.5">
                <span className="text-[9px] font-bold uppercase tracking-[.07em] text-black/55">Vendor</span>
                <select
                  className="px-2 py-1.5 border-b border-black/20 text-[12px] bg-[#e9e9e93d] outline-none focus:border-black/60"
                  value={supplier?.id || ''}
                  onChange={e => setSupplier(supplierList.find(s => s.id === e.target.value) || null)}
                  disabled={orgsLoading}
                >
                  <option value="">Select vendor…</option>
                  {supplierList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}

            {/* Season */}
            <div className="flex flex-col gap-0.5">
              <span className="text-[9px] font-bold uppercase tracking-[.07em] text-black/55">Season</span>
              <select
                className="px-2 py-1.5 border-b border-black/20 text-[12px] bg-[#e9e9e93d] outline-none focus:border-black/60"
                value={fields.season}
                onChange={e => set('season', e.target.value)}
              >
                <option value="">Select season</option>
                {SEASONS.filter(s => s !== 'OLD').map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {/* Category — cascading */}
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center min-w-0">
                <span className="text-[9px] font-bold uppercase tracking-[.07em] text-black/55 flex-shrink-0">Category</span>
                {deepestCategory && (
                  <span className="ml-1.5 normal-case font-normal text-black/40 text-[9px] truncate min-w-0">
                    → {categorySelections.map(s => s.name).join(' › ')}
                  </span>
                )}
              </div>
              <CategorySelect
                categoryLevels={categoryLevels}
                categorySelections={categorySelections}
                catLoading={catLoading}
                onSelect={handleCategorySelect}
              />
            </div>

            {/* Description */}
            <div className="flex flex-col gap-0.5">
              <span className="text-[9px] font-bold uppercase tracking-[.07em] text-black/55">Description</span>
              <input
                className="px-2 py-1.5 border-b border-black/20 text-[12px] bg-[#e9e9e93d] outline-none uppercase focus:border-black/60"
                value={fields.description}
                onChange={e => set('description', e.target.value)}
                placeholder="Description"
              />
            </div>

            {/* Material + Finish */}
            <div className="grid grid-cols-2 gap-2">
              {['material', 'finish'].map(f => (
                <div key={f} className="flex flex-col gap-0.5">
                  <span className="text-[9px] font-bold uppercase tracking-[.07em] text-black/55">
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </span>
                  <input
                    className="px-2 py-1.5 border-b border-black/20 text-[12px] bg-[#e9e9e93d] outline-none uppercase focus:border-black/60"
                    value={fields[f]}
                    onChange={e => set(f, e.target.value)}
                    placeholder={f.charAt(0).toUpperCase() + f.slice(1)}
                  />
                </div>
              ))}
            </div>

            {/* Weight + L + W + H + Unit */}
            <div className="flex gap-2 items-end">
              <div className="flex flex-col gap-0.5 flex-1">
                <span className="text-[9px] font-bold uppercase tracking-[.07em] text-black/55">Weight (kg)</span>
                <input
                  type="number" step="0.1"
                  className="px-2 py-1.5 border-b border-black/20 text-[12px] bg-[#e9e9e93d] outline-none focus:border-black/60 w-full"
                  value={fields.weight}
                  onChange={e => set('weight', e.target.value)}
                  placeholder="0"
                />
              </div>
              {['l', 'w', 'h'].map(f => (
                <div key={f} className="flex flex-col gap-0.5 flex-1">
                  <span className="text-[9px] font-bold uppercase tracking-[.07em] text-black/55">
                    {f.toUpperCase()} ({fields.measurement})
                  </span>
                  <input
                    type="number" step="0.1"
                    className="px-2 py-1.5 border-b border-black/20 text-[12px] bg-[#e9e9e93d] outline-none focus:border-black/60 w-full"
                    value={fields[f]}
                    onChange={e => set(f, e.target.value)}
                    placeholder="0"
                  />
                </div>
              ))}
              <div className="flex flex-col gap-0.5">
                <span className="text-[9px] font-bold uppercase tracking-[.07em] text-black/55">Unit</span>
                <div className="flex border border-black/20 overflow-hidden">
                  {['cm', 'in'].map(u => (
                    <button
                      key={u} type="button"
                      onClick={() => set('measurement', u)}
                      className={`px-2 py-1.5 text-[11px] font-bold uppercase cursor-pointer border-none ${fields.measurement === u ? 'bg-[#1A1A18] text-white' : 'bg-white text-black/50 hover:bg-black/5'}`}
                    >{u}</button>
                  ))}
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-5 py-3 border-t border-black/10 flex-shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-[11px] font-bold uppercase tracking-[.06em] border border-black/20 bg-white cursor-pointer hover:bg-black/5">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-[11px] font-bold uppercase tracking-[.06em] bg-[#1A1A18] text-[#F5F3EF] cursor-pointer hover:opacity-80 disabled:opacity-50"
          >
            {saving ? 'Creating…' : 'Create SKU'}
          </button>
        </div>

      </div>

      {editingUrl && (
        <ImageEditorModal
          imageUrl={editingUrl}
          onSave={handleEditorSave}
          onClose={() => { URL.revokeObjectURL(editingUrl); setEditingUrl(null) }}
        />
      )}
    </div>
    </>
  )
}
