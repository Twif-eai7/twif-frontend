import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'

// Master-data CBM lookup for PlanShipmentModal.jsx — per-unit CBM is derived
// as master_pack_cbm / master_pack_qty (now that master_pack_qty has been
// seeded). Matches on buyer_org_id + buyer_sku_ref only — skus.vendor_id
// isn't a maintained field (confirmed null on real rows even when every
// other master-data field is populated), so it's not used for matching.
// Falls back to a buyer+sku_ref match (ignoring variant) when no exact
// buyer+sku_ref+variant row exists.
export function useSkuMasterCbm(pos) {
  const [lookup, setLookup] = useState({})
  const [loading, setLoading] = useState(false)

  const posKey = pos.map(po => po.id).sort().join(',')

  useEffect(() => {
    if (!pos.length) { setLookup({}); return }
    setLoading(true)

    const buyerOrgIds = [...new Set(pos.map(po => po.buyer_org_id).filter(Boolean))]
    const skuRefs     = [...new Set(pos.flatMap(po => (po.po_line_items || []).map(li => li.buyer_sku_ref)).filter(Boolean))]

    if (!buyerOrgIds.length || !skuRefs.length) {
      setLookup({})
      setLoading(false)
      return
    }

    supabase
      .from('skus')
      .select('buyer_org_id, buyer_sku_ref, sku_variant, master_pack_cbm, master_pack_qty')
      .in('buyer_org_id', buyerOrgIds)
      .in('buyer_sku_ref', skuRefs)
      .is('delete_meta', null)
      .then(({ data, error }) => {
        if (error) { console.error('[useSkuMasterCbm] fetch error:', error.message); setLoading(false); return }

        const map = {}
        ;(data || []).forEach(row => {
          if (!row.master_pack_qty || row.master_pack_qty <= 0) return
          const perUnit  = (row.master_pack_cbm ?? 0) / row.master_pack_qty
          const exactKey = `${row.buyer_org_id}|${row.buyer_sku_ref}|${row.sku_variant || ''}`
          const looseKey = `${row.buyer_org_id}|${row.buyer_sku_ref}`
          map[exactKey] = perUnit
          if (!(looseKey in map)) map[looseKey] = perUnit
        })
        setLookup(map)
        setLoading(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posKey])

  const perUnitCbm = useMemo(() => (po, li) => {
    const exactKey = `${po.buyer_org_id}|${li.buyer_sku_ref}|${li.sku_variant || ''}`
    const looseKey = `${po.buyer_org_id}|${li.buyer_sku_ref}`
    return lookup[exactKey] ?? lookup[looseKey] ?? null
  }, [lookup])

  return { perUnitCbm, loading }
}
