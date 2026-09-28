import LogisticsChart from '../../../components/logistics/LogisticsChart';
import CourierLogsTable from '../../../components/logistics/CourierLogsTable';
import InternationalCourierLogsTable from '../../../components/logistics/InternationalCourierLogsTable';
import ShipmentContainersTab from '../../../components/logistics/ShipmentContainers/ShipmentContainersTab';
import InvoiceLegReconciliation from '../../../components/reconciliation/InvoiceLegReconciliation';
import InspectionPendingDispatch from '../../../components/orderManagement/InspectionPendingDispatch';
import { useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useRole, useOrgDepartment, useIsAdmin } from '../../../stores/profileStore'
import { useTabGuard } from '../../../hooks/useTabGuard'
import ComingSoon from '../ComingSoon'

// Financial data (planned/shipped $ values) — restricted to merchant staff in
// a department that actually has a reason to see it, same bar as the
// advance-payment feature's write access. Layered on top of the generic
// allowed-modules tab-visibility system (showTab in Sidebar.jsx), which only
// controls whether the nav link itself shows.
function canViewShipmentInvoices(role, dept, isAdmin) {
  if (role !== 'Merchant') return false
  if (isAdmin) return true
  return dept === 'merchandising' || dept === 'erp' || dept === 'tech' || dept === 'it'
}

export default function LogisticsSection() {
  const role = useRole()
  const dept = useOrgDepartment()
  const isAdmin = useIsAdmin()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const tab = params.get('tab')

  const DEFAULT_TAB = {
    Merchant: 'shipment-containers',
    Buyer: 'courier-logs-domestic',
  }
  // Redirects to DEFAULT_TAB when no tab is in the URL, same as before -
  // now permission-aware too: a restricted Merchant member lands on their
  // own first allowed Logistics tab instead of always shipment-containers
  // regardless of whether they can actually see it.
  useTabGuard('logistics', tab, '/dashboard/logistics', role ? (DEFAULT_TAB[role] || 'courier-logs-domestic') : null)

  useEffect(() => {
    // redirect old courier-logs param to domestic
    if (tab === 'courier-logs') {
      navigate(`/dashboard/logistics?tab=courier-logs-domestic`, { replace: true })
    }
  }, [tab, navigate])

  if (tab === 'courier-logs-domestic') return <CourierLogsTable />
  if (tab === 'courier-logs-international') return <InternationalCourierLogsTable />
  // Needs Twif's own shipping-docs sheet before this can embed anything.
  if (tab === 'shipping-docs') return <ComingSoon />
  if (tab === 'inspection-pending-dispatch') return <InspectionPendingDispatch />

  if (role === 'Merchant') {
    if (tab === 'reports') return <LogisticsChart />
    if (tab === 'shipment-containers') return <ShipmentContainersTab />
    if (tab === 'shipment-invoices') {
      return canViewShipmentInvoices(role, dept, isAdmin)
        ? <InvoiceLegReconciliation />
        : (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center py-20">
            <p className="text-sm text-gray-500">This report isn't available for your department.</p>
          </div>
        )
    }
    if (tab) return <ComingSoon />
    return null
  }

  if (tab) return <ComingSoon />
  return null
}
