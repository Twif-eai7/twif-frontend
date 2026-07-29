import { useState } from 'react'

function ChevronIcon({ open }) {
  return (
    <svg
      width="10" height="10" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      className={`transition-transform ${open ? 'rotate-180' : ''}`}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

function ExpandableRow({ label, count, skuList, accent }) {
  const [open, setOpen] = useState(false)
  const clickable = count > 0

  return (
    <div className="divide-y divide-black/10">
      <button
        onClick={() => clickable && setOpen(o => !o)}
        disabled={!clickable}
        className={`w-full flex items-center justify-between px-3 py-2 text-left ${clickable ? 'cursor-pointer hover:bg-black/[.03]' : 'cursor-default'}`}
      >
        <span className="text-[11px] text-black/60 uppercase tracking-[.06em] font-bold">{label}</span>
        <div className="flex items-center gap-2">
          <span className={`text-[12px] font-bold ${accent && count > 0 ? 'text-amber-600' : count === 0 ? 'text-black/30' : 'text-black'}`}>{count}</span>
          {clickable && <span className="text-black/30"><ChevronIcon open={open} /></span>}
        </div>
      </button>
      {open && (
        <div className="px-3 py-2 bg-black/[.02] flex flex-wrap gap-1.5">
          {skuList.map(s => (
            <span key={s.id} className="text-[10px] font-mono font-bold text-black/70 bg-white border border-black/15 px-1.5 py-0.5">
              {s.auto_code}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export default function DeleteConfirmModal({ skus, onConfirm, onClose }) {
  const [reason,   setReason]   = useState('')
  const [deleting, setDeleting] = useState(false)

  const total     = skus.length
  const withWs    = skus.filter(s => s.workspace_id)
  const withoutWs = skus.filter(s => !s.workspace_id)
  const canConfirm = reason.trim().length > 0

  const handleConfirm = async () => {
    if (!canConfirm) return
    setDeleting(true)
    try {
      await onConfirm(reason.trim())
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/40">
      <div className="bg-white w-full max-w-sm mx-4 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-black/10">
          <span className="text-[13px] font-bold uppercase tracking-[.06em]">Delete SKUs</span>
          <button onClick={onClose} className="text-black/40 hover:text-black text-lg leading-none cursor-pointer border-none bg-none">×</button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 flex flex-col gap-4">
          {/* SKU count breakdown */}
          <div className="border border-black/10 divide-y divide-black/10">
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-[11px] text-black/60 uppercase tracking-[.06em] font-bold">Total selected</span>
              <span className="text-[12px] font-bold text-black">{total}</span>
            </div>
            <ExpandableRow label="With workspace"    count={withWs.length}    skuList={withWs}    accent />
            <ExpandableRow label="Without workspace" count={withoutWs.length} skuList={withoutWs} />
          </div>

          {withWs.length > 0 && (
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2">
              {withWs.length} SKU{withWs.length === 1 ? ' has' : 's have'} an active workspace and will also be flagged for deletion.
            </p>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-bold uppercase tracking-[.07em] text-black/55">
              Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={3}
              className="px-2 py-1.5 border border-black/20 text-[12px] bg-[#e9e9e93d] outline-none resize-none focus:border-black/60"
              placeholder="e.g. Duplicate entry, incorrect data, etc."
              value={reason}
              onChange={e => setReason(e.target.value)}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-5 py-3 border-t border-black/10">
          <button
            onClick={onClose}
            disabled={deleting}
            className="px-4 py-2 text-[11px] font-bold uppercase tracking-[.06em] border border-black/20 bg-white cursor-pointer hover:bg-black/5 disabled:opacity-50"
          >Cancel</button>
          <button
            onClick={handleConfirm}
            disabled={deleting || !canConfirm}
            className="px-4 py-2 text-[11px] font-bold uppercase tracking-[.06em] bg-red-600 text-white cursor-pointer hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {deleting && <div className="w-3 h-3 border border-white/40 border-t-white rounded-full animate-spin" />}
            {deleting ? 'Deleting…' : `Delete ${total} SKU${total === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  )
}
