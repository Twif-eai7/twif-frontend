import PctBeta from '../components/pctBeta/PctBeta'
import ComingSoon from './Dashboard/ComingSoon'
import Dashboard from './Dashboard/Dashboard'
import { useOrgDepartment } from '../stores/profileStore'

export default function PctBetaPage() {
  const department = useOrgDepartment()

  // Production Tracker stays tech-only. Other departments, including merchant
  // staff outside tech and vendors, keep the placeholder. Direct URLs are
  // blocked here too, not just the sidebar link.
  if (department === 'tech') return <PctBeta />
  return (
    <Dashboard>
      <ComingSoon />
    </Dashboard>
  )
}
