const _session = new Map() // buyerOrgId → sku[]

export function useSkuCache() {
  const getSkus = async (buyerOrgId) => {
    if (!buyerOrgId) return []

    if (_session.has(buyerOrgId)) return _session.get(buyerOrgId)

    const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/skus?buyerOrgId=${buyerOrgId}`)
    if (!res.ok) return []

    const { skus } = await res.json()
    _session.set(buyerOrgId, skus ?? [])
    return skus ?? []
  }

  // Drops a buyer's cached list so the next getSkus() re-fetches — call after
  // creating a SKU inline so it shows up in the autocomplete without a reload.
  // Also busts the backend's own Redis cache for this buyer (24h TTL,
  // otherwise never invalidated — SKU creation writes straight to Supabase
  // via RPC, bypassing this endpoint entirely) so a *different* tab/session
  // doesn't keep serving the pre-creation list for the rest of that TTL.
  const invalidate = (buyerOrgId) => {
    _session.delete(buyerOrgId)
    if (!buyerOrgId) return
    fetch(`${import.meta.env.VITE_BACKEND_URL}/skus/cache?buyerOrgId=${buyerOrgId}`, { method: 'DELETE' }).catch(() => {})
  }

  return { getSkus, invalidate }
}
