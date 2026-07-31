import ComingSoon from '../ComingSoon'
import { useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useRole } from '../../../stores/profileStore'
import { useTabGuard } from '../../../hooks/useTabGuard'
import QaReport from '../../../components/qualityCompliance/QaReport'
import FtprSummary from '../../../components/qualityCompliance/FtprSummary'
import PoInspectionComments from '../../../components/qualityCompliance/PoInspectionComments'
import FactoryAuditList from '../../../components/qualityCompliance/FactoryAuditList'

const DEFAULT_TAB = {
  Merchant: 'audit-summary',
  Buyer: 'audit-summary'
}

export default function QualitySection() {
  const role = useRole()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const tab = params.get('tab')

  useTabGuard('quality', tab, '/dashboard/quality')

  // Redirect to default tab so the sidebar NavLink is highlighted
  useEffect(() => {
    if (!tab && role) {
      const def = DEFAULT_TAB[role]
      if (def) navigate(`/dashboard/quality?tab=${def}`, { replace: true })
    }
  }, [tab])

  if (role === 'Merchant') {
    if (tab === 'audit-summary')  return <QaReport />
    if (tab === 'ftpr-summary')   return <FtprSummary />
    if (tab === 'po-inspection')  return <PoInspectionComments />
    if (tab === 'factory-audit')  return <FactoryAuditList />
    if (tab) return <ComingSoon />
    return null // briefly null while redirect fires
  }

  return <ComingSoon />
}
