import { useState } from 'react'
import { usePlmStore } from '../../../stores/plmStore'

export default function InviteSetupModal({ sku, customerId, onClose, onSent }) {
  const [buyerEmail,    setBuyerEmail]    = useState('')
  const [supplierEmail, setSupplierEmail] = useState('')
  const [sending, setSending] = useState(false)
  const sendInvite      = usePlmStore(s => s.sendInvite)
  const refreshCatalog  = usePlmStore(s => s.refreshCatalog)

  const handleSend = async () => {
    if (!buyerEmail.trim()) { alert('Enter buyer email first'); return }
    setSending(true)
    try {
      await sendInvite(sku.id, buyerEmail.trim(), supplierEmail.trim() || undefined, customerId)
      await refreshCatalog()
      onSent?.()
      onClose()
    } catch (err) {
      alert(err.message)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40">
      <div className="bg-white w-full max-w-lg mx-4 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-black/10">
          <span className="text-[13px] font-bold uppercase tracking-[.06em] font-mono">{sku.auto_code}</span>
          <button onClick={onClose} className="text-black/40 hover:text-black text-lg leading-none cursor-pointer border-none bg-none">×</button>
        </div>

        {/* Body */}
        <div className="grid" style={{ gridTemplateColumns: '220px 1fr', minHeight: 360 }}>
          {/* Left: image */}
          <div className="p-4 border-r border-black/10 flex flex-col gap-3">
            <div className="bg-[#EDEAE4] aspect-square overflow-hidden">
              {sku.image_url
                ? <img src={sku.image_url} alt={sku.auto_code} className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center"><div className="w-10 h-10 bg-black/[.08]" /></div>
              }
            </div>
            <div className="text-[12px] font-extrabold uppercase text-[#1A1A18]">
              {sku.description || sku.auto_code}
            </div>
            <div className="text-[9px] font-bold uppercase tracking-[.06em] text-black/45 mt-auto">
              {sku.supplier} · {sku.season}
            </div>
          </div>

          {/* Right: form */}
          <div className="p-5 flex flex-col gap-5">
            <div className="text-[10px] font-bold uppercase tracking-[.1em] text-black/45">
              Invite people to this SKU
            </div>

            {/* Buyer */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-[.06em] text-black/80">Buyer</label>
              <div className="flex gap-1.5">
                <input
                  type="email"
                  value={buyerEmail}
                  onChange={e => setBuyerEmail(e.target.value)}
                  placeholder="buyer@company.com"
                  className="flex-1 px-3 py-2 border-b border-black/20 text-[13px] bg-[#e9e9e93d] outline-none"
                />
              </div>
              <span className="text-[10px] text-black/50">They'll get a link — session opens when they accept</span>
            </div>

            {/* Supplier */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-[.06em] text-black/80">
                Supplier <span className="font-normal text-black/40 normal-case tracking-normal">(optional)</span>
              </label>
              <input
                type="email"
                value={supplierEmail}
                onChange={e => setSupplierEmail(e.target.value)}
                placeholder="supplier@factory.com"
                className="px-3 py-2 border-b border-black/20 text-[13px] bg-[#e9e9e93d] outline-none"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-5 py-3 border-t border-black/10">
          <button onClick={onClose} className="px-4 py-2 text-[11px] font-bold uppercase tracking-[.06em] border border-black/20 bg-white cursor-pointer hover:bg-black/5">
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={sending}
            className="px-4 py-2 text-[11px] font-bold uppercase tracking-[.06em] bg-[#1A1A18] text-[#F5F3EF] cursor-pointer hover:opacity-80 disabled:opacity-50"
          >
            {sending ? 'Sending…' : 'Send invite'}
          </button>
        </div>
      </div>
    </div>
  )
}
