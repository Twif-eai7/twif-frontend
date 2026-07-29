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

  return { getSkus }
}
