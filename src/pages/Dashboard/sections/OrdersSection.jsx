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
import OtifExceptions from '../../../components/orderManagement/OtifExceptions'

const DEFAULT_TAB = {
  Merchant: 'po-table',
  Buyer: 'open-pos',
}

function TabContent({ tab, month, buyer, year, timing, vendors, canReviewExceptions }) {
  const navigate = useNavigate()
  if (tab === 'otif-exceptions')    return <OtifExceptions canReview={canReviewExceptions} />
  if (tab === 'po-table')           return <PoRecord />
  if (tab === 'po-file-records')    return <POFileRecords />
  if (tab === 'pct-beta')           return <ComingSoon title="Production Control Tower" message="PCT has moved to /pct-beta" />
  if (tab === 'open-po-summary')    return (
    <OpenPoSummary
      key={`${buyer || 'all'}-${month || 'all'}-${year || '27'}-${vendors.join(',') || 'all'}`}   // ← remount when any changes
      defaultBuyer={buyer}                           // ← ADD
      defaultMonth={month}
      defaultYear={year}
      defaultVendors={vendors}
      onBackToDashboard={() => navigate('/dashboard')}
    />
  )
  if (tab === 'shipped-po-summary') return (
    <ShippedPoSummary
      key={`${buyer || 'all'}-${year || '27'}-${timing || 'all'}-${vendors.join(',') || 'all'}`}
      defaultBuyer={buyer}
      defaultYear={year}
      defaultTimingFilter={timing}
      defaultVendors={vendors}
      onBackToDashboard={() => navigate('/dashboard')}
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
  const year      = params.get('year')   ?? '27'
  const monthSlug = params.get('month')  ?? ''
  const buyer     = params.get('buyer')  ?? ''
  const timing    = params.get('timing') ?? ''
  // Hidden baseline scope — e.g. NKUKU's split-merchant supplier filter — never
  // surfaced as a visible "filter applied" state, just restricts which rows
  // the summary tables and their vendor dropdowns show to begin with.
  const vendors   = (params.get('vendors') ?? '').split('||').filter(Boolean)
  // Only convert if it looks like "YYYY-MM"
  const month = /^\d{4}-\d{2}$/.test(monthSlug)
    ? `${MONTHS[parseInt(monthSlug.split('-')[1], 10) - 1]} ${monthSlug.split('-')[0]}`
    : ''
  const tab = params.get('tab')

  const [isPending, startTransition] = useTransition()
  const [activeTab, setActiveTab] = useState(tab)

  // Redirects to DEFAULT_TAB when no tab is in the URL, same as before -
  // now permission-aware too: a restricted Merchant member lands on their
  // own first allowed Order Management tab instead of always po-table
  // regardless of whether they can actually see it.
  useTabGuard('orders', tab, '/dashboard/orders', role ? DEFAULT_TAB[role] : null)

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
        <TabContent tab={activeTab} month={month} buyer={buyer} year={year} timing={timing} vendors={vendors} canReviewExceptions={canReviewExceptions} />
      </div>
    )
  }

  return <ComingSoon />
}
