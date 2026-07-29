import { useEffect, useState, useMemo } from 'react'
import { useMemberId, useIsAdmin } from '../stores/profileStore'
import { resolveBuyerOrgsForMember } from '../lib/poQueries'

/**
 * Resolves which buyer orgs the logged-in merchant member may see in PO summary APIs.
 * Merchant admins (see profileStore useIsAdmin) are unrestricted — no buyers param.
 * Everyone else gets buyers from resolveBuyerOrgsForMember(memberId).
 *
 * buyersParam: undefined = loading, null = unrestricted, '' = no access, string = buyers query
 */
export function useMerchantPoBuyersAccess() {
  const memberId = useMemberId()
  const isUnrestricted = useIsAdmin()
  const [buyersParam, setBuyersParam] = useState(undefined)
  const [allowedBuyers, setAllowedBuyers] = useState([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      if (isUnrestricted) {
        if (!cancelled) {
          setBuyersParam(null)
          setAllowedBuyers([])
          setReady(true)
        }
        return
      }

      if (!memberId) {
        if (!cancelled) {
          setBuyersParam('')
          setAllowedBuyers([])
          setReady(true)
        }
        return
      }

      const orgs = await resolveBuyerOrgsForMember(memberId)
      if (cancelled) return

      const names = orgs.map((o) => o.name).filter(Boolean)
      setAllowedBuyers(names)
      setBuyersParam(names.length ? names.join('||') : '')
      setReady(true)
    }

    setReady(false)
    load()
    return () => { cancelled = true }
  }, [memberId, isUnrestricted])

  return useMemo(
    () => ({ ready, isUnrestricted, buyersParam, allowedBuyers }),
    [ready, isUnrestricted, buyersParam, allowedBuyers],
  )
}

/** Build URLSearchParams for shipped/open PO summary with buyer access applied. */
export function buildPoSummaryParams(year, buyersAccess) {
  const p = new URLSearchParams({ fy: year, page: '1', pageSize: '99999', allRows: 'true' })
  if (!buyersAccess.isUnrestricted && buyersAccess.buyersParam) {
    p.set('buyers', buyersAccess.buyersParam)
  }
  return p
}
