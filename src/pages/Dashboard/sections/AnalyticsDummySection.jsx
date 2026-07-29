import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import SourcingRegionChart from '../../../components/dashboard/SourcingRegionChart'

/**
 * Static, data-free stand-in for AnalyticsSection, scoped to what a buyer
 * would actually see — no merchant-org-level target/growth fields, no
 * merchant/buyer switchers. Every stat is hardcoded to zero/placeholder.
 * No stores, no Supabase, no backend calls.
 *
 * Uses local Tailwind grid utilities rather than the shared magic-bento-grid
 * class, whose data-card-id positioning rules are keyed to MerchantDashboard's
 * full card set and leave empty cells when cards are omitted here.
 */

const CARD         = 'flex flex-col relative p-5 rounded-xl border border-gray-200 bg-white transition-all duration-300 cursor-default text-black'
const CARD_HEADER  = 'flex justify-between items-center mb-3 gap-4 flex-wrap'
const CARD_TITLE   = 'font-semibold text-[1em] m-0'
const CARD_SUB     = 'text-[0.78em] text-[#555] mt-0.5'
const CARD_CONTENT = 'flex-1 flex flex-col min-h-0'
const KPI_VALUE    = 'text-[2em] font-semibold my-1 leading-tight break-words'

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

function BentoKpiCard({ cardId, title, subtitle, value, linkText, className = '' }) {
  return (
    <div className={`${CARD} ${className}`} data-card-id={cardId}>
      <div className={CARD_HEADER}>
        <div>
          <h2 className={CARD_TITLE}>{title}</h2>
          {subtitle && <div className={CARD_SUB}>{subtitle}</div>}
        </div>
        {linkText && (
          <span className="text-[#005A9C] text-[0.85em] font-medium">{linkText}</span>
        )}
      </div>
      <div className={CARD_CONTENT}>
        <div className={KPI_VALUE}>{value}</div>
      </div>
    </div>
  )
}

function GaugeCard() {
  const size = 120, stroke = 12
  const r = size / 2 - stroke / 2
  const circ = Math.PI * r
  return (
    <div className="w-full flex flex-col">
      <div className="w-full flex items-baseline justify-between gap-3 mb-2">
        <span className="font-bold text-[#1100ff] text-lg">$0.00M</span>
        <span className="text-orange-500 text-xs font-bold">$0.00M</span>
      </div>
      <div className="relative w-full flex items-center justify-center">
        <svg viewBox={`0 0 ${size} ${size / 2}`} className="w-full max-w-[280px] h-auto">
          <path d={`M ${stroke/2},${size/2} A ${r},${r} 0 0 1 ${size-stroke/2},${size/2}`}
            fill="none" stroke="#eaeaea" strokeWidth={stroke} strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center pt-2 text-xl font-bold">0.00%</div>
      </div>
      <div className="text-[10px] text-gray-500 mt-1 text-center">Target: $0.00M</div>
    </div>
  )
}

const MONTH_SHORT = ['Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar']

// Fixed decorative heights — purely a shape hint for the eventual bar chart,
// not a representation of real values (every underlying stat here is 0).
const SHIPPED_SHAPE = [30, 45, 35, 55, 40, 60, 50, 65, 45, 70, 55, 60]
const OPEN_SHAPE     = [15, 20, 25, 18, 22, 28, 20, 24, 30, 22, 26, 20]

function BarChartPlaceholder({ height = 'min-h-[220px]' }) {
  return (
    <div className={`flex-1 ${height} flex flex-col`}>
      <div className="flex-1 flex items-end gap-1.5 sm:gap-2 px-1">
        {MONTH_SHORT.map((m, i) => (
          <div key={m} className="flex-1 flex items-end justify-center gap-[2px] h-full">
            <div className="w-full rounded-t-sm bg-gray-200" style={{ height: `${SHIPPED_SHAPE[i]}%` }} />
            <div className="w-full rounded-t-sm bg-gray-100" style={{ height: `${OPEN_SHAPE[i]}%` }} />
          </div>
        ))}
      </div>
      <div className="flex gap-1.5 sm:gap-2 px-1 mt-1.5 border-t border-gray-100 pt-1.5">
        {MONTH_SHORT.map(m => (
          <span key={m} className="flex-1 text-center text-[9px] text-gray-300">{m}</span>
        ))}
      </div>
      <div className="flex items-center gap-3 justify-center mt-2">
        <span className="flex items-center gap-1 text-[10px] text-gray-300">
          <span className="w-2 h-2 rounded-sm bg-gray-200 inline-block" /> Shipped
        </span>
        <span className="flex items-center gap-1 text-[10px] text-gray-300">
          <span className="w-2 h-2 rounded-sm bg-gray-100 inline-block" /> Open
        </span>
      </div>
    </div>
  )
}

// Fixed decorative shares — purely a shape hint for the real SourcingRegionChart
// (rendered as-is below), not real region/client breakdowns.
const FAKE_COUNTRY_DATA = [
  { region: 'Place A', value: 350000 },
  { region: 'Place B', value: 250000 },
  { region: 'Place C', value: 200000 },
  { region: 'Place D', value: 120000 },
  { region: 'Place E', value: 80000 },
]
const FAKE_CLIENT_DATA = [
  { client: 'Client A', value: 300000 },
  { client: 'Client B', value: 220000 },
  { client: 'Client C', value: 180000 },
  { client: 'Client D', value: 150000 },
  { client: 'Client E', value: 90000 },
]

const OPEN_PO_MONTHS = [
  'Apr 2026', 'May 2026', 'Jun 2026', 'Jul 2026', 'Aug 2026', 'Sep 2026',
  'Oct 2026', 'Nov 2026', 'Dec 2026', 'Jan 2027', 'Feb 2027', 'Mar 2027',
]

export default function AnalyticsDummySection() {
  const navigate = useNavigate()
  const [otifModalOpen, setOtifModalOpen] = useState(false)
  const [qualityYear, setQualityYear] = useState('This Year')
  const [shippedPoType, setShippedPoType] = useState('Total')
  const [sourcingMode, setSourcingMode] = useState('country')
  const sourcingList = sourcingMode === 'client' ? FAKE_CLIENT_DATA : FAKE_COUNTRY_DATA
  const [openPoView, setOpenPoView] = useState('FY26 (Apr-Mar)')

  const statItems = [
    { id: 'total_pos',  label: 'Total PO Value',         value: '$0' },
    { id: 'pos_count',  label: 'Total POs',              value: 0 },
    { id: 'total_skus', label: 'Converted SKUs',         value: 0 },
    { id: 'otif',       label: 'OTIF (Original)',        value: '0%' },
    { id: 'otifLatest', label: 'OTIF (After Exception)', value: '0%' },
  ]

  return (
    <>
      {/* Top stats bar */}
      <div className="flex flex-wrap gap-6 sm:gap-8 px-4 py-4 mb-2 border-b border-gray-100">
        {statItems.map(s => {
          const cls = 'relative pr-6 after:absolute after:right-0 after:top-0 after:bottom-0 after:w-px after:bg-gray-200 last:after:hidden'
          if (s.id === 'otif') {
            return (
              <button key={s.id} type="button" onClick={() => setOtifModalOpen(true)}
                className={`${cls} text-left cursor-pointer hover:opacity-80 transition-opacity`}>
                <div className="text-lg sm:text-xl font-bold text-gray-900">{s.value}</div>
                <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">{s.label}</div>
              </button>
            )
          }
          return (
            <div key={s.id} className={cls}>
              <div className="text-lg sm:text-xl font-bold text-gray-900">{s.value}</div>
              <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">{s.label}</div>
            </div>
          )
        })}
        <div className="ml-auto flex items-center gap-4">
          <button type="button" onClick={() => navigate('/dashboard')}
            className="self-center px-2.5 py-1 rounded-md border border-purple-600 bg-purple-600 text-xs font-semibold text-white hover:opacity-90 transition-opacity">
            Exit Demo
          </button>
          <span className="self-center text-xs text-gray-400 underline">Refresh</span>
        </div>
      </div>

      {/* OTIF modal */}
      {otifModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
          onClick={() => setOtifModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto relative p-5 pt-10"
            onClick={e => e.stopPropagation()}>
            <button type="button" onClick={() => setOtifModalOpen(false)}
              className="absolute top-3 right-3 p-1 rounded hover:bg-gray-100 text-gray-400 transition-colors">
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
            <div className="mb-3">
              <h2 className="font-semibold text-base m-0 text-gray-900">OTIF(Original) Monthly View</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[0.8em]">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 font-semibold text-[11px] sm:text-xs">
                    <th className="px-2 py-1.5 text-center whitespace-nowrap border-b border-gray-200">Month</th>
                    <th className="px-2 py-1.5 text-center whitespace-nowrap border-b border-gray-200">POs VAL</th>
                    <th className="px-2 py-1.5 text-center whitespace-nowrap border-b border-gray-200">SHPD POs VAL</th>
                    <th className="px-2 py-1.5 text-center whitespace-nowrap border-b border-gray-200">SHPD ON-TIME %</th>
                    <th className="px-2 py-1.5 text-center whitespace-nowrap border-b border-gray-200">BAL POs VAL</th>
                  </tr>
                </thead>
                <tbody>
                  {OPEN_PO_MONTHS.map(m => (
                    <tr key={m} className="border-b border-gray-100 hover:bg-[#f5f7ff]">
                      <td className="px-2 py-1.5 whitespace-nowrap text-center">{m}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap text-center">$0</td>
                      <td className="px-2 py-1.5 whitespace-nowrap text-center">$0</td>
                      <td className="px-2 py-1.5 whitespace-nowrap text-center font-semibold text-gray-300">0%</td>
                      <td className="px-2 py-1.5 whitespace-nowrap text-center">$0</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4 px-4">
        {/* Filters row */}
        <div className="flex flex-wrap items-center gap-4 mt-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-600">FY Year:</span>
            <select disabled className="min-w-[220px] h-8 px-3 border border-gray-200 rounded-lg bg-white text-xs">
              <option>FY 2027</option>
            </select>
          </div>
        </div>

        {/* Quality claims / TYTD row */}
        <div className="flex flex-wrap items-center gap-2 md:gap-10 mt-4">
          <div className="flex items-center gap-2">
            <span className="text-xs sm:text-sm font-semibold text-gray-600">Quality Claims:</span>
            <div className="flex h-11 items-center gap-2 px-3 border border-gray-200 rounded-lg bg-white">
              <span className="text-lg font-bold text-gray-900">$0</span>
              <MiniTabs options={['This Year', 'Last Year']} value={qualityYear} onChange={setQualityYear} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-600">TYTD Open Pos:</span>
            <div className="flex h-11 items-center gap-2 px-3 border border-gray-200 rounded-lg bg-white">
              <span className="text-lg font-bold text-gray-900">$0</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-600">Target:</span>
            <div className="flex h-11 items-center gap-2 px-3 border border-gray-200 rounded-lg bg-white">
              <span className="text-lg font-bold text-gray-900">$0</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-600">Achieved:</span>
            <div className="flex h-11 items-center gap-2 px-3 border border-gray-200 rounded-lg bg-white">
              <span className="text-lg font-bold text-gray-900">$0</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-600">YOY Growth:</span>
            <div className="flex h-11 items-center gap-2 px-3 border border-gray-200 rounded-lg bg-white">
              <span className="text-lg font-bold text-gray-900">0.00%</span>
            </div>
          </div>
        </div>

        {/* Card grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

          <BentoKpiCard cardId="current_fy_shipped" title="FYTD FY27 Shipped"
            subtitle="Target: $0" value="$0" />

          <BentoKpiCard cardId="open_po" title="Open POs" subtitle="FY27"
            value="$0" linkText="View Details →" />

          <div className={CARD} data-card-id="volume_shipped">
            <div className={CARD_HEADER}>
              <div>
                <h2 className={CARD_TITLE}>FYTD FY27 Shipped</h2>
                <div className={CARD_SUB}>See Progress Below</div>
              </div>
            </div>
            <div className={CARD_CONTENT}>
              <GaugeCard />
            </div>
          </div>

          <BentoKpiCard cardId="prev_fy_shipped" title="FY26 Shipped"
            subtitle="April-March" value="$0" />

          <div className={CARD} data-card-id="shipped_po_count">
            <div className={CARD_HEADER}>
              <div>
                <h2 className={CARD_TITLE}>Shipped POs Count</h2>
                <div className={CARD_SUB}>This Year</div>
              </div>
              <MiniTabs options={['Total', 'On Time', 'Late']} value={shippedPoType} onChange={setShippedPoType} />
            </div>
            <div className={CARD_CONTENT}>
              <div className={KPI_VALUE}>0</div>
            </div>
          </div>

          <BentoKpiCard cardId="open_pos_count" title="Open POs Count"
            subtitle="FY27" value="0" />

          <BentoKpiCard cardId="growth_rate" title="Target Growth Rate"
            subtitle="YOY 2026" value="0.00%" />

          <BentoKpiCard cardId="target_achieved" title="Target Achieved"
            subtitle="FYTD FY27" value="0.00%" />

          {/* Global Markets */}
          <div className={`${CARD} sm:col-span-2`} data-card-id="sourcing_by_region">
            <div className={CARD_HEADER}>
              <div>
                <h2 className={CARD_TITLE}>Global Markets</h2>
                <div className={CARD_SUB}>YTD Value</div>
              </div>
              <MiniTabs
                options={['By Country', 'By Client']}
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
          <div className={`${CARD} sm:col-span-2`} data-card-id="open_po_monthly">
            <div className={CARD_HEADER}>
              <div>
                <h2 className={CARD_TITLE}>Open POs By Months</h2>
                <div className={CARD_SUB}>Count &amp; Value</div>
              </div>
              <MiniTabs
                options={['FY26 (Apr-Mar)', 'FY27 (Apr-Mar)']}
                value={openPoView}
                onChange={setOpenPoView}
              />
            </div>
            <div className={CARD_CONTENT}>
              <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0">
                <table className="w-full border-collapse text-[0.8em]">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500 font-semibold text-[11px] sticky top-0 z-[1]">
                      <th className="px-2 py-1.5 text-left whitespace-nowrap border-b border-gray-200">Month</th>
                      <th className="px-2 py-1.5 text-left whitespace-nowrap border-b border-gray-200">Count</th>
                      <th className="px-2 py-1.5 text-left whitespace-nowrap border-b border-gray-200">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {OPEN_PO_MONTHS.map(m => (
                      <tr key={m} className="border-b border-gray-100 text-[10px] hover:bg-[#f5f7ff]">
                        <td className="px-2 py-1.5 whitespace-nowrap">{m}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap font-semibold text-gray-300">0</td>
                        <td className="px-2 py-1.5 whitespace-nowrap text-gray-300">$0.00</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold text-[11px] sticky bottom-0">
                      <td className="px-2 py-2 whitespace-nowrap text-gray-700">Total</td>
                      <td className="px-2 py-2 whitespace-nowrap text-gray-900">0 POs</td>
                      <td className="px-2 py-2 whitespace-nowrap text-gray-900">$0</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>

          {/* FY By Months charts */}
          <div className={`${CARD} sm:col-span-2`} data-card-id="volume_fy26">
            <div className={CARD_HEADER}>
              <div>
                <h2 className={CARD_TITLE}>FY26 By Months</h2>
                <div className={CARD_SUB}>Shipped &amp; Open POs</div>
              </div>
              <select disabled className="h-6 px-1.5 text-[10px] border border-gray-200 rounded-md bg-white">
                <option>All Vendors</option>
              </select>
            </div>
            <div className={CARD_CONTENT}>
              <BarChartPlaceholder />
            </div>
          </div>

          <div className={`${CARD} sm:col-span-2`} data-card-id="volume_fy27">
            <div className={CARD_HEADER}>
              <div>
                <h2 className={CARD_TITLE}>FY27 By Months</h2>
                <div className={CARD_SUB}>Shipped &amp; Open POs</div>
              </div>
              <select disabled className="h-6 px-1.5 text-[10px] border border-gray-200 rounded-md bg-white">
                <option>All Vendors</option>
              </select>
            </div>
            <div className={CARD_CONTENT}>
              <BarChartPlaceholder />
            </div>
          </div>

        </div>
      </div>
    </>
  )
}
