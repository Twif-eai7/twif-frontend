import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { useAuthStore } from './authStore'

const BASE = import.meta.env.VITE_BACKEND_URL

let _abort = null
let _lastUserId = null
const _lastParams = { buyer: undefined, merchant: undefined, fyYear: undefined }


export const FY_CONFIG = {
  fy26: {
    current:  { label: 'FY 2026', short: 'FY26', year: 2026 },
    previous: { label: 'FY 2025', short: 'FY25', year: 2025 },
    fields:   { currentVolume: 'ytdActual', previousVolume: 'volumeLY25' },
    fiscalMonths:   ['April','May','June','July','August','September','October','November','December','forjan26','forfeb26','formar26'],
    monthLabels:    { forjan26: 'Jan26', forfeb26: 'Feb26', formar26: 'Mar26' },
    openPoFiscal:   ['April 2025','May 2025','June 2025','July 2025','August 2025','September 2025',
                     'October 2025','November 2025','December 2025','January 2026','February 2026','March 2026'],
    openPoCalendar: ['April 2026','May 2026','June 2026','July 2026','August 2026','September 2026',
                     'October 2026','November 2026','December 2026','January 2027','February 2027','March 2027'],
    perfRoute:   '/dashboard/merchant-performance',
    volumeRoute: '/dashboard/volume-shipped-ytd',
  },
  fy27: {
    current:  { label: 'FY 2027', short: 'FY27', year: 2027 },
    previous: { label: 'FY 2026', short: 'FY26', year: 2026 },
    fields:   { currentVolume: 'ytdActual', previousVolume: 'volumeLY26' },
    fiscalMonths:   ['April','May','June','July','August','September','October','November','December','forjan27','forfeb27','formar27'],
    monthLabels:    { forjan27: 'Jan27', forfeb27: 'Feb27', formar27: 'Mar27' },
    openPoFiscal:   ['April 2026','May 2026','June 2026','July 2026','August 2026','September 2026',
                     'October 2026','November 2026','December 2026','January 2027','February 2027','March 2027'],
    openPoCalendar: ['April 2027','May 2027','June 2027','July 2027','August 2027','September 2027',
                     'October 2027','November 2027','December 2027','January 2028','February 2028','March 2028'],
    perfRoute:   '/dashboard/merchant-performance-fy27',
    volumeRoute: '/dashboard/volume-shipped-fy27',
  },
}

function fmt$(n) {
  return `$${parseFloat(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
}

function normalizeSummary(summary, cfg) {
  if (!summary || !cfg) return summary
  return {
    ...summary,
    currentFyVolume:  parseFloat(summary[cfg.fields.currentVolume]  || 0),
    previousFyVolume: parseFloat(summary[cfg.fields.previousVolume] || 0),
  }
}

function computeHeaderStats(summary, currentBuyer) {
  if (!summary) return null
  return {
    totalPos: fmt$(summary.totalOrders),
    totalPosCount: (summary.onTimePos || 0) + (summary.latePos || 0) + (summary.openPosCount || 0),
    totalSKUs: summary.totalConvertedSKUs || 0,
    activeBuyer: currentBuyer || 'All',
    statItems: [
      { id: 'buyer', label: 'Buyer', value: currentBuyer || 'All' },
      { id: 'total_pos', label: 'Total PO Value', value: fmt$(summary.totalOrders) },
      {
        id: 'pos_count',
        label: 'Total POs',
        value: (summary.onTimePos || 0) + (summary.latePos || 0) + (summary.openPosCount || 0),
      },
      { id: 'total_skus', label: 'Converted SKUs', value: summary.totalConvertedSKUs || 0 },
      { id: 'otif', label:'OTIF (Original)', value :summary.otifRate},
      { id: 'otifLatest', label:'OTIF (After Exception)', value:summary.otifLatest},
    ],
  }
}

function computeKpiCards(summary, cfg) {
  if (!summary) return []
  return [
    { id: 'current_fy_shipped', value: summary.currentFyVolume,  label: `FYTD ${cfg.current.short} Shipped` },
    { id: 'open_po',            value: summary.totalOpenPos,      label: 'Open POs' },
    { id: 'volume_shipped',     value: summary.currentFyVolume,   label: 'Volume Shipped', target: summary.ytdTarget },
    { id: 'prev_fy_shipped',    value: summary.previousFyVolume,  label: `${cfg.previous.short} Shipped` },
    { id: 'open_pos_count',     value: summary.openPosCount,      label: 'Open POs Count' },
    { id: 'shipped_po_count',   value: summary.onTimePos,         label: 'Shipped POs Count' },
    { id: 'growth_rate',        value: summary.growth,            label: 'Target Growth Rate' },
    { id: 'actual_growth',      value: null,                      label: 'Actual Growth Rate', computed: true },
  ]
}

export const useDashboardStore = create(
  devtools(
    (set, get) => ({
      // ── Raw API data ──────────────────────────────────────────────────────────
      summary: null,
      volumeData: null,
      openOrdersData: null,
      fy26VolumeData: null,
      fy26VolumeMerchant: undefined,

      // ── Pre-computed derived state (stable references, set once per fetch) ───
      headerStats: null,
      kpiCards: [],
      spendOverTime: [],
      recentOrders: [],

      // ── Fetch context ─────────────────────────────────────────────────────────
      availableBuyers: [],
      merchantList: [],
      currentBuyer: null,
      currentMerchant: null,
      isAdmin: false,
      fyYear: 'fy27',

      // ── Fetch status ──────────────────────────────────────────────────────────
      loading: true,
      error: null,

      // ── Actions ───────────────────────────────────────────────────────────────
      fetchAll: async ({ buyer: buyerArg, merchant: merchantArg, fyYear } = {}) => {
        const session = useAuthStore.getState().session
        if (!session) return

        const userId = session.user?.id
        const userChanged = _lastUserId !== null && _lastUserId !== userId
        _lastUserId = userId

        // Discard stale merchant/buyer context inherited from a previous user's session
        const buyer    = userChanged ? undefined : buyerArg
        const merchant = userChanged ? undefined : merchantArg
        if (userChanged) {
          set({ currentMerchant: null, currentBuyer: null }, false, 'dashboard/sessionReset')
        }

        const fy  = fyYear ?? get().fyYear
        const cfg = FY_CONFIG[fy] ?? FY_CONFIG.fy27

        _lastParams.buyer    = buyer
        _lastParams.merchant = merchant
        _lastParams.fyYear   = fy

        if (_abort) _abort.abort()
        _abort = new AbortController()
        const signal = _abort.signal

        const authHeaders = {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        }

        set({ loading: true, error: null }, false, 'dashboard/fetchStart')

        try {
          // Step 1: Merchant performance
          const perfParams = new URLSearchParams()
          if (buyer && buyer !== 'All' && buyer !== 'Total') perfParams.set('buyer', buyer)
          if (merchant) perfParams.set('merchant', merchant)

          const perfQs = perfParams.toString()
          const perfRes = await fetch(
            `${BASE}${cfg.perfRoute}${perfQs ? `?${perfQs}` : ''}`,
            { headers: authHeaders, signal }
          )
          if (!perfRes.ok) {
            throw new Error((await perfRes.json()).error || 'Failed to load performance data')
          }
          const perfData = await perfRes.json()
          const pd = perfData.data
          const normalizedSummary = normalizeSummary(pd.summary, cfg)

          set(
            {
              fyYear: fy,
              summary: normalizedSummary,
              headerStats: computeHeaderStats(normalizedSummary, pd.currentBuyer),
              kpiCards: computeKpiCards(normalizedSummary, cfg),
              availableBuyers: pd.availableBuyers || [],
              currentBuyer: pd.currentBuyer,
              isAdmin: pd.isAdmin,
              merchantList: pd.merchantList || [],
              currentMerchant: pd.currentMerchant,
            },
            false,
            'dashboard/perfDone'
          )

          // Step 2: Volume + open orders in parallel
          const validBuyers = (pd.availableBuyers || []).filter(
            (b) => !b.toUpperCase().includes('TOTAL')
          )
          const buyersParam = validBuyers.join('||')
          const volumeParams = new URLSearchParams({ buyers: buyersParam })
          const openParams = new URLSearchParams({ buyers: buyersParam })
          if (merchant) {
            volumeParams.set('merchant', merchant)
            openParams.set('merchant', merchant)
          }

          const [volRes, openRes] = await Promise.all([
            fetch(`${BASE}${cfg.volumeRoute}?${volumeParams.toString()}`, { headers: authHeaders, signal }),
            fetch(`${BASE}/dashboard/open-orders?${openParams.toString()}`, { headers: authHeaders, signal }),
          ])

          const updates = {}
          if (volRes.ok) {
            const volData = await volRes.json()
            updates.volumeData = volData.data
            updates.spendOverTime = volData.data?.rows || []
          }
          if (openRes.ok) {
            const openData = await openRes.json()
            updates.openOrdersData = openData.data
            updates.recentOrders = (openData.data?.rows || []).slice(0, 20)
          }

          set({ ...updates, loading: false }, false, 'dashboard/fetchDone')

          // Background: cache FY26 volume for comparison chart when viewing FY27.
          // Only refetch when merchant context changes; buyer filter is client-side.
          if (fy === 'fy27') {
            const merchantKey = merchant ?? pd.currentMerchant ?? null
            const { fy26VolumeData, fy26VolumeMerchant } = get()
            if (!fy26VolumeData || fy26VolumeMerchant !== merchantKey) {
              const fy26Params = new URLSearchParams({ buyers: buyersParam })
              if (merchant) fy26Params.set('merchant', merchant)
              fetch(`${BASE}${FY_CONFIG.fy26.volumeRoute}?${fy26Params.toString()}`, { headers: authHeaders, signal })
                .then(r => r.ok ? r.json() : null)
                .then(d => { if (d) set({ fy26VolumeData: d.data, fy26VolumeMerchant: merchantKey }, false, 'dashboard/fy26VolumeDone') })
                .catch(() => {})
            }
          }
        } catch (err) {
          if (err.name === 'AbortError') return
          console.error('dashboardStore fetch error:', err)
          set({ error: err.message, loading: false }, false, 'dashboard/fetchError')
        }
      },

      switchFyYear: (year) => {
        if (!FY_CONFIG[year] || get().fyYear === year) return
        set({
          fyYear: year,
          summary: null, volumeData: null, openOrdersData: null,
          headerStats: null, kpiCards: [], spendOverTime: [], recentOrders: [],
          loading: true,
          ...(year === 'fy26' ? { fy26VolumeData: null, fy26VolumeMerchant: undefined } : {}),
        }, false, 'dashboard/fySwitch')
        get().fetchAll({ buyer: get().currentBuyer, merchant: get().currentMerchant, fyYear: year })
      },

      switchBuyer: (buyer, merchant) => {
        const resolvedMerchant = merchant ?? get().currentMerchant
        get().fetchAll({ buyer, merchant: resolvedMerchant, fyYear: get().fyYear })
      },

      switchMerchant: (merchant) => {
        get().fetchAll({ merchant, fyYear: get().fyYear })
      },

      reload: () => {
        get().fetchAll({ buyer: _lastParams.buyer, merchant: _lastParams.merchant, fyYear: _lastParams.fyYear ?? get().fyYear })
      },
    }),
    { name: 'Dashboard Store' }
  )
)

// ── Selector hooks — read stable state references, no inline construction ──────

export function useHeaderStats() {
  return useDashboardStore((s) => s.headerStats)
}

export function useKpiCards() {
  return useDashboardStore((s) => s.kpiCards)
}

export function useSpendOverTime() {
  return useDashboardStore((s) => s.spendOverTime)
}

export function useRecentOrders() {
  return useDashboardStore((s) => s.recentOrders)
}
