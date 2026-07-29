import { useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useProfileStore } from '../stores/profileStore'
import { usePoStore } from '../stores/poStore'
import { resolveMerchantMemberLinkIds } from '../lib/poQueries'

export function usePODropdowns() {
  const { orgMembership } = useProfileStore()
  const setMerchants = usePoStore(s => s.setMerchants)
  const setBuyers    = usePoStore(s => s.setBuyers)
  const setSuppliers = usePoStore(s => s.setSuppliers)

  const fetchMerchants = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('get_distinct_merchants')
      if (error) throw error
      setMerchants((data || []).map(r => ({ name: r.created_by })))
    } catch (err) {
      console.warn('[usePODropdowns] fetchMerchants failed:', err.message)
    }
  }, [])

  const fetchDropdowns = useCallback(async ({ merchantName = '', buyerName = '' } = {}) => {
    const isAdminUser  = orgMembership?.role === 'admin' || orgMembership?.role === 'owner'
    const isMerchant   = orgMembership?.orgType === 'merchant'
    const memberId     = orgMembership?.memberId

    // Resolve allowed link IDs for non-admin merchant members once
    let allowedLinkIds = null
    if (isMerchant && !isAdminUser && memberId) {
      allowedLinkIds = await resolveMerchantMemberLinkIds(memberId)
    }

    const linksToBuyersSuppliers = async (linkIds) => {
      const { data } = await supabase
        .from('buyer_supplier_links')
        .select(`
          id,
          buyer:organizations!buyer_supplier_links_buyer_org_id_fkey(id, display_name),
          supplier:organizations!buyer_supplier_links_supplier_org_id_fkey(id, display_name)
        `)
        .in('id', linkIds)
        .eq('relationship_status', 'active')
      return data || []
    }

    const getBuyers = async () => {
      if (allowedLinkIds) {
        if (!allowedLinkIds.length) return []
        const rows = await linksToBuyersSuppliers(allowedLinkIds)
        return [...new Map(rows.map(r => [r.buyer.id, r.buyer.display_name])).entries()]
          .map(([id, display_name]) => ({ id, display_name }))
          .sort((a, b) => a.display_name.localeCompare(b.display_name))
      }

      if (merchantName?.trim()) {
        const { data: pos } = await supabase
          .from('purchase_orders').select('buyer_supplier_link_id')
          .gte('po_received_date', '2026-01-01')
          .is('deleted_at', null).is('delete_meta', null)
          .ilike('created_by', `%${merchantName.trim()}%`)

        const linkIds = [...new Set((pos || []).map(r => r.buyer_supplier_link_id).filter(Boolean))]
        if (!linkIds.length) return []

        const { data } = await supabase
          .from('buyer_supplier_links')
          .select('buyer:organizations!buyer_supplier_links_buyer_org_id_fkey(id, display_name)')
          .in('id', linkIds).eq('relationship_status', 'active')

        return [...new Map((data || []).map(r => [r.buyer.id, r.buyer.display_name])).entries()]
          .map(([id, display_name]) => ({ id, display_name }))
          .sort((a, b) => a.display_name.localeCompare(b.display_name))
      }

      const { data } = await supabase.rpc('get_distinct_buyers')
      return (data || []).map(r => ({ id: r.buyer_org_id, display_name: r.display_name }))
    }

    const getSuppliers = async () => {
      let scopedLinkIds = allowedLinkIds

      if (buyerName?.trim()) {
        const { data: orgs } = await supabase
          .from('organizations').select('id')
          .eq('display_name', buyerName.trim()).eq('type', 'buyer')
        const orgIds = (orgs || []).map(o => o.id)
        if (!orgIds.length) return []

        const { data: buyerLinks } = await supabase
          .from('buyer_supplier_links').select('id')
          .in('buyer_org_id', orgIds).eq('relationship_status', 'active')
        const buyerLinkIds = (buyerLinks || []).map(l => l.id)
        if (!buyerLinkIds.length) return []

        scopedLinkIds = scopedLinkIds
          ? scopedLinkIds.filter(id => buyerLinkIds.includes(id))
          : buyerLinkIds
      }

      if (scopedLinkIds) {
        if (!scopedLinkIds.length) return []
        const rows = await linksToBuyersSuppliers(scopedLinkIds)
        return [...new Map(rows.map(r => [r.supplier.id, r.supplier.display_name])).entries()]
          .map(([id, display_name]) => ({ id, display_name }))
          .sort((a, b) => a.display_name.localeCompare(b.display_name))
      }

      if (merchantName?.trim()) {
        let poQuery = supabase
          .from('purchase_orders').select('buyer_supplier_link_id')
          .gte('po_received_date', '2026-01-01')
          .is('deleted_at', null).is('delete_meta', null)
          .ilike('created_by', `%${merchantName.trim()}%`)

        const { data: pos } = await poQuery
        const linkIds = [...new Set((pos || []).map(r => r.buyer_supplier_link_id).filter(Boolean))]
        if (!linkIds.length) return []

        const { data } = await supabase
          .from('buyer_supplier_links')
          .select('supplier:organizations!buyer_supplier_links_supplier_org_id_fkey(id, display_name)')
          .in('id', linkIds).eq('relationship_status', 'active')

        return [...new Map((data || []).map(r => [r.supplier.id, r.supplier.display_name])).entries()]
          .map(([id, display_name]) => ({ id, display_name }))
          .sort((a, b) => a.display_name.localeCompare(b.display_name))
      }

      const { data } = await supabase.rpc('get_distinct_suppliers')
      return (data || []).map(r => ({ id: r.supplier_org_id, display_name: r.display_name }))
    }

    const [b, s] = await Promise.allSettled([getBuyers(), getSuppliers()])
    if (b.status === 'fulfilled') setBuyers(b.value)
    if (s.status === 'fulfilled') setSuppliers(s.value)
  }, [orgMembership])

  return { fetchMerchants, fetchDropdowns }
}