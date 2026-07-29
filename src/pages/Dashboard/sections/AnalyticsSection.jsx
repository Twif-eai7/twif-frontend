import { useState, useEffect } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { useRole, useOrgDepartment } from '../../../stores/profileStore'
import { useAuthStore } from '../../../stores/authStore'
import { useDashboardData } from '../../../hooks/useDashboardData'
import { computeOtifMonthly, buildShippedPoBuyersParam, otifMonthKeysForFy } from '../../../utils/otifMonthly'
import { useDashboardStore } from '../../../stores/dashboardStore'
import MerchantDashboard from '../../../components/dashboard/MerchantDashboard'

const API_BASE = import.meta.env.VITE_BACKEND_URL

function fmtOtifPct(n) {
  return n == null ? '—' : `${n.toFixed(0)}%`
}

function fmtShippedValue(n) {
  return n == null ? '—' : `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

export default function AnalyticsSection() {
  const role = useRole() ?? 'Merchant'
  const dept = useOrgDepartment()
  const navigate = useNavigate()
  const showDemoToggle = !dept || dept.toLowerCase() === 'tech'
  const [otifModalOpen, setOtifModalOpen] = useState(false)
  const [otifData, setOtifData] = useState(null)
  const [otifLoading, setOtifLoading] = useState(false)
  const {
    summary, volumeData, openOrdersData,
    kpiCards, spendOverTime, recentOrders,
    availableBuyers, currentBuyer, currentMerchant,
    isAdmin, merchantList,
    loading, error, reload,
    switchBuyer, switchMerchant,
    headerStats,
  } = useDashboardData()
  const fyYear = useDashboardStore(s => s.fyYear)
  const fy = fyYear === 'fy26' ? '26' : '27'

  const statItems = headerStats?.statItems ?? []

  useEffect(() => {
    if (!otifModalOpen || loading) return
    let cancelled = false
    setOtifLoading(true)
    ;(async () => {
      try {
        const session = useAuthStore.getState().session
        const p = new URLSearchParams({ fy, page: '1', pageSize: '99999', allRows: 'true' })
        const buyers = buildShippedPoBuyersParam(currentBuyer, availableBuyers)
        if (buyers) p.set('buyers', buyers)
        if (isAdmin && currentMerchant) p.set('merchant', currentMerchant)
        const res = await fetch(`${API_BASE}/dashboard/shipped-po-summary?${p}`, {
          credentials: 'include',
          headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
        })
        const j = await res.json()
        const rows = j.data?.rows ?? []
        if (!cancelled) {
          setOtifData(computeOtifMonthly(rows, otifMonthKeysForFy(fy)))
        }
      } catch {
        if (!cancelled) setOtifData(computeOtifMonthly([], otifMonthKeysForFy(fy)))
      } finally {
        if (!cancelled) setOtifLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [otifModalOpen, loading, currentBuyer, currentMerchant, availableBuyers, isAdmin, fy])

  const statsBar = loading && statItems.length === 0 ? (
    <div className="flex flex-wrap gap-6 sm:gap-8 px-4 py-4 mb-2 border-b border-gray-100 animate-pulse">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="relative pr-6">
          <div className="h-6 w-20 bg-gray-200 rounded mb-1.5" />
          <div className="h-2.5 w-14 bg-gray-200 rounded" />
        </div>
      ))}
    </div>
  ) : statItems.length > 0 ? (
    <div className="flex flex-wrap gap-6 sm:gap-8 px-4 py-4 mb-2 border-b border-gray-100">
      {statItems.map((s, i) => {
        const cls = 'relative pr-6 after:absolute after:right-0 after:top-0 after:bottom-0 after:w-px after:bg-gray-200 last:after:hidden'
        if (s.id === 'otif') {
          return (
            <button key={s.id ?? i} type="button" onClick={() => setOtifModalOpen(true)}
              className={`${cls} text-left cursor-pointer hover:opacity-80 transition-opacity`}>
              <div className="text-lg sm:text-xl font-bold text-gray-900">{s.value}</div>
              <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">{s.label}</div>
            </button>
          )
        }
        return (
          <div key={s.id ?? i} className={cls}>
            <div className="text-lg sm:text-xl font-bold text-gray-900">{s.value}</div>
            <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">{s.label}</div>
          </div>
        )
      })}
      <div className="ml-auto flex items-center gap-4">
        {showDemoToggle && (
          <button type="button" onClick={() => navigate('/dashboard/analytics-demo')}
            className="self-center px-2.5 py-1 rounded-md border border-purple-200 bg-purple-50 text-xs font-semibold text-purple-600 hover:bg-purple-600 hover:text-white transition-colors">
            Demo
          </button>
        )}
        <button type="button" onClick={reload}
          className="self-center text-xs text-gray-400 hover:text-gray-600 underline">
          Refresh
        </button>
      </div>
    </div>
  ) : null

  if (role === 'Merchant') {
    return (
      <>
        {statsBar}
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
                    {otifLoading ? (
                      <tr>
                        <td colSpan={5} className="px-2 py-4 text-center text-gray-400">Loading…</td>
                      </tr>
                    ) : (
                      otifData?.months.map(m => (
                        <tr key={m.label} className="border-b border-gray-100 hover:bg-[#f5f7ff]">
                          <td className="px-2 py-1.5 whitespace-nowrap text-center">{m.label}</td>
                          <td className="px-2 py-1.5 whitespace-nowrap text-center">{fmtShippedValue(m.orderValue)}</td>
                          <td className="px-2 py-1.5 whitespace-nowrap text-center">{fmtShippedValue(m.shippedValue)}</td>
                          <td className={`px-2 py-1.5 whitespace-nowrap text-center font-semibold ${m.percentage != null ? 'text-black' : 'text-gray-300'}`}>
                            {fmtOtifPct(m.percentage)}
                          </td>
                          <td className="px-2 py-1.5 whitespace-nowrap text-center">{fmtShippedValue(m.balanceValue)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
        <MerchantDashboard
          onMerchantChange={switchMerchant}
          onOpenPoSummary={({ buyer = '', month = '' , year = '27'} = {}) => {
            const p = new URLSearchParams({ tab: 'open-po-summary' })
            if (month) p.set('month', month)
            if (buyer) p.set('buyer', buyer)
            if (year)  p.set('year',  year)
            navigate(`/dashboard/orders?${p}`)
          }}
          onShippedPoSummary={({ buyer = '', year = '27', timing = '' } = {}) => {
            const p = new URLSearchParams({ tab: 'shipped-po-summary' })
            if (buyer)  p.set('buyer',  buyer)
            if (year)   p.set('year',   year)
            if (timing && timing !== 'Total') p.set('timing', timing)
            navigate(`/dashboard/orders?${p}`)
          }}
          summary={summary}
          volumeData={volumeData}
          openOrdersData={openOrdersData}
          availableBuyers={availableBuyers}
          currentBuyer={currentBuyer}
          currentMerchant={currentMerchant}
          isAdmin={isAdmin}
          merchantList={merchantList}
          loading={loading}
          error={error}
          reload={reload}
          switchBuyer={switchBuyer}
          switchMerchant={switchMerchant}
        />
      </>
    )
  }

  if (role === 'Buyer' || role === 'Supplier') {
    return <Navigate to="/plm" replace />
  }

  return null
}
