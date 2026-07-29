import { useMemo, useState, useCallback } from 'react'

const EXCLUDED_MERCHANTS = new Set([
  'nitin@jnitin.com', 'nishant@jnitin.com', 'erp2@jnitn.com', 'faisal@jnitin.com',
  'ritika@jnitin.com', 'manas@jnitin.com', 'shyam@jnitin.com', 'rahul.kulkarni@jnitin.com',
  'shalini@jnitin.com', 'vishal@jnitin.com', 'milan.aggarwal@arpl-alm.in', 'mis@jnitin.com',
  'erp2@jnitin.com', 'amit.sharma@jnitin.com', 'siddarth@abia.in', 'suresh@jnitin.com', 'vandana@societyoflifestyle.in',
  'inspection@jnitin.com', 'sk@twif.io' , 'ajay.goyal@abia.in' , 'lokesh.sharma@jnitin.com' , 'abhishek.singh@abia.in'
])
import '../../styles/sales-analytics.css'
import Fy26ByMonthsChart from './Fy26ByMonthsChart'
import { useUiStore } from '../../stores/uiStore'
import { useDashboardStore, FY_CONFIG } from '../../stores/dashboardStore'
import SourcingRegionChart from './SourcingRegionChart'
import { useSearchParams } from 'react-router-dom'
import { extractMonthKey, labelToSlug } from '../../hooks/useOpenPoSummary'

function fmt$(n) {
  return '$' + parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}
function fmtPct(n) {
  return parseFloat(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%'
}

// ── Shared Tailwind constants ─────────────────────────────────────────────────
const CARD         = 'flex flex-col relative p-5 rounded-xl border border-gray-200 bg-white transition-all duration-300 cursor-default text-black hover:-translate-y-0.5 hover:border-[#1100ff] hover:shadow-[0_8px_30px_rgba(0,0,0,0.1)]'
const CARD_HEADER  = 'flex justify-between items-center mb-3 gap-4 flex-wrap'
const CARD_TITLE   = 'font-semibold text-[1em] m-0'
const CARD_SUB     = 'text-[0.78em] text-[#555] mt-0.5'
const CARD_CONTENT = 'flex-1 flex flex-col min-h-0'
const KPI_VALUE    = 'text-[2em] font-semibold my-1 leading-tight break-words'

// ── MiniTabs — fully Tailwind, each usage is independent ─────────────────────
function MiniTabs({ options, value, onChange }) {
  return (
    <div className="flex gap-1 items-center">
      {options.map(opt => (
        <button key={opt} type="button" onClick={() => onChange(opt)}
          className={`px-1.5 py-0.5 text-[10px] rounded-md border cursor-pointer transition-all duration-200
            ${value === opt
              ? 'bg-black text-white font-medium border-black'
              : 'bg-gray-100 text-gray-500 border-transparent hover:bg-gray-200'
            }`}>
          {opt}
        </button>
      ))}
    </div>
  )
}

// ── BentoKpiCard ─────────────────────────────────────────────────────────────
function BentoKpiCard({ cardId, title, subtitle, value, linkText, onLinkClick, children }) {
  return (
    <div className={`cursor-pointer ${CARD}`} data-card-id={cardId} onClick={onLinkClick}>
      <div className={CARD_HEADER}>
        <div>
          <h2 className={CARD_TITLE}>{title}</h2>
          {subtitle && <div className={CARD_SUB}>{subtitle}</div>}
        </div>
        {linkText && (
          <button type="button" onClick={onLinkClick}
            className="text-[#005A9C] text-[0.85em] font-medium hover:underline bg-transparent border-0 p-0 cursor-pointer">
            {linkText}
          </button>
        )}
      </div>
      <div className={CARD_CONTENT}>
        {value != null && <div className={KPI_VALUE}>{value}</div>}
        {children}
      </div>
    </div>
  )
}

// ── GaugeCard ─────────────────────────────────────────────────────────────────
function GaugeCard({ current, target }) {
  const pct = target > 0 ? Math.min(current / target, 1) : 0
  const fmtM = v => (v / 1e6).toFixed(2) + 'M'
  const left = Math.max(target - current, 0)
  const size = 120, stroke = 12
  const r = size / 2 - stroke / 2
  const circ = Math.PI * r
  const offset = circ * (1 - pct)
  return (
    <div className="w-full flex flex-col">
      <div className="w-full flex items-baseline justify-between gap-3 mb-2">
        <span className="font-bold text-[#1100ff] text-lg">{fmtM(current)}</span>
        <span className="text-orange-500 text-xs font-bold">{fmtM(left)}</span>
      </div>
      <div className="relative w-full flex items-center justify-center">
        <svg viewBox={`0 0 ${size} ${size / 2}`} className="w-full max-w-[280px] h-auto">
          <path d={`M ${stroke/2},${size/2} A ${r},${r} 0 0 1 ${size-stroke/2},${size/2}`}
            fill="none" stroke="#eaeaea" strokeWidth={stroke} strokeLinecap="round" />
          <path d={`M ${stroke/2},${size/2} A ${r},${r} 0 0 1 ${size-stroke/2},${size/2}`}
            fill="none" stroke="rgba(17,0,255,1)" strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={circ} strokeDashoffset={offset}
            className="transition-[stroke-dashoffset] duration-300" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center pt-2 text-xl font-bold">
          {(pct * 100).toFixed(2)}%
        </div>
      </div>
      <div className="text-[10px] text-gray-500 mt-1 text-center">Target: {fmtM(target)}</div>
    </div>
  )}

// ── Skeleton primitives ───────────────────────────────────────────────────────
function Skel({ className = '' }) {
  return <div className={`bg-gray-200 rounded-md animate-pulse ${className}`} />
}

function SkeletonCard({ cardId, children }) {
  return (
    <div className="flex flex-col p-5 rounded-xl border border-gray-100 bg-white" data-card-id={cardId}>
      {children}
    </div>
  )
}



function DashboardSkeleton() {
  return (
    <>
      {/* Stats bar skeleton */}
      <div className="flex flex-wrap items-center gap-2 md:gap-10 mt-4">
        {['w-36', 'w-40', 'w-32', 'w-32', 'w-36'].map((w, i) => (
          <div key={i} className="flex items-center gap-2">
            <Skel className="h-4 w-24" />
            <Skel className={`h-11 rounded-lg ${w}`} />
          </div>
        ))}
      </div>

      {/* Bento grid skeleton */}
      <div className="bg-white mt-4">
        <div className="magic-bento-grid">
          {/* Row 1 — 4 KPI cards */}
          {['current_fy_shipped', 'open_po', 'volume_shipped', 'prev_fy_shipped'].map(id => (
            <SkeletonCard key={id} cardId={id}>
              <Skel className="h-4 w-32 mb-1" />
              <Skel className="h-3 w-20 mb-6" />
              <Skel className="h-10 w-28" />
            </SkeletonCard>
          ))}

          {/* Row 2 — 4 smaller cards */}
          {['shipped_po_count', 'open_pos_count', 'growth_rate', 'actual_growth'].map(id => (
            <SkeletonCard key={id} cardId={id}>
              <div className="flex justify-between mb-5">
                <div className="space-y-1">
                  <Skel className="h-4 w-28" />
                  <Skel className="h-3 w-16" />
                </div>
                <Skel className="h-6 w-20 rounded-full" />
              </div>
              <Skel className="h-10 w-24" />
            </SkeletonCard>
          ))}

          {/* Row 3 left — Global Markets */}
          <SkeletonCard cardId="sourcing_by_region">
            <div className="flex justify-between mb-4">
              <div className="space-y-1">
                <Skel className="h-4 w-28" />
                <Skel className="h-3 w-16" />
              </div>
              <Skel className="h-6 w-24 rounded-full" />
            </div>
            <Skel className="flex-1 min-h-[280px] rounded-xl" />
          </SkeletonCard>

          {/* Row 3 right — Open POs By Months */}
          <SkeletonCard cardId="open_po_monthly">
            <div className="flex justify-between mb-4">
              <div className="space-y-1">
                <Skel className="h-4 w-36" />
                <Skel className="h-3 w-20" />
              </div>
              <Skel className="h-6 w-36 rounded-full" />
            </div>
            <div className="space-y-2.5 flex-1">
              {[...Array(12)].map((_, i) => (
                <div key={i} className="flex gap-4 items-center">
                  <Skel className="h-3.5 w-24" />
                  <Skel className="h-3.5 w-8" />
                  <Skel className="h-3.5 w-20" />
                </div>
              ))}
            </div>
          </SkeletonCard>

          {/* Row 4 — Volume chart */}
          <SkeletonCard cardId="volume_over_time">
            <div className="flex justify-between mb-4">
              <div className="space-y-1">
                <Skel className="h-4 w-32" />
                <Skel className="h-3 w-24" />
              </div>
              <Skel className="h-6 w-24" />
            </div>
            <Skel className="flex-1 min-h-[320px] rounded-xl" />
          </SkeletonCard>
        </div>
      </div>
    </>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function MerchantDashboard({
  onMerchantChange, onOpenPoSummary,  onShippedPoSummary,
  summary, volumeData, openOrdersData,
  availableBuyers, currentBuyer, currentMerchant,
  isAdmin, merchantList, loading, error, reload,
  switchBuyer, switchMerchant,
}) {
  const {
    otifYear,        setOtifYear,
    qualityYear,     setQualityYear,
    shippedPoType,   setShippedPoType,
    sourcingMode,    setSourcingMode,
    volumeView,      setVolumeView,
    openPoTableView, setOpenPoTableView,
    volumeVendor,    setVolumeVendor,
    chartTotals,     setChartTotals,
  } = useUiStore()

  const fyYear         = useDashboardStore(s => s.fyYear)
  const switchFyYear   = useDashboardStore(s => s.switchFyYear)
  const fy26VolumeData = useDashboardStore(s => s.fy26VolumeData)
  const cfg            = FY_CONFIG[fyYear] ?? FY_CONFIG.fy27

  // Shared Y-axis scale so FY26 and FY27 charts are directly comparable
  const [fy26YMax, setFy26YMax] = useState(0)
  const [fy27YMax, setFy27YMax] = useState(0)
  const sharedYMax = Math.max(fy26YMax, fy27YMax) || undefined
  const onFy26YMax = useCallback(v => setFy26YMax(v), [])
  const onFy27YMax = useCallback(v => setFy27YMax(v), [])

  const currentFyVolume  = parseFloat(summary?.currentFyVolume  || 0)
  const previousFyVolume = parseFloat(summary?.previousFyVolume || 0)
  const ytdTarget    = parseFloat(summary?.ytdTarget) || 4500000
  const totalOrders  = fmt$(summary?.totalOrders || 0)
  const actualGrowth = previousFyVolume
  ? parseFloat(((summary?.totalOrders - previousFyVolume) / previousFyVolume) * 100)
  : 0;
  const onTimePos    = summary?.onTimePos  ?? 0
  const latePos      = summary?.latePos    ?? 0
  const shippedTotal = onTimePos + latePos
  const shippedPoDisplay = shippedPoType === 'On Time' ? onTimePos : shippedPoType === 'Late' ? latePos : shippedTotal
  const otifValue    = otifYear === 'This Year' ? fmtPct(summary?.otifRate) : fmtPct(summary?.otifLy || 0);
  const qualityValue = qualityYear === 'This Year' ? fmt$(summary?.totalQualityClaims) : fmt$(summary?.totalQualityClaimsLY) || 0;
  const targetAchieved = ytdTarget !== 0 ? (1 - ((ytdTarget - currentFyVolume) / ytdTarget)) * 100 : 0

  const buyerOptions = useMemo(() => {
    const list = [...(availableBuyers || [])]
    const ti = list.findIndex(b => b.toUpperCase() === 'TOTAL')
    if (ti !== -1) { const [t] = list.splice(ti, 1); list.unshift(t) }
    return list.map(b => b.toUpperCase() === 'TOTAL' ? 'All' : b)
  }, [availableBuyers])

  const activeBuyer = (!currentBuyer || currentBuyer === 'Total' || currentBuyer === 'All')
    ? ''
    : currentBuyer
  const activeYear = fyYear.replace('fy', '') 
  const handleOpenPoSummary   = (month = '') => onOpenPoSummary({ buyer: activeBuyer, month , year: activeYear })
  const handleShippedPoSummary = ()           => onShippedPoSummary({ buyer: activeBuyer, year: activeYear, timing: shippedPoType })

  const { openPoRows, openPoTotalCount, openPoTotalValue, tytdValue } = useMemo(() => {
    const empty = { openPoRows: [], openPoTotalCount: 0, openPoTotalValue: 0, tytdValue: fmt$(0) }
    if (!openOrdersData?.buyerBreakdown) return empty

    const breakdown = openOrdersData.buyerBreakdown
    const isAll = !currentBuyer || currentBuyer === 'All' || currentBuyer.toUpperCase() === 'TOTAL'
    const buyersToSum = isAll
      ? Object.keys(breakdown).filter(k => k.toUpperCase() !== 'TOTAL')
      : [currentBuyer]

    // Build merged map once — all derivations share this single pass
    const merged = {}
    buyersToSum.forEach(buyer => {
      const key = Object.keys(breakdown).find(k => k.toUpperCase() === buyer.toUpperCase())
      if (!key) return
      ;(breakdown[key] || []).forEach(m => {
        if (!merged[m.month]) merged[m.month] = { month: m.month, count: 0, value: 0 }
        merged[m.month].count += m.count || 0
        merged[m.month].value += m.value || 0
      })
    })

    const months = openPoTableView === 'fiscal' ? cfg.openPoFiscal : cfg.openPoCalendar
    const rows = months.map(m => merged[m] || { month: m, count: 0, value: 0 })

    // TYTD = FY26 fiscal months + FY27 fiscal months (no overlap)
    const tytd = [...FY_CONFIG.fy26.openPoFiscal, ...FY_CONFIG.fy27.openPoFiscal]
      .reduce((s, m) => s + (merged[m]?.value || 0), 0)

    return {
      openPoRows: rows,
      openPoTotalCount: rows.reduce((s, r) => s + r.count, 0),
      openPoTotalValue: rows.reduce((s, r) => s + r.value, 0),
      tytdValue: fmt$(tytd),
    }
  }, [openOrdersData, currentBuyer, openPoTableView, cfg])

  const sourcingList = useMemo(() => {
    if (sourcingMode === 'client') return volumeData?.clientData || []
    const palette = ['#4285F4','#34A853','#FBBC05','#EA4335','#9E9E9E']
    return (volumeData?.originData || []).map((o, i) => ({
      region: o.origin, value: o.value, color: palette[i % palette.length]
    }))
  }, [volumeData, sourcingMode])

  if (error) {
    const noData = error.includes('No performance data found')
    return (
      <div className={`p-4 rounded-xl ${noData ? 'bg-gray-50 text-gray-600' : 'bg-red-50 text-red-700'}`}>
        {noData ? 'The Dashboard is not ready yet.' : error}
        {!noData && (
          <button type="button" onClick={reload} className="ml-2 underline font-medium">Retry</button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4 px-4">
      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-4 mt-4">
         <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-600">FY Year:</span>
          <select
          className="min-w-[220px] h-8 px-3 border border-gray-200 rounded-lg bg-white text-xs"
          value={fyYear}
          onChange={e => switchFyYear(e.target.value)}
        >
          <option value="fy27">FY 2027</option>
          <option value="fy26">FY 2026</option>
        </select>
          </div>
        {/* <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-600">FY Year:</span>
          <MiniTabs
            options={['FY 2026', 'FY 2027']}
            value={cfg.current.label}
            onChange={v => switchFyYear(v.includes('2026') ? 'fy26' : 'fy27')}
          />
        </div> */}

        {isAdmin && merchantList?.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-600">Merchant:</span>
            <select
              className="min-w-[220px] h-8 px-3 border border-gray-200 rounded-lg bg-white text-xs"
              value={currentMerchant || ''}
              onChange={e => { const val = e.target.value || null; switchMerchant(val); onMerchantChange?.(val) }}
            >
              <option value="">— All Merchants —</option>
              {merchantList.filter(m => !EXCLUDED_MERCHANTS.has(m.email)).map(m => <option key={m.email} value={m.email}>{m.name}</option>)}
            </select>
          </div>
        )}

        {buyerOptions.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-600">Buyer:</span>
            <select
              className="min-w-[220px] h-8 px-3 border border-gray-200 rounded-lg bg-white text-xs font-medium"
              value={currentBuyer === 'Total' ? 'All' : currentBuyer}
              onChange={e => switchBuyer(e.target.value === 'All' ? 'Total' : e.target.value)}
            >
              {buyerOptions.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
        )}

        </div>
      {loading && !summary ? <DashboardSkeleton /> : (
        <div className='flex flex-wrap items-center gap-2 md:gap-10 mt-4'>
          <div className="flex items-center gap-2">
            <span className="text-xs sm:text-sm font-semibold text-gray-600">Quality Claims:</span>
            <div className="flex h-11 items-center gap-2 px-3 border border-gray-200 rounded-lg bg-white">
              <span className="text-lg font-bold text-gray-900">{qualityValue}</span>
              <MiniTabs options={['This Year','Last Year']} value={qualityYear} onChange={setQualityYear} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-600">TYTD Open Pos:</span>
            <div className="flex h-11 items-center gap-2 px-3 border border-gray-200 rounded-lg bg-white">
              <span className="text-lg font-bold text-gray-900">{tytdValue}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-600">Target:</span>
            <div className="flex h-11 items-center gap-2 px-3 border border-gray-200 rounded-lg bg-white">
              <span className={`text-lg font-bold ${fyYear === 'fy27' ? 'text-gray-300' : 'text-gray-900'}`}>{fmt$(ytdTarget)}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-600">Achieved:</span>
            <div className="flex h-11 items-center gap-2 px-3 border border-gray-200 rounded-lg bg-white">
              <span className="text-lg font-bold text-gray-900">{totalOrders}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-600">YOY Growth:</span>
            <div className="flex h-11 items-center gap-2 px-3 border border-gray-200 rounded-lg bg-white">
              <span className="text-lg font-bold text-gray-900">{fmtPct(actualGrowth)}</span>
            </div>
          </div>
        </div>
      )}

      {summary && (
        <div className="bg-white">
          <div className="magic-bento-grid">

            <BentoKpiCard cardId="current_fy_shipped" title={`FYTD ${cfg.current.short} Shipped`}
              subtitle={`Target: ${fmt$(ytdTarget)}`} value={fmt$(currentFyVolume)} onLinkClick={handleShippedPoSummary} />

            <BentoKpiCard cardId="open_po" title="Open POs" subtitle={cfg.current.short}
              value={fmt$(summary.totalOpenPos ?? 0)}
              linkText="View Details →" onLinkClick={handleOpenPoSummary} />

            <div className={CARD} data-card-id="volume_shipped">
              <div className={CARD_HEADER}>
                <div>
                  <h2 className={CARD_TITLE}>{`FYTD ${cfg.current.short} Shipped`}</h2>
                  <div className={CARD_SUB}>See Progress Below</div>
                </div>
              </div>
              <div className={CARD_CONTENT}>
                <GaugeCard current={currentFyVolume} target={ytdTarget} />
              </div>
            </div>

            <BentoKpiCard cardId="prev_fy_shipped" title={`${cfg.previous.short} Shipped`}
              subtitle="April-March" value={fmt$(previousFyVolume)} />

            <div className={CARD} data-card-id="shipped_po_count" onClick={handleShippedPoSummary}>
              <div className={CARD_HEADER}>
                <div>
                  <h2 className={CARD_TITLE}>Shipped POs Count</h2>
                  <div className={CARD_SUB}>This Year</div>
                </div>

                <div onClick={e => e.stopPropagation()}>
                  <MiniTabs options={['Total','On Time','Late']} value={shippedPoType} onChange={setShippedPoType} />
                </div>
              </div>
              <div className={CARD_CONTENT}>
                <div className={KPI_VALUE}>{shippedPoDisplay}</div>
              </div>
            </div>

            <BentoKpiCard cardId="open_pos_count" title="Open POs Count" onClick={handleOpenPoSummary}
              subtitle={cfg.current.short} value={String(summary.openPosCount ?? 0)} onLinkClick={handleOpenPoSummary}  />

            <BentoKpiCard cardId="growth_rate" title="Target Growth Rate"
              subtitle={`YOY ${cfg.previous.year}`} value={fmtPct(summary.growth ?? 0)} />

            <BentoKpiCard cardId="target_achieved" title="Target Achieved"
              subtitle={`FYTD ${cfg.current.short}`} value={fmtPct(targetAchieved)} />

            {/* Global Markets */}
            {/* <div className={CARD} data-card-id="sourcing_by_region">
              <div className={CARD_HEADER}>
                <div>
                  <h2 className={CARD_TITLE}>Global Markets</h2>
                  <div className={CARD_SUB}>YTD Value</div>
                </div>
                <MiniTabs
                  options={['By Country','By Client']}
                  value={sourcingMode === 'country' ? 'By Country' : 'By Client'}
                  onChange={v => setSourcingMode(v === 'By Country' ? 'country' : 'client')}
                />
              </div>
              <div className={CARD_CONTENT}>
                {sourcingList.length === 0
                  ? <div className="py-6 text-center text-gray-400 text-sm">No data</div>
                  : sourcingMode === 'country'
                    ? <div className="flex flex-wrap gap-2 mt-2">
                        {sourcingList.slice(0, 5).map(d => (
                          <div key={d.region} className="flex items-center gap-1.5">
                            <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: d.color }} />
                            <span className="text-xs text-gray-600">{d.region}</span>
                          </div>
                        ))}
                      </div>
                    : <div className="space-y-1 mt-2 max-h-32 overflow-y-auto">
                        {sourcingList.slice(0, 6).map(c => (
                          <div key={c.client || c.region} className="text-xs text-gray-600 truncate">
                            {c.client || c.region}
                          </div>
                        ))}
                      </div>
                }
              </div>
            </div> */}
             <div className ={CARD} data-card-id="sourcing_by_region">
              <div className={CARD_HEADER}>
                <div>
                  <h2 className={CARD_TITLE}>Global Markets</h2>
                  <div className={CARD_SUB}>YTD Value</div>
                </div>
                <MiniTabs
                  options={['By Country','By Client']}
                  value={sourcingMode === 'country' ? 'By Country' : 'By Client'}
                  onChange={v => setSourcingMode(v === 'By Country' ? 'country' : 'client')}
                />
              </div>
              <div className={CARD_CONTENT}>
            <SourcingRegionChart
                sourcingList={sourcingList}
                sourcingMode={sourcingMode}
                setSourcingMode={setSourcingMode}
              />
              </div>
            </div>

            {/* Open POs By Months */}
            <div className={CARD} data-card-id="open_po_monthly">
              <div className={CARD_HEADER}>
                <div>
                  <h2 className={CARD_TITLE}>Open POs By Months</h2>
                  <div className={CARD_SUB}>Count &amp; Value</div>
                </div>
                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                  <MiniTabs
                    options={[`${cfg.current.short} (Apr-Mar)`, `FY${cfg.current.year + 1} (Apr-Mar)`]}
                    value={openPoTableView === 'fiscal' ? `${cfg.current.short} (Apr-Mar)` : `FY${cfg.current.year + 1} (Apr-Mar)`}
                    onChange={v => setOpenPoTableView(v.startsWith(cfg.current.short) ? 'fiscal' : 'calendar')}
                  />
                  <button
                    onClick={handleOpenPoSummary}
                    title="Open full summary"
                    className="flex items-center justify-center w-8 h-8 rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition-colors cursor-pointer shrink-0"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                      <polyline points="15 3 21 3 21 9"/>
                      <line x1="10" y1="14" x2="21" y2="3"/>
                    </svg>
                  </button>
                </div>
              </div>
              <div className={CARD_CONTENT}>
                <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0">
                  <table className="w-full border-collapse text-[0.8em]">
                    <thead>
                      <tr className="bg-gray-50 text-gray-500 font-semibold text-[11px] sm:text-xs md:text-sm lg:text-sm sticky top-0 z-[1]">
                        <th className="px-2 py-1.5 text-left whitespace-nowrap border-b border-gray-200">Month</th>
                        <th className="px-2 py-1.5 text-left whitespace-nowrap border-b border-gray-200">Count</th>
                        <th className="px-2 py-1.5 text-left whitespace-nowrap border-b border-gray-200">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {openPoRows.map((r) => (
                        <tr key={r.month} className="border-b border-gray-100 text-[10px] sm:text-xs md:text-sm lg:text-xs hover:bg-[#f5f7ff]">
                          <td className="px-2 py-1.5 whitespace-nowrap">{r.month}</td>
                          <td className={`px-2 py-1.5 whitespace-nowrap font-semibold ${r.count ? 'text-black' : 'text-gray-300'}`}>
                            {r.count || '0'}
                          </td>

                          {/* ✅ Clickable only when value exists */}
                          <td
                            className={`px-2 py-1.5 whitespace-nowrap font-medium transition-colors
                              ${r.value
                                ? 'text-[#005A9C] cursor-pointer hover:text-blue-800 hover:underline underline-offset-2'
                                : 'text-gray-300'
                              }`}
                             onClick={r.value ? (e) => {
                                e.stopPropagation()
                                console.log('r.month type:', typeof r.month, 'value:', r.month)  // ← check this
                                handleOpenPoSummary(labelToSlug(String(r.month)))
                              } : undefined}
                          >
                            {r.value > 0 ? fmt$(r.value) : '$0.00'}
                          </td>
                        </tr>
                      ))}
                    </tbody>

                    {/* ✅ Total row — aligns with columns like Image 1 */}
                    <tfoot>
                      <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold text-[11px] sm:text-xs sticky bottom-0">
                        <td className="px-2 py-2 whitespace-nowrap text-gray-700">Total</td>
                        <td className="px-2 py-2 whitespace-nowrap text-gray-900">{openPoTotalCount} POs</td>
                        <td className="px-2 py-2 whitespace-nowrap text-gray-900">{fmt$(openPoTotalValue)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>  
              </div>
            </div>

            {/* FY By Months chart(s) */}
            {fyYear === 'fy27' ? (<>
              <div className={CARD} data-card-id="volume_fy26">
                <div className={CARD_HEADER}>
                  <div>
                    <h2 className={CARD_TITLE}>FY26 By Months</h2>
                    <div className={CARD_SUB}>Shipped &amp; Open POs</div>
                  </div>
                  <select
                    className="h-6 px-1.5 text-[10px] border border-gray-200 rounded-md bg-white"
                    value={volumeVendor}
                    onChange={e => setVolumeVendor(e.target.value)}
                  >
                    <option value="All">All Vendors</option>
                    {fy26VolumeData?.rows && [...new Set(fy26VolumeData.rows.map(r => r.vendor).filter(Boolean))].sort()
                      .map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
                <div className={CARD_CONTENT}>
                  {fy26VolumeData ? (
                    <div className="-ml-6">
                      <Fy26ByMonthsChart
                        volumeData={fy26VolumeData}
                        openOrdersData={openOrdersData}
                        buyer={currentBuyer === 'Total' ? 'All' : currentBuyer}
                        buyerSwitcherBuyers={availableBuyers}
                        vendor={volumeVendor}
                        fyConfig={FY_CONFIG.fy26}
                        onYMax={onFy26YMax}
                        yMax={sharedYMax}
                      />
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-xs text-gray-300 animate-pulse">
                      Loading FY26 data…
                    </div>
                  )}
                </div>
              </div>

              <div className={CARD} data-card-id="volume_fy27">
                <div className={CARD_HEADER}>
                  <div>
                    <h2 className={CARD_TITLE}>FY27 By Months</h2>
                    <div className={CARD_SUB}>Shipped &amp; Open POs</div>
                  </div>
                  <select
                    className="h-6 px-1.5 text-[10px] border border-gray-200 rounded-md bg-white"
                    value={volumeVendor}
                    onChange={e => setVolumeVendor(e.target.value)}
                  >
                    <option value="All">All Vendors</option>
                    {volumeData?.rows && [...new Set(volumeData.rows.map(r => r.vendor).filter(Boolean))].sort()
                      .map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
                <div className={CARD_CONTENT}>
                  <div className="-ml-6">
                    <Fy26ByMonthsChart
                      volumeData={volumeData}
                      openOrdersData={openOrdersData}
                      buyer={currentBuyer === 'Total' ? 'All' : currentBuyer}
                      buyerSwitcherBuyers={availableBuyers}
                      vendor={volumeVendor}
                      onTotals={setChartTotals}
                      fyConfig={cfg}
                      onYMax={onFy27YMax}
                      yMax={sharedYMax}
                    />
                  </div>
                </div>
              </div>
            </>) : (
              <div className={CARD} data-card-id="volume_over_time">
                <div className={CARD_HEADER}>
                  <div>
                    <h2 className={CARD_TITLE}>{cfg.current.short} By Months</h2>
                    <div className={CARD_SUB}>Shipped &amp; Open POs</div>
                  </div>
                  <select
                    className="h-6 px-1.5 text-[10px] border border-gray-200 rounded-md bg-white"
                    value={volumeVendor}
                    onChange={e => setVolumeVendor(e.target.value)}
                  >
                    <option value="All">All Vendors</option>
                    {volumeData?.rows && [...new Set(volumeData.rows.map(r => r.vendor).filter(Boolean))].sort()
                      .map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
                <div className='-ml-6'>
                  <Fy26ByMonthsChart
                    volumeData={volumeData}
                    openOrdersData={openOrdersData}
                    buyer={currentBuyer === 'Total' ? 'All' : currentBuyer}
                    buyerSwitcherBuyers={availableBuyers}
                    vendor={volumeVendor}
                    onTotals={setChartTotals}
                    fyConfig={cfg}
                    compact
                  />
                </div>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  )
}
