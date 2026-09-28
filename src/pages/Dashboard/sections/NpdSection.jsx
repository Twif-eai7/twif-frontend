import { Navigate, useSearchParams } from 'react-router-dom'
import { useTabGuard } from '../../../hooks/useTabGuard'
import { useProfileStore } from '../../../stores/profileStore'
import SkuImportTab from '../../../components/orderManagement/SkuImportTab'
import StyleLibraryTab from '../../../components/orderManagement/StyleLibraryTab'

export default function NpdSection() {
  const [params] = useSearchParams()
  const tab = params.get('tab')
  const orgMembership = useProfileStore(s => s.orgMembership)

  useTabGuard('npd', tab, '/dashboard/npd')

  // Same temporary restriction as Logistics MIS (see Sidebar.jsx's
  // canSeeStyleLibrary) — direct URL access must be blocked too, not just
  // the nav entry. Covers both Item Master and SKU Import (the latter no
  // longer nav-exposed directly, but still reachable via Item Master's
  // "Import SKU" button, or via a "Go to Batch" alert link). Allows erp too
  // (not just tech) — erp is one of the two departments the
  // "batch ready to review" alert goes to.
  const canSeeStyleLibrary = orgMembership?.department === 'tech' || orgMembership?.department === 'erp'

  if (tab === 'style-library') return canSeeStyleLibrary ? <StyleLibraryTab /> : <Navigate to="/plm" replace />
  if (tab === 'sku-import') return canSeeStyleLibrary ? <SkuImportTab /> : <Navigate to="/plm" replace />
  return <Navigate to="/plm" replace />
}
