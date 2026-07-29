import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAllowedModules } from '../stores/profileStore'

/**
 * Redirects to the first allowed tab if the current tab is not permitted.
 * No-op when allowedModules is null (full access) or the module has no tab restrictions.
 */
export function useTabGuard(moduleKey, currentTab, basePath) {
  const allowedModules = useAllowedModules()
  const navigate = useNavigate()

  useEffect(() => {
    if (!allowedModules || !currentTab) return
    const allowedTabs = allowedModules[moduleKey] ?? null
    if (allowedTabs === null) return
    if (!allowedTabs.includes(currentTab)) {
      const first = allowedTabs[0]
      if (first) navigate(`${basePath}?tab=${first}`, { replace: true })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowedModules, moduleKey, currentTab])
}
