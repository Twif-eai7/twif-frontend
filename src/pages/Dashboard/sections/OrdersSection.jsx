import { useEffect, useTransition, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useRole, useIsAdmin, useOrgDepartment } from '../../../stores/profileStore'

import { useTabGuard } from '../../../hooks/useTabGuard'
import PoRecord from '../../../components/orderManagement/PoRecord'
import ComingSoon from '../ComingSoon'
import POFileRecords from '../../../components/dashboard/POFileRecords'
import OpenPoSummary from '../../../components/orderManagement/OpenPoSummary'
import ShippedPoSummary from '../../../components/orderManagement/ShippedPoSummary'
import PoTracker from '../../../components/orderManagement/PoTracker'
import InspectionPendingDispatch from '../../../components/orderManagement/InspectionPendingDispatch'
import OtifExceptions from '../../../components/orderManagement/OtifExceptions'

const DEFAULT_TAB = {
  Merchant: 'po-table',
  Buyer: 'open-pos',
}

function TabContent({ tab, month, buyer, year, timing, canReviewExceptions }) {
  if (tab === 'otif-exceptions')    return <OtifExceptions canReview={canReviewExceptions} />
  if (tab === 'po-table')           return <PoRecord />
  if (tab === 'po-file-records')    return <POFileRecords />
  if (tab === 'pct-beta')           return <ComingSoon title="Production Control Tower" message="PCT has moved to /pct-beta" />
  if (tab === 'inspection-pending-dispatch') return <InspectionPendingDispatch />
  if (tab === 'open-po-summary')    return (
    <OpenPoSummary
      key={`${buyer || 'all'}-${month || 'all'}-${year || '27'}`}   // ← remount when either changes
      defaultBuyer={buyer}                           // ← ADD
      defaultMonth={month}
      defaultYear={year}
    />
  )
  if (tab === 'shipped-po-summary') return (
    <ShippedPoSummary
      key={`${buyer || 'all'}-${year || '27'}-${timing || 'all'}`}
      defaultBuyer={buyer}
      defaultYear={year}
      defaultTimingFilter={timing}
    />
  )
  if (tab === 'recent-po') return <PoTracker />
  if (tab)  return <ComingSoon />
  return null
}
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

export default function OrdersSection() {
  const role    = useRole()
  const isAdmin = useIsAdmin()
  const dept    = useOrgDepartment()
  const canReviewExceptions = isAdmin && (dept === null || dept === 'tech')
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const year      = params.get('year')   ?? '27'
  const monthSlug = params.get('month')  ?? ''
  const buyer     = params.get('buyer')  ?? ''
  const timing    = params.get('timing') ?? ''
  // Only convert if it looks like "YYYY-MM"
  const month = /^\d{4}-\d{2}$/.test(monthSlug)
    ? `${MONTHS[parseInt(monthSlug.split('-')[1], 10) - 1]} ${monthSlug.split('-')[0]}`
    : ''
  const tab = params.get('tab')

  const [isPending, startTransition] = useTransition()
  const [activeTab, setActiveTab] = useState(tab)

  useTabGuard('orders', tab, '/dashboard/orders')

  // Redirect to default tab so the sidebar NavLink is highlighted
  useEffect(() => {
    if (!tab && role) {
      const def = DEFAULT_TAB[role]
      if (def) navigate(`/dashboard/orders?tab=${def}`, { replace: true })
    }
  }, [tab])

  // Defer heavy tab renders — sidebar stays responsive during switch
  useEffect(() => {
    if (tab) startTransition(() => setActiveTab(tab))
  }, [tab])

  if (role === 'Merchant') {
    return (
      <div className="relative">
        {isPending && (
          <div className="absolute inset-x-0 top-0 h-0.5 bg-blue-500 animate-pulse z-50" />
        )}
        <TabContent tab={activeTab} month={month} buyer={buyer} year={year} timing={timing} canReviewExceptions={canReviewExceptions} />
      </div>
    )
  }

  return <ComingSoon />
}
