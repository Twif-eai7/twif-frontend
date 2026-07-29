import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { usePlmStore } from '../../../stores/plmStore'
import { publicUrl } from '../../orderManagement/poUtils'
import { fetchLiveRates, convertToUSD } from '../../../utils/formatters'

function OrgBlock({ label, org }) {
  if (!org) return null
  const addr = [org.address, org.city, org.country].filter(Boolean).join(', ')
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-[9px] font-bold uppercase tracking-[.1em] text-black/35 mb-1">{label}</div>
      <div className="text-[12px] font-bold text-[#1A1A18]">{org.display_name || org.name}</div>
      {addr && <div className="text-[11px] text-black/50">{addr}</div>}
      {org.email && <div className="text-[11px] text-black/50">{org.email}</div>}
      {org.phone_no && <div className="text-[11px] text-black/50">{org.phone_no}</div>}
    </div>
  )
}

export default function SamplePOModal({ workspaceIds, onClose, onCreated }) {
  const createSamplePO = usePlmStore(s => s.createSamplePO)
  const toast          = usePlmStore(s => s.toast)

  const [loading,      setLoading]      = useState(true)
  const [lines,        setLines]        = useState([])
  const [buyerOrg,     setBuyerOrg]     = useState(null)
  const [supplierOrg,  setSupplierOrg]  = useState(null)
  const [currency,     setCurrency]     = useState('USD')
  const [poNumber,     setPoNumber]     = useState('')
  const [creating,     setCreating]     = useState(false)

  useEffect(() => {
    const load = async () => {
      setLoading(true)

      const [{ data: workspaces }, { data: allOrders }] = await Promise.all([
        supabase.from('npd2_workspaces')
          .select('id, buyer_ref, buyer_brief, buyer_org_id, supplier_org_id, buyer_email, supplier_email')
          .in('id', workspaceIds),
        supabase.from('npd2_sample_orders')
          .select('workspace_id, confirmed_qty, confirmed_price, currency, amount_usd, target_ready_date, findings')
          .in('workspace_id', workspaceIds)
          .order('created_at', { ascending: false }),
      ])

      const soMap = {}
      for (const so of (allOrders || []))
        if (!soMap[so.workspace_id]) soMap[so.workspace_id] = so

      // Fetch buyer + supplier org details in parallel
      const buyerOrgId    = workspaces?.[0]?.buyer_org_id
      const supplierOrgId = workspaces?.[0]?.supplier_org_id
      const orgIds        = [buyerOrgId, supplierOrgId].filter(Boolean)

      let orgMap = {}
      if (orgIds.length) {
        const { data: orgs } = await supabase
          .from('organizations')
          .select('id, name, display_name, email, phone_no, address, city, zip, country')
          .in('id', orgIds)
        for (const o of (orgs || [])) orgMap[o.id] = o
      }

      const parseBrief = (raw) => {
        if (!raw) return {}
        if (typeof raw === 'string') { try { return JSON.parse(raw) } catch { return {} } }
        return raw
      }

      const ws0 = workspaces?.[0]
      setBuyerOrg(orgMap[buyerOrgId]       || (ws0?.buyer_email    ? { email: ws0.buyer_email    } : null))
      setSupplierOrg(orgMap[supplierOrgId] || (ws0?.supplier_email ? { email: ws0.supplier_email } : null))
      // Prefer the currency frozen on the sample order at approval time — buyer_brief.currency
      // is live/editable and may have changed since, which would mislabel confirmed_price.
      setCurrency(soMap[ws0?.id]?.currency || parseBrief(ws0?.buyer_brief)?.currency || 'USD')

      setLines((workspaces || []).map(ws => {
        const brief = parseBrief(ws.buyer_brief)
        const so    = soMap[ws.id]   || {}
        const qty   = so.confirmed_qty   || Number(brief.unit_qty)  || 0
        const price = so.confirmed_price || Number(brief.unit_price) || 0
        return {
          workspaceId: ws.id,
          description: brief.description || '—',
          color:       brief.color       || '—',
          material:    brief.material    || '—',
          buyerRef:    ws.buyer_ref      || '—',
          qty,
          price,
          total:       (qty * price).toFixed(2),
          // Frozen USD equivalent from approval time, if this sample order has one (null for
          // sample orders approved before the currency/amount_usd columns existed).
          amountUsd:   so.confirmed_price != null ? so.amount_usd : null,
          targetDate:  so.target_ready_date || null,
        }
      }))
      setLoading(false)
    }
    load()
  }, [workspaceIds.join(',')])

  const totalQty = lines.reduce((a, l) => a + l.qty, 0)
  const totalAmt = lines.reduce((a, l) => a + parseFloat(l.total), 0).toFixed(2)

  const handleCreate = async () => {
    if (!poNumber.trim() || creating) return
    setCreating(true)
    try {
      // Prefer summing each line's USD value frozen at its own approval time. Only fall back to
      // a fresh live conversion of the total when some line predates the amount_usd column.
      const allFrozen = lines.length > 0 && lines.every(l => l.amountUsd != null)
      let amount_usd
      if (allFrozen) {
        amount_usd = lines.reduce((a, l) => a + l.amountUsd, 0)
      } else {
        const rates = await fetchLiveRates()
        amount_usd = convertToUSD(parseFloat(totalAmt), currency, rates)
      }
      const { po, fileUrl } = await createSamplePO(workspaceIds, poNumber.trim(), amount_usd)
      const urlToOpen = (typeof fileUrl === 'string' && fileUrl.startsWith('http'))
        ? fileUrl
        : po?.po_file_url ? publicUrl(po.po_file_url) : null
      if (urlToOpen) window.open(urlToOpen, '_blank')
      onCreated?.(po)
      onClose()
    } catch (err) {
      toast(err.message)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[1010] flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
      <div className="bg-white w-[660px] max-h-[88vh] rounded-md shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/10">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[.1em] text-black/40 mb-0.5">Sample Purchase Order</div>
            <div className="text-[15px] font-extrabold text-[#1A1A18] tracking-tight">Create Sample PO</div>
          </div>
          <button onClick={onClose} className="text-black/35 hover:text-black text-xl leading-none cursor-pointer border-none bg-none">×</button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <span className="inline-block w-4 h-4 border-[1.5px] border-black/12 border-t-black rounded-full animate-spin mr-2" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto flex flex-col">

            {/* Buyer + Supplier */}
            <div className="grid grid-cols-2 gap-6 px-6 py-4 border-b border-black/[.07]">
              <OrgBlock label="Buyer" org={buyerOrg} />
              <OrgBlock label="Supplier" org={supplierOrg} />
            </div>

            {/* Date + Currency */}
            <div className="flex items-center gap-8 px-6 py-3 border-b border-black/[.07] bg-black/[.02]">
              <div>
                <div className="text-[9px] font-bold uppercase tracking-[.1em] text-black/35 mb-0.5">PO Date</div>
                <div className="text-[12px] font-bold text-[#1A1A18]">
                  {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </div>
              </div>
              <div>
                <div className="text-[9px] font-bold uppercase tracking-[.1em] text-black/35 mb-0.5">Currency</div>
                <div className="text-[12px] font-bold text-[#1A1A18]">{currency}</div>
              </div>
              <div>
                <div className="text-[9px] font-bold uppercase tracking-[.1em] text-black/35 mb-0.5">Type</div>
                <div className="text-[12px] font-bold text-[#1A1A18]">Sample</div>
              </div>
            </div>

            {/* Line items */}
            <div className="px-6 py-4 flex-1">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-black/[.08]">
                    {['Buyer Ref', 'Description', 'Colour', 'Qty', 'Unit Price', 'Total'].map(h => (
                      <th key={h} className="text-[9px] font-bold uppercase tracking-[.08em] text-black/40 pb-2 text-left last:text-right">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={l.workspaceId} className={`border-b border-black/[.05] ${i % 2 === 0 ? '' : 'bg-black/[.01]'}`}>
                      <td className="py-2.5 text-[12px] font-bold text-[#1A1A18] pr-4">{l.buyerRef}</td>
                      <td className="py-2.5 pr-4 max-w-[140px]">
                        <div className="text-[12px] text-[#1A1A18] truncate">{l.description}</div>
                        <div className="text-[10px] text-black/40">{l.material}</div>
                      </td>
                      <td className="py-2.5 text-[12px] text-[#1A1A18] pr-4">{l.color}</td>
                      <td className="py-2.5 text-[12px] text-[#1A1A18] pr-4">{l.qty}</td>
                      <td className="py-2.5 text-[12px] text-[#1A1A18] pr-4">{currency} {parseFloat(l.price).toFixed(2)}</td>
                      <td className="py-2.5 text-[12px] font-bold text-[#1A1A18] text-right">{currency} {l.total}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-black/10">
                    <td colSpan={3} className="pt-3 text-[10px] font-bold uppercase tracking-[.08em] text-black/40">Total</td>
                    <td className="pt-3 text-[12px] font-bold text-[#1A1A18]">{totalQty} units</td>
                    <td />
                    <td className="pt-3 text-[15px] font-extrabold text-[#1A1A18] text-right">{currency} {totalAmt}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* PO Number */}
            <div className="px-6 pb-5 flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase tracking-[.08em] text-black/40">
                PO Number <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={poNumber}
                onChange={e => setPoNumber(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                placeholder="e.g. PO-2026-001"
                autoFocus
                className="border-b-2 border-[#1A1A18] py-1.5 text-[14px] font-bold text-[#1A1A18] bg-transparent outline-none placeholder:text-black/20 placeholder:font-normal"
              />
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-3.5 border-t border-black/10 bg-black/[.02]">
          <button onClick={onClose}
            className="px-4 py-2 text-[11px] font-bold uppercase tracking-[.06em] text-black/50 hover:text-black cursor-pointer border-none bg-none">
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!poNumber.trim() || creating || loading}
            className="px-5 py-2 text-[11px] font-extrabold uppercase tracking-[.06em] bg-[#1A1A18] text-white rounded-sm cursor-pointer hover:opacity-80 disabled:opacity-40 flex items-center gap-2"
          >
            {creating
              ? <><span className="inline-block w-3 h-3 border-[1.5px] border-white/30 border-t-white rounded-full animate-spin" />Creating…</>
              : 'Create Sample PO'}
          </button>
        </div>
      </div>
    </div>
  )
}
