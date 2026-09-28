import { Navigate } from 'react-router-dom'
import { useRole } from '../../../stores/profileStore'
import InspectionRequestForm from '../../../components/qualityCompliance/InspectionRequestForm'

// Supplier-facing IRF (Inspection Request Form) - the in-app replacement
// for the external Google Form Sidebar.jsx's "IRF" tab used to link out to.
// Reuses InspectionRequestForm.jsx as-is (its own isSupplier branch already
// scopes the PO picker and pre-fills the submitter's identity), same
// role-gate-then-render pattern SignedAgreementSection.jsx already uses for
// this same Supplier-only nav entry.
export default function IrfSection() {
  const role = useRole()

  // Suppliers only. `role` is briefly null while the profile loads.
  if (role && role !== 'Supplier') return <Navigate to="/dashboard" replace />

  return <InspectionRequestForm />
}
