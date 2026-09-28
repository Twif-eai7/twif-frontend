import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { usePlmStore } from '../stores/plmStore'
import { useAuthStore } from '../stores/authStore'
import { useRole, useMemberId, useOrgDepartment } from '../stores/profileStore'
import { usePlmMasterKeyActive } from '../stores/plmMasterKeyStore'

export function usePLMCatalog() {
  const session    = useAuthStore(s => s.session)
  const orgRole    = (useRole() || 'buyer').toLowerCase()
  const department = useOrgDepartment()
  // A QA-department merchant member never gets the full merchant catalog — org type alone
  // (useRole()) can't distinguish them from merchandising staff, so department overrides here.
  // Scoped to exactly the SKUs they've been individually invited to (see fetchCatalog's 'qa'
  // branch in plmStore.js), same restriction WorkspaceModal.jsx applies once a workspace is open.
  const role       = (orgRole === 'merchant' && department === 'qa') ? 'qa' : orgRole
  const customerId = session?.user?.id
  const memberId   = useMemberId()
  const masterKeyActive = usePlmMasterKeyActive()

  const fetchCatalog       = usePlmStore(s => s.fetchCatalog)
  const closeCatalogChannel = usePlmStore(s => s.closeCatalogChannel)
  const fetchCategories    = usePlmStore(s => s.fetchCategories)
  const openWorkspace      = usePlmStore(s => s.openWorkspace)
  const setFilter          = usePlmStore(s => s.setFilter)
  const [params]           = useSearchParams()

  useEffect(() => {
    if (!memberId) return
    fetchCategories()
    fetchCatalog(memberId, customerId, role)
    return () => closeCatalogChannel()
    // masterKeyActive is included so toggling PLM Master Key immediately refetches the
    // catalog with is_read_only recomputed, instead of leaving stale read-only SKUs.
  }, [memberId, customerId, role, masterKeyActive])

  // Open workspace from URL param — reacts to both initial load and dock-click
  // navigation. Only re-runs when the URL param itself changes (not on every
  // store update) — WorkspaceModal keeps the URL in sync with activeWorkspace,
  // so reacting to store state here too would refire this effect on close
  // (activeWorkspaceId -> null) before the URL catches up, reopening what was
  // just closed. The in-effect state check just skips a redundant reopen of
  // the workspace that's already current.
  const wsIdParam = params.get('workspace')
  useEffect(() => {
    if (!wsIdParam || !memberId) return
    const state = usePlmStore.getState()
    if (state.activeWorkspaceId === wsIdParam || state.workspaceLoading) return
    openWorkspace(wsIdParam)
  }, [wsIdParam, memberId])

  // Apply ?season= filter from URL (e.g. sidebar NavLinks)
  useEffect(() => {
    const season = params.get('season')
    if (season) setFilter('season', season)
  }, [params.get('season')])

  return { customerId, memberId, role }
}
