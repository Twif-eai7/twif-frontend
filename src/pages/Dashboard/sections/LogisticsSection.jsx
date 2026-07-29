import LogisticsChart from '../../../components/logistics/LogisticsChart';
import CourierLogsTable from '../../../components/logistics/CourierLogsTable';
import InternationalCourierLogsTable from '../../../components/logistics/InternationalCourierLogsTable';
import ShipmentContainersTab from '../../../components/logistics/ShipmentContainers/ShipmentContainersTab';
import { useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useRole } from '../../../stores/profileStore'
import { useTabGuard } from '../../../hooks/useTabGuard'

function ComingSoon() {
  return (
    <div className="flex items-center justify-center h-64 text-sm text-gray-400">
      Coming Soon
    </div>
  )
}

export default function LogisticsSection() {
  const role = useRole()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const tab = params.get('tab')

  useTabGuard('logistics', tab, '/dashboard/logistics')

  const DEFAULT_TAB = {
    Merchant: 'reports',
    Buyer: 'courier-logs-domestic',
  }

  useEffect(() => {
    if (!tab && role) {
      const def = DEFAULT_TAB[role] || 'courier-logs-domestic'
      navigate(`/dashboard/logistics?tab=${def}`, { replace: true })
    }
    // redirect old courier-logs param to domestic
    if (tab === 'courier-logs') {
      navigate(`/dashboard/logistics?tab=courier-logs-domestic`, { replace: true })
    }
  }, [tab, role])

  if (tab === 'courier-logs-domestic') return <CourierLogsTable />
  if (tab === 'courier-logs-international') return <InternationalCourierLogsTable />

  if (role === 'Merchant') {
    if (tab === 'reports') return <LogisticsChart />
    if (tab === 'shipment-containers') return <ShipmentContainersTab />
    if (tab) return <ComingSoon />
    return null
  }

  if (tab) return <ComingSoon />
  return null
}
