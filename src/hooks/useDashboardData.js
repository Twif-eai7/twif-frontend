/**
 * useDashboardData — proxy hook for backward compatibility.
 * All state and logic lives in src/stores/dashboardStore.js.
 * For non-merchant orgs (buyer, supplier) the merchant API is skipped entirely
 * and this hook returns stable empty state so their placeholder components render cleanly.
 */
import { useEffect } from 'react'
import { useDashboardStore } from '../stores/dashboardStore'
import { useProfileStore } from '../stores/profileStore'

const EMPTY = {
  summary: null, volumeData: null, openOrdersData: null,
  headerStats: null, kpiCards: [], spendOverTime: [], recentOrders: [],
  availableBuyers: [], merchantList: [], currentBuyer: null,
  currentMerchant: null, isAdmin: false,
  profile: null, buyerDetails: null,
  loading: false, error: null,
  reload: () => {}, switchBuyer: () => {}, switchMerchant: () => {},
}

export function useDashboardData() {
  const orgType = useProfileStore((s) => s.orgMembership?.orgType)

  const summary        = useDashboardStore((s) => s.summary)
  const volumeData     = useDashboardStore((s) => s.volumeData)
  const openOrdersData = useDashboardStore((s) => s.openOrdersData)
  const headerStats    = useDashboardStore((s) => s.headerStats)
  const kpiCards       = useDashboardStore((s) => s.kpiCards)
  const spendOverTime  = useDashboardStore((s) => s.spendOverTime)
  const recentOrders   = useDashboardStore((s) => s.recentOrders)
  const availableBuyers  = useDashboardStore((s) => s.availableBuyers)
  const merchantList   = useDashboardStore((s) => s.merchantList)
  const currentBuyer   = useDashboardStore((s) => s.currentBuyer)
  const currentMerchant = useDashboardStore((s) => s.currentMerchant)
  const isAdmin        = useDashboardStore((s) => s.isAdmin)
  const loading        = useDashboardStore((s) => s.loading)
  const error          = useDashboardStore((s) => s.error)
  const fetchAll       = useDashboardStore((s) => s.fetchAll)
  const reload         = useDashboardStore((s) => s.reload)
  const switchBuyer    = useDashboardStore((s) => s.switchBuyer)
  const switchMerchant = useDashboardStore((s) => s.switchMerchant)

  const isMerchant = orgType === 'merchant'

  useEffect(() => {
    if (!isMerchant) return
    if (loading && !summary) fetchAll()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMerchant])

  if (!isMerchant) return EMPTY

  return {
    summary, volumeData, openOrdersData,
    headerStats, kpiCards, spendOverTime, recentOrders,
    availableBuyers, currentBuyer, currentMerchant,
    isAdmin, merchantList,
    profile: null, buyerDetails: null,
    loading, error,
    reload, switchBuyer, switchMerchant,
  }
}
