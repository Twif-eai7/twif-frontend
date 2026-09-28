import { useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useProfileStore } from '../../../stores/profileStore'
import SkuShipmentSummary from '../../../components/logistics/ShipmentContainers/SkuShipmentSummary'

// No access guard — this route isn't registered in production at all
// anymore (see App.jsx, "mis" route commented out) and is only ever
// re-enabled locally, so there's nothing left to gate here.
export default function MisSection() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const orgMembership = useProfileStore(s => s.orgMembership)
  const dept = orgMembership?.department
  const isAdmin = orgMembership?.role === 'admin' || orgMembership?.role === 'owner'

  const canSeeShipmentPlanning = dept === 'tech' || dept === 'logistics' || isAdmin

  // Deep-link support for AnalyticsV2Section's KPI cards ("Open POs",
  // "FYTD Shipped", etc.) and its Open POs By Months table — they land here
  // with these params instead of computing their own totals, so the pages
  // agree by construction. buyer/vendor are display_name strings
  // (AnalyticsV2's own convention), resolved to org ids once
  // SkuShipmentSummary's buyer/vendor lists have loaded. merchant is plain
  // ILIKE text on both sides, used as-is. month ("YYYY-MM", from the table's
  // per-cell drill-down) narrows the date range to that one month instead of
  // fy's whole-FY range — see SkuShipmentSummary's monthSlugToRange.
  // merchantExclude is the opposite of merchant — a NOT ILIKE match, used
  // for a merchant (e.g. Shayni Sharma) whose slice is defined as
  // "everything except someone else's POs" rather than a positive name
  // match on their own — see sql/sku_summary_rpc.sql's header comment.
  // merchantExact is also positive (like merchant), but bypasses
  // SkuShipmentSummary's usual "prefer the matched member's own assigned
  // buyer access" substitution — for a merchant (Lakshit Bohra) whose real
  // DB access is broader than just their own POs, where that substitution
  // would otherwise silently widen the filter back out instead of
  // narrowing it — see useShipmentSkuSummary.js.
  const initialFilters = useMemo(() => {
    const buyer     = searchParams.get('buyer')
    const vendor    = searchParams.get('vendor')
    const merchant  = searchParams.get('merchant')
    const merchantExclude = searchParams.get('merchantExclude')
    const merchantExact   = searchParams.get('merchantExact')
    const status    = searchParams.get('status')
    const dateField = searchParams.get('dateField')
    const fy        = searchParams.get('fy')
    const month     = searchParams.get('month')
    if (!buyer && !vendor && !merchant && !merchantExclude && !merchantExact && !status && !dateField && !fy && !month) return null
    return { buyer, vendor, merchant, merchantExclude, merchantExact, status, dateField, fy, month }
  }, [searchParams])

  return (
    <SkuShipmentSummary
      initialFilters={initialFilters}
      onOpenPlanning={canSeeShipmentPlanning ? () => navigate('/dashboard/logistics?tab=shipment-containers') : undefined}
    />
  )
}
