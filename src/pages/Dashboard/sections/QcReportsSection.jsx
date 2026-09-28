import { Navigate } from 'react-router-dom'
import { useRole } from '../../../stores/profileStore'
import SupplierQcReports from '../../../components/qualityCompliance/SupplierQcReports'

// Supplier-facing QC Reports - a read-only view of this supplier's own
// inspection results (IRF, right above this in the sidebar, only lets them
// REQUEST an inspection - it never shows the result). Same role-gate-then-
// render pattern IrfSection.jsx/SignedAgreementSection.jsx already use for
// this Supplier-only nav entry.
export default function QcReportsSection() {
  const role = useRole()

  // Suppliers only. `role` is briefly null while the profile loads.
  if (role && role !== 'Supplier') return <Navigate to="/dashboard" replace />

  return <SupplierQcReports />
}
