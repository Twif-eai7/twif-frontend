import React, { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { resolveBuyerOrgsForMember, resolveSupplierNamesForMember } from '../../lib/poQueries'
import { useOrgsInit, useBuyerOrgs, useSupplierOrgs, useOrgsLoading } from '../../stores/orgsStore'

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function poMeta(po) {
  const skus           = po.skus
  const totalQty       = skus.reduce((s, x) => s + (x.total_quantity_open   || 0), 0)
  const totalInspect   = skus.reduce((s, x) => s + (x.total_inspected       || 0), 0)
  const totalAccept    = skus.reduce((s, x) => s + (x.total_accepted        || 0), 0)
  const factorySkus    = skus.filter(x => x.still_in_factory).length
  const totalBatches   = skus.reduce((s, x) => s + (x.batch_count          || 0), 0)
  const shippedBatches = skus.reduce((s, x) => s + (x.shipped_batch_count  || 0), 0)
  const partlyShipped  = shippedBatches > 0 && shippedBatches < totalBatches
  const fullyShipped   = totalBatches > 0 && shippedBatches === totalBatches
  const status         = fullyShipped ? 'shipped' : 'open'
  const pct            = totalQty > 0 ? Math.min(100, Math.round((totalInspect / totalQty) * 100)) : 0
  return { totalQty, totalInspect, totalAccept, factorySkus, status, partlyShipped, shippedBatches, totalBatches, pct }
}

// ── Progress bar ──────────────────────────────────────────────────────────────
function ProgressBar({ pct, complete }) {
  return (
    <div className="w-24 h-1 bg-stone-200 rounded-sm overflow-hidden shrink-0">
      <div
        className={`h-full rounded-sm transition-all duration-400 ${complete ? 'bg-emerald-700' : 'bg-orange-700'}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

// ── Badge ─────────────────────────────────────────────────────────────────────
function Badge({ type }) {
  const map = {
    open:    { cls: 'bg-orange-50 text-orange-700',   label: 'Open' },
    shipped: { cls: 'bg-emerald-50 text-emerald-700', label: '✓ Shipped' },
    factory: { cls: 'bg-amber-50 text-amber-700',     label: '⏳ In Factory' },
  }
  const { cls, label } = map[type] || map.open
  return (
    <span className={`font-mono text-[10px] tracking-widest uppercase px-2 py-0.5 rounded-sm font-medium whitespace-nowrap ${cls}`}>
      {label}
    </span>
  )
}

// ── Batch status pill ─────────────────────────────────────────────────────────
function BatchStatus({ status }) {
  const map = {
    Accepted: 'bg-emerald-50 text-emerald-700',
    Rejected: 'bg-red-50 text-red-700',
  }
  const cls = map[status] || 'bg-amber-50 text-amber-700'
  return (
    <span className={`font-mono text-[10px] tracking-wide uppercase px-1.5 py-0.5 rounded-sm font-medium inline-block ${cls}`}>
      {status || '—'}
    </span>
  )
}

// ── SKU panel (batch table) ───────────────────────────────────────────────────
function SkuPanel({ sku, batches }) {
  const aqlReq    = sku.aql_required      || 0
  const toInspect = sku.total_to_inspect  || 0
  const inspected = sku.total_inspected   || 0
  const totalQty  = sku.total_quantity_open || 0
  const aqlMet    = aqlReq > 0 && toInspect >= aqlReq
  const pct       = totalQty > 0 ? Math.min(100, Math.round((inspected / totalQty) * 100)) : 0
  const badgeType = sku.still_in_factory ? 'factory' : sku.status === 'shipped' ? 'shipped' : 'open'

  return (
    <div className="bg-stone-50">
      {/* SKU header */}
      <div className="flex items-center flex-wrap gap-x-5 gap-y-2 px-5 py-3 border-b border-stone-200">
        <div className="flex items-center gap-2">
          <ProgressBar pct={pct} complete={aqlMet} />
          <span className="font-mono text-xs text-stone-500 whitespace-nowrap">
            {inspected} / {totalQty} qty
          </span>
        </div>
        {sku.total_accepted != null && (
          <span className="font-mono text-xs text-emerald-700">✓ {sku.total_accepted} accepted</span>
        )}
        {aqlReq > 0 && (
          <span className={`font-mono text-[10px] ${aqlMet ? 'text-emerald-700' : 'text-stone-400'}`}>
            AQL: {toInspect}/{aqlReq}{aqlMet ? ' ✓' : ''}
          </span>
        )}
        <Badge type={badgeType} />
      </div>

      {/* Batch table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-stone-200">
              {['Date', 'Inspected', 'Accepted', 'To Inspect', 'Status'].map(h => (
                <th key={h} className="font-mono text-[10px] tracking-widest uppercase text-stone-400 px-5 py-2.5 text-left font-medium whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {batches.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center font-mono text-xs text-stone-400 py-5 px-5">
                  No batch detail available
                </td>
              </tr>
            ) : batches.map((b, i) => (
              <tr key={i} className="border-b border-stone-100 hover:bg-stone-100 transition-colors">
                <td className="font-mono text-[13px] text-stone-800 px-5 py-2.5">{fmtDate(b.inspection_date)}</td>
                <td className="font-mono text-[13px] text-stone-800 px-5 py-2.5">{b.items_inspected  ?? '—'}</td>
                <td className="font-mono text-[13px] text-stone-800 px-5 py-2.5">{b.items_accepted   ?? '—'}</td>
                <td className="font-mono text-[13px] text-stone-800 px-5 py-2.5">{b.to_inspect_items ?? '—'}</td>
                <td className="px-5 py-2.5"><BatchStatus status={b.inspection_status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── PO card ───────────────────────────────────────────────────────────────────
function PoCard({ po, allBatches, multipleBuyers }) {
  const [expanded,    setExpanded]    = useState(false)
  const [activeStyle, setActiveStyle] = useState(po.skus[0]?.style || '')

  const meta = poMeta(po)

  const today        = new Date(); today.setHours(0, 0, 0, 0)
  const tgt          = po.target_date ? new Date(po.target_date) : null
  const daysLeft     = tgt ? Math.ceil((tgt - today) / 86400000) : null
  const targetUrgent = daysLeft !== null && daysLeft <= 15

  const targetLabel = tgt
    ? `Target: ${fmtDate(po.target_date)} (${
        daysLeft > 0 ? `${daysLeft}d left` : daysLeft === 0 ? 'today' : `${Math.abs(daysLeft)}d overdue`
      })`
    : null

  const activeSku = po.skus.find(s => s.style === activeStyle) || po.skus[0]
  const batchKey  = activeSku ? `${activeSku.customer_po_no}||${activeSku.style}` : ''
  const batches   = allBatches[batchKey] || []

  return (
    <div className={`bg-white border rounded-md mb-3 overflow-hidden shadow-sm transition-colors ${expanded ? 'border-stone-300' : 'border-stone-200 hover:border-stone-300'}`}>

      {/* Summary row */}
      <div
        onClick={() => setExpanded(e => !e)}
        className="grid grid-cols-[1fr_auto] gap-4 items-center px-5 py-4 cursor-pointer select-none hover:bg-stone-50 transition-colors"
      >
        <div>
          {/* Meta */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-2">
            <span className="font-mono text-[15px] font-medium text-stone-900 tracking-wide">
              PO# {po.customer_po_no}
            </span>
            {multipleBuyers && po.customer && (
              <span className="text-xs font-semibold text-stone-800">{po.customer}</span>
            )}
            {po.vendor && (
              <span className="text-xs text-stone-500">{po.vendor}</span>
            )}
            {meta.factorySkus > 0 && (
              <span className="font-mono text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-sm">
                ⏳ {meta.factorySkus} of {po.skus.length} SKU{po.skus.length > 1 ? 's' : ''} in factory
              </span>
            )}
          </div>

          {/* Progress */}
          <div className="flex items-center gap-2.5 flex-wrap mb-1.5">
            <ProgressBar pct={meta.pct} complete={meta.pct >= 100} />
            <span className="font-mono text-xs text-stone-500 whitespace-nowrap">
              {meta.totalInspect} / {meta.totalQty} qty total
            </span>
            {meta.totalAccept > 0 && (
              <span className="font-mono text-xs text-emerald-700">✓ {meta.totalAccept} accepted</span>
            )}
            <span className="font-mono text-xs text-stone-400">
              {po.skus.length} SKU{po.skus.length > 1 ? 's' : ''}
            </span>
          </div>

          {/* Target date */}
          {targetLabel && (
            <span className={`font-mono text-[11px] ${targetUrgent ? 'text-amber-700 font-medium' : 'text-stone-400'}`}>
              🕐 {targetLabel}
            </span>
          )}
        </div>

        {/* Chevron */}
        <svg
          viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"
          className={`w-4 h-4 text-stone-300 shrink-0 self-start mt-1 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
        >
          <path d="M4 6l4 4 4-4" />
        </svg>
      </div>

      {/* Expanded content */}
      {expanded && (
        <>
          {/* SKU tabs */}
          <div className="flex flex-wrap gap-1.5 px-5 pb-3 border-b border-stone-200">
            {po.skus.map(s => {
              const isActive = s.style === activeStyle
              const type     = s.still_in_factory ? 'factory' : s.status === 'shipped' ? 'shipped' : 'default'

              const base = 'font-mono text-[11px] px-3 py-1 rounded border transition-all cursor-pointer whitespace-nowrap'
              const variants = {
                factory: isActive
                  ? 'border-orange-500 bg-orange-50 text-orange-700 font-semibold shadow-[0_0_0_2px_#fff7ed]'
                  : 'border-amber-400 bg-amber-50 text-amber-700',
                shipped: isActive
                  ? 'border-orange-500 bg-orange-50 text-orange-700 font-semibold shadow-[0_0_0_2px_#fff7ed]'
                  : 'border-emerald-500 bg-emerald-50 text-emerald-700',
                default: isActive
                  ? 'border-orange-500 bg-orange-50 text-orange-700 font-semibold shadow-[0_0_0_2px_#fff7ed]'
                  : 'border-stone-200 bg-white text-stone-500 hover:border-stone-300 hover:text-stone-700',
              }

              return (
                <button key={s.style} onClick={() => setActiveStyle(s.style)} className={`${base} ${variants[type]}`}>
                  {isActive && (
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-current mr-1.5 align-middle" />
                  )}
                  {s.style}
                </button>
              )
            })}
          </div>

          {/* Active SKU panel */}
          {activeSku && <SkuPanel sku={activeSku} batches={batches} />}
        </>
      )}
    </div>
  )
}

// ── Custom dropdown ───────────────────────────────────────────────────────────
function FilterDropdown({ value, onChange, options, placeholder }) {
  const [open, setOpen] = useState(false)
  const ref = React.useRef(null)

  // Close on outside click
  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const selected = options.find(o => o.value === value)
  const label    = selected ? selected.label : placeholder

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-2 font-mono text-[13px] px-3.5 py-2 border rounded bg-white transition-colors min-w-[160px] justify-between
          ${open ? 'border-blue-500 text-stone-900' : 'border-stone-200 text-stone-700 hover:border-stone-300'}`}
      >
        <span className={value ? 'text-stone-900' : 'text-stone-400'}>{label}</span>
        <svg
          viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8"
          strokeLinecap="round" strokeLinejoin="round"
          className={`w-3 h-3 text-stone-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path d="M2 4l4 4 4-4" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 bg-white border border-stone-200 rounded shadow-lg min-w-full overflow-hidden">
          {options.map(o => (
            <button
              key={o.value}
              type="button"
              onClick={() => { onChange(o.value); setOpen(false) }}
              className={`w-full text-left font-mono text-[13px] px-4 py-2 transition-colors whitespace-nowrap
                ${o.value === value
                  ? 'bg-blue-500 text-white'
                  : 'text-stone-700 hover:bg-stone-50'}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Skeletons ─────────────────────────────────────────────────────────────────
function Skeletons() {
  return (
    <div className="space-y-2.5">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-20 rounded-md bg-gradient-to-r from-stone-200 via-stone-100 to-stone-200 bg-[length:200%_100%] animate-[shimmer_1.4s_infinite]" />
      ))}
      <style>{`@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function InspectionPendingDispatch() {
  // Uses orgsStore — memberId resolved internally via useOrgsInit
  useOrgsInit()
  const buyerOrgs    = useBuyerOrgs()
  const supplierOrgs = useSupplierOrgs()
  const orgsLoading  = useOrgsLoading()

  const [summaries, setSummaries] = useState([])
  const [batches,   setBatches]   = useState({})
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState(null)

  const [filter, setFilter] = useState('open')
  const [search, setSearch] = useState('')
  const [buyer,  setBuyer]  = useState('')
  const [vendor, setVendor] = useState('')

  // ── Fetch once orgs are resolved ──────────────────────────────────────────
  useEffect(() => {
    if (orgsLoading || !buyerOrgs.length) return

    const buyerOrgIds   = buyerOrgs.map(o => o.id)
    const supplierNames = supplierOrgs.map(o => o.name)

    async function load() {
      setLoading(true)
      setError(null)
      try {
        // Summary rows
        let sq = supabase
          .from('inspection_po_style_summary')
          .select('*')
          .in('organization_id', buyerOrgIds)
          .order('latest_inspection_date', { ascending: false })
        if (supplierNames.length) sq = sq.in('vendor', supplierNames)

        const { data: summaryData, error: sErr } = await sq
        if (sErr) throw sErr

        // Batch detail rows
        let bq = supabase
          .from('inspection_open_items')
          .select('customer_po_no, style, inspection_date, target_date, items_inspected, items_accepted, to_inspect_items, inspection_status, inspector, activity')
          .in('organization_id', buyerOrgIds)
          .order('inspection_date', { ascending: true })
        if (supplierNames.length) bq = bq.in('vendor', supplierNames)

        const { data: batchData, error: bErr } = await bq
        if (bErr) throw bErr

        const batchMap = {}
        ;(batchData || []).forEach(b => {
          const key = `${b.customer_po_no}||${b.style}`
          if (!batchMap[key]) batchMap[key] = []
          batchMap[key].push(b)
        })

        setSummaries(summaryData || [])
        setBatches(batchMap)
      } catch (err) {
        console.error('[InspectionTracker]', err)
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [buyerOrgs, supplierOrgs, orgsLoading])

  // ── Group summaries by PO number ──────────────────────────────────────────
  const poGroups = useMemo(() => {
    const map = {}
    summaries.forEach(s => {
      const po = s.customer_po_no
      if (!map[po]) map[po] = { customer_po_no: po, customer: s.customer, vendor: s.vendor, target_date: s.target_date, skus: [] }
      map[po].skus.push(s)
    })
    return Object.values(map)
  }, [summaries])

  // ── Dropdowns ─────────────────────────────────────────────────────────────
  const buyerList = useMemo(() => [...new Set(summaries.map(s => s.customer).filter(Boolean))].sort(), [summaries])

  // Vendor list scoped to the selected buyer — shows only vendors for that buyer
  const vendorList = useMemo(() => {
    const source = buyer ? summaries.filter(s => s.customer === buyer) : summaries
    return [...new Set(source.map(s => s.vendor).filter(Boolean))].sort()
  }, [summaries, buyer])

  // Reset vendor if it no longer exists after buyer changes
  useEffect(() => {
    if (vendor && !vendorList.includes(vendor)) setVendor('')
  }, [vendorList])

  const multipleBuyers = buyerList.length > 1

  // ── Stats ─────────────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    openPOs:    poGroups.filter(p => poMeta(p).status === 'open').length,
    shippedPOs: poGroups.filter(p => poMeta(p).status === 'shipped').length,
    factoryPOs: poGroups.filter(p => poMeta(p).factorySkus > 0).length,
    openSkus:    summaries.filter(s => s.status === 'open').length,
    shippedSkus: summaries.filter(s => s.status === 'shipped').length,
    factorySkus: summaries.filter(s => s.still_in_factory).length,
  }), [poGroups, summaries])

  // ── Filter ────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    return poGroups.filter(po => {
      const meta = poMeta(po)
      if (filter === 'open'    && meta.shippedBatches > 0) return false
      if (filter === 'shipped' && !meta.partlyShipped)     return false
      if (filter === 'factory' && meta.factorySkus === 0)  return false
      if (buyer  && po.customer !== buyer)  return false
      if (vendor && po.vendor   !== vendor) return false
      if (search) {
        const q = search.toLowerCase()
        const hit =
          (po.customer_po_no || '').toLowerCase().includes(q) ||
          (po.vendor         || '').toLowerCase().includes(q) ||
          (po.customer       || '').toLowerCase().includes(q) ||
          po.skus.some(s => (s.style || '').toLowerCase().includes(q))
        if (!hit) return false
      }
      return true
    })
  }, [poGroups, filter, buyer, vendor, search])

  // ── UI ────────────────────────────────────────────────────────────────────
  const isLoading = orgsLoading || loading

  return (
    <div className="p-4">
      {/* Header */}
      <div className="flex items-baseline justify-between flex-wrap gap-3 mb-7">
        <h2 className="text-[22px] font-bold tracking-tight text-stone-900">
          INSPECTION-PENDING DISPATCH
        </h2>

        {/* Filter toggle */}
        <div className="flex gap-1 bg-stone-200 rounded-full p-0.5">
          {[['open', 'Open'], ['shipped', 'Partly Shipped'], ['factory', 'In Factory']].map(([f, label]) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`font-mono text-[11px] tracking-wide px-3.5 py-1.5 rounded-full transition-all font-medium
                ${filter === f ? 'bg-white text-stone-900 shadow' : 'text-stone-500 hover:text-stone-700'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      {!isLoading && !error && (
        <>
          <div className="flex gap-6 flex-wrap mb-2">
            {[
              { val: stats.openPOs,    sub: `Open POs · ${stats.openSkus} SKUs`,      warn: false },
              { val: stats.factoryPOs, sub: `In Factory · ${stats.factorySkus} SKUs`, warn: true  },
              { val: stats.shippedPOs, sub: `Shipped POs · ${stats.shippedSkus} SKUs`,warn: false },
            ].map((s, i) => (
              <div key={i} className="flex items-center gap-6">
                {i > 0 && <div className="w-px self-stretch bg-stone-200 my-0.5" />}
                <div className="flex flex-col gap-0.5">
                  <span className={`font-mono text-2xl font-medium leading-none ${s.warn ? 'text-amber-700' : 'text-stone-900'}`}>
                    {s.val}
                  </span>
                  <span className="text-[11px] text-stone-400 tracking-widest uppercase">{s.sub}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Controls */}
      <div className="flex flex-wrap gap-2.5 mb-5 mt-4 items-center">
        <input
          type="text"
          placeholder="Search PO, style, vendor…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="font-mono text-[13px] px-3.5 py-2 border border-stone-200 rounded focus:outline-none focus:border-blue-500 bg-white text-stone-900 placeholder-stone-300 min-w-[200px] transition-colors"
        />
        <FilterDropdown
          value={buyer}
          onChange={setBuyer}
          placeholder="All Buyers"
          options={[
            { value: '', label: 'All Buyers' },
            ...buyerList.map(b => ({ value: b, label: b })),
          ]}
        />
        <FilterDropdown
          value={vendor}
          onChange={setVendor}
          placeholder="All Vendors"
          options={[
            { value: '', label: 'All Vendors' },
            ...vendorList.map(v => ({ value: v, label: v })),
          ]}
        />
      </div>

      {/* List */}
      {isLoading ? (
        <Skeletons />
      ) : error ? (
        <div className="text-center py-16 text-stone-400">
          <div className="text-4xl mb-3 opacity-40">⚠️</div>
          <div className="text-[15px] font-semibold text-stone-700 mb-1">Could not load data</div>
          <div className="font-mono text-xs">{error}</div>
        </div>
      ) : !buyerOrgs.length ? (
        <div className="text-center py-16 text-stone-400">
          <div className="text-4xl mb-3 opacity-40">🔒</div>
          <div className="text-[15px] font-semibold text-stone-700 mb-1">No organisations found</div>
          <div className="font-mono text-xs">Your account is not linked to any buyer organisations.</div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-stone-400">
          <div className="text-4xl mb-3 opacity-40">📭</div>
          <div className="text-[15px] font-semibold text-stone-700 mb-1">Nothing here</div>
          <div className="font-mono text-xs">No items match the current filter.</div>
        </div>
      ) : (
        filtered.map(po => (
          <PoCard
            key={po.customer_po_no}
            po={po}
            allBatches={batches}
            multipleBuyers={multipleBuyers}
          />
        ))
      )}
    </div>
  )
}