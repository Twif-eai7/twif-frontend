import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOrgDepartment } from '../../../stores/profileStore'
import AnalyticsV2Section from './AnalyticsV2Section'

// Departments whose own section is a more useful landing page than the
// generic Metrics & KPI dashboard - that page reads from a manually
// uploaded, email-keyed spreadsheet (merchant-performance-fy27.xlsx)
// scoped to sales/merchandising staff, so QA/Logistics accounts (no row
// in that sheet) never had anything real to see there - just a 404'd
// fetch leaving the page stuck on $0/a stray loading skeleton. Every
// other/unset department keeps the existing default.
const DEPARTMENT_HOME = {
  qa: '/dashboard/quality',
  logistics: '/dashboard/logistics',
}

export default function DashboardIndex() {
  const department = useOrgDepartment()
  const navigate = useNavigate()

  // Same useEffect + navigate(..., { replace: true }) pattern
  // QualitySection.jsx/LogisticsSection.jsx already use for their own
  // default-tab redirects - waits for `department` to actually resolve
  // (null while the profile is still loading) before redirecting, so this
  // never fires on stale/default data.
  useEffect(() => {
    const home = department && DEPARTMENT_HOME[department]
    if (home) navigate(home, { replace: true })
  }, [department, navigate])

  return <AnalyticsV2Section />
}
