import ComingSoon from '../ComingSoon'
import { useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useRole } from '../../../stores/profileStore'
import { useTabGuard } from '../../../hooks/useTabGuard'
import FtprSummary from '../../../components/qualityCompliance/FtprSummary'
import PoInspectionComments from '../../../components/qualityCompliance/PoInspectionComments'
import FactoryAuditList from '../../../components/qualityCompliance/FactoryAuditList'
import InspectionSchedule from '../../../components/qualityCompliance/InspectionSchedule'
import QcReportsSummary from '../../../components/qualityCompliance/QcReportsSummary'
import InspectionRequestForm from '../../../components/qualityCompliance/InspectionRequestForm'
import QualityManual from './QualityManual'

const DEFAULT_TAB = {
  Merchant: 'qc-reports',
  Buyer: 'qc-reports'
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

  // Old bookmarked/shared links to the now-merged "QA Reports" tab land on
  // Factory Audits instead, which absorbed its content.
  useEffect(() => {
    if (tab === 'audit-summary') navigate('/dashboard/quality?tab=factory-audit', { replace: true })
  }, [tab])

  if (role === 'Merchant') {
    if (tab === 'ftpr-summary')   return <FtprSummary />
    if (tab === 'po-inspection')  return <PoInspectionComments />
    if (tab === 'inspection-schedule') return <InspectionSchedule />
    if (tab === 'qc-reports')     return <QcReportsSummary />
    if (tab === 'factory-audit')  return <FactoryAuditList />
    // Unconditional, same as QC Reports just below it - reachable
    // regardless of allowedModules, previously its own standalone
    // /qa-manual page (now just redirects here, see App.jsx).
    if (tab === 'qa-manual')      return <QualityManual />
    if (tab === 'irf')            return <InspectionRequestForm />
    if (tab === 'audit-summary')  return null // briefly null while redirect fires
    if (tab) return <ComingSoon />
    return null // briefly null while redirect fires
  }

  return <ComingSoon />
}
