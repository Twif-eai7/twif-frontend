import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { usePlmStore } from '../stores/plmStore'
import { useAuthStore } from '../stores/authStore'
import { useRole, useMemberId } from '../stores/profileStore'

export function usePLMCatalog() {
  const session    = useAuthStore(s => s.session)
  const role       = (useRole() || 'buyer').toLowerCase()
  const customerId = session?.user?.id
  const memberId   = useMemberId()

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
  }, [memberId, customerId, role])

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
