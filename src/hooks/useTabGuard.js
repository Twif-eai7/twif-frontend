import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAllowedModules } from '../stores/profileStore'

/**
 * Redirects away from a module the member isn't allowed into at all, or to the first
 * allowed tab if the current tab within an allowed module isn't permitted. No-op when
 * allowedModules is null (full access) beyond the optional `preferredTab` landing below.
 *
 * `allowedModules[moduleKey]` being absent (module not granted at all) and being present
 * as `null` (module granted, all tabs unrestricted) both used to look identical after an
 * `?? null` fallback — so a member whose sidebar hid a whole module could still reach it by
 * typing the URL directly, since this guard only ever checked "is this specific tab okay,"
 * never "should you be in this module in the first place." Checking `moduleKey in
 * allowedModules` first closes that gap.
 *
 * `preferredTab` (optional): the page's own product-chosen default tab (e.g.
 * 'invoice-list') to land on when there's no `?tab=` in the URL yet. Only opted into by
 * callers that pass it - a caller that omits it keeps its own separate "no tab" handling
 * (or none), unaffected. For a full-access member it's used as-is, same as every page's own
 * "redirect to default tab" effect already did before this centralized here. For a
 * restricted member it's used only if it's actually one of their allowed tabs - otherwise
 * this lands them on their own first allowed tab instead, which is the actual fix: every
 * page's own hardcoded default used to ignore allowedModules entirely, landing a restricted
 * member on a default tab they couldn't even see (a blank/ComingSoon page) until they
 * picked a visible tab themselves by hand.
 */
export function useTabGuard(moduleKey, currentTab, basePath, preferredTab) {
  const allowedModules = useAllowedModules()
  const navigate = useNavigate()

  useEffect(() => {
    if (!allowedModules) {
      if (!currentTab && preferredTab) navigate(`${basePath}?tab=${preferredTab}`, { replace: true })
      return
    }
    if (!(moduleKey in allowedModules)) {
      navigate('/dashboard', { replace: true })
      return
    }
    const allowedTabs = allowedModules[moduleKey]
    // A module can be "included" with literally zero tabs allowed under it
    // (see Sidebar.jsx's showAnyTab, gating this same edge case out of the
    // sidebar itself) - there's no tab to land this member on at all, same
    // as not being in the module in the first place, so send them back to
    // the dashboard rather than leaving them on a permanently blank page
    // this hook would otherwise never redirect off of (nothing to navigate
    // to below, in either branch).
    if (Array.isArray(allowedTabs) && allowedTabs.length === 0) {
      navigate('/dashboard', { replace: true })
      return
    }
    if (!currentTab) {
      if (!preferredTab) return
      if (allowedTabs === null || allowedTabs.includes(preferredTab)) {
        navigate(`${basePath}?tab=${preferredTab}`, { replace: true })
      } else {
        navigate(`${basePath}?tab=${allowedTabs[0]}`, { replace: true })
      }
      return
    }
    if (allowedTabs === null) return
    if (!allowedTabs.includes(currentTab)) {
      navigate(`${basePath}?tab=${allowedTabs[0]}`, { replace: true })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowedModules, moduleKey, currentTab, basePath, preferredTab])
}
