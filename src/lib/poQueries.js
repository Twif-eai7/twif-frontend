import { supabase } from './supabase'

export async function resolveSupplierLinkIds(supplierName) {
  if (!supplierName?.trim()) return null
  const names = supplierName.split(',').map(n => n.trim()).filter(Boolean)

  const { data: orgs } = await supabase
    .from('organizations').select('id')
    .in('display_name', names).eq('type', 'supplier')

  if (!orgs?.length) return []

  const { data: links } = await supabase
    .from('buyer_supplier_links').select('id')
    .in('supplier_org_id', orgs.map(o => o.id))
    .eq('relationship_status', 'active')

  return (links || []).map(l => l.id)
}

export async function resolveBuyerLinkIds(buyerName) {
  if (!buyerName?.trim()) return null
  const names = buyerName.split(',').map(n => n.trim()).filter(Boolean)

  const { data: orgs } = await supabase
    .from('organizations').select('id')
    .in('display_name', names).eq('type', 'buyer')

  if (!orgs?.length) return []

  const { data: links } = await supabase
    .from('buyer_supplier_links').select('id')
    .in('buyer_org_id', orgs.map(o => o.id))
    .eq('relationship_status', 'active')

  return (links || []).map(l => l.id)
}

export async function resolveOrgIdByName(name, type) {
  if (!name?.trim()) return null
  const { data } = await supabase
    .from('organizations').select('id')
    .ilike('display_name', name.trim())
    .eq('type', type)
    .limit(1)
    .maybeSingle()
  return data?.id || null
}

const _memberLinkCache = new Map() // memberId → linkId[]

export async function resolveMerchantMemberLinkIds(memberId) {
  if (!memberId) return null
  if (_memberLinkCache.has(memberId)) return _memberLinkCache.get(memberId)

  const { data: rows } = await supabase
    .from('member_organization_access')
    .select('buyer_supplier_link_id, organization_id')
    .eq('member_id', memberId)

  if (!rows?.length) {
    _memberLinkCache.set(memberId, [])
    return []
  }

  const directLinkIds = rows
    .filter(r => r.buyer_supplier_link_id)
    .map(r => r.buyer_supplier_link_id)

  // Priority: if any row has buyer_supplier_link_id set, use only those
  if (directLinkIds.length) {
    const result = [...new Set(directLinkIds)]
    _memberLinkCache.set(memberId, result)
    return result
  }

  // Fallback: expand by organization_id for rows where buyer_supplier_link_id is null
  const buyerOrgIds = [...new Set(rows.filter(r => r.organization_id).map(r => r.organization_id))]

  if (!buyerOrgIds.length) {
    _memberLinkCache.set(memberId, [])
    return []
  }

  const { data: links } = await supabase
    .from('buyer_supplier_links')
    .select('id')
    .in('buyer_org_id', buyerOrgIds)
    .eq('relationship_status', 'active')

  const result = (links || []).map(l => l.id)
  _memberLinkCache.set(memberId, result)
  return result
}

export async function resolveBuyerOrgsForMember(memberId) {
  if (!memberId) return []

  const { data: access } = await supabase
    .from('member_organization_access')
    .select('buyer_supplier_link_id, organization_id')
    .eq('member_id', memberId)

  if (!access?.length) return []

  const directLinkIds = access.map(r => r.buyer_supplier_link_id).filter(Boolean)
  const fallbackOrgIds = access.filter(r => !r.buyer_supplier_link_id).map(r => r.organization_id).filter(Boolean)

  const buyerOrgIds = new Set()

  // Restricted rows: resolve buyer_org_id from specific link IDs
  if (directLinkIds.length) {
    const { data: links } = await supabase
      .from('buyer_supplier_links')
      .select('buyer_org_id')
      .in('id', directLinkIds)
    ;(links || []).forEach(l => l.buyer_org_id && buyerOrgIds.add(l.buyer_org_id))
  }

  // Unrestricted rows: organization_id IS the buyer org directly
  fallbackOrgIds.forEach(id => buyerOrgIds.add(id))

  if (!buyerOrgIds.size) return []

  const { data: orgs } = await supabase
    .from('organizations')
    .select('id, display_name, name, domain')
    .in('id', [...buyerOrgIds])
    .eq('type', 'buyer')

  return (orgs || [])
    .map(o => ({ id: o.id, name: o.display_name || o.name, domain: o.domain || null }))
    .filter(o => o.name)
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function resolveSupplierNamesForMember(memberId) {
  if (!memberId) return []

  const { data: access } = await supabase
    .from('member_organization_access')
    .select('buyer_supplier_link_id, organization_id')
    .eq('member_id', memberId)

  if (!access?.length) return []

  const directLinkIds = access.map(r => r.buyer_supplier_link_id).filter(Boolean)
  const fallbackOrgIds = access.filter(r => !r.buyer_supplier_link_id).map(r => r.organization_id).filter(Boolean)

  const supplierOrgIds = new Set()

  // Restricted rows: get supplier_org_id from the specific link IDs only
  if (directLinkIds.length) {
    const { data: links } = await supabase
      .from('buyer_supplier_links')
      .select('supplier_org_id')
      .in('id', directLinkIds)
    ;(links || []).forEach(l => l.supplier_org_id && supplierOrgIds.add(l.supplier_org_id))
  }

  // Unrestricted rows: get all active supplier orgs for those buyer orgs
  if (fallbackOrgIds.length) {
    const { data: links } = await supabase
      .from('buyer_supplier_links')
      .select('supplier_org_id')
      .in('buyer_org_id', fallbackOrgIds)
      .eq('relationship_status', 'active')
    ;(links || []).forEach(l => l.supplier_org_id && supplierOrgIds.add(l.supplier_org_id))
  }

  if (!supplierOrgIds.size) return []

  const { data: orgs } = await supabase
    .from('organizations')
    .select('id, display_name, name, domain')
    .in('id', [...supplierOrgIds])
    .eq('type', 'supplier')

  return (orgs || [])
    .map(o => ({ id: o.id, name: o.display_name || o.name, domain: o.domain || null }))
    .filter(o => o.name)
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function resolveSupplierOrgsForBuyer(memberId, buyerOrgId) {
  const linkIds = await resolveBuyerOrgLinkIds(buyerOrgId, memberId)
  if (!linkIds?.length) return []

  const { data: links } = await supabase
    .from('buyer_supplier_links')
    .select('supplier_org_id')
    .in('id', linkIds)
    .eq('relationship_status', 'active')

  const supplierOrgIds = (links || []).map(l => l.supplier_org_id).filter(Boolean)
  if (!supplierOrgIds.length) return []

  const { data: orgs } = await supabase
    .from('organizations')
    .select('id, display_name, name, domain')
    .in('id', supplierOrgIds)
    .eq('type', 'supplier')

  return (orgs || [])
    .map(o => ({ id: o.id, name: o.display_name || o.name, domain: o.domain || null }))
    .filter(o => o.name)
    .sort((a, b) => a.name.localeCompare(b.name))
}

// Mirror of resolveSupplierOrgsForBuyer, other direction — which buyer orgs a given
// SUPPLIER org actually works with, straight off buyer_supplier_links (org↔org, no
// member_organization_access scoping needed since this is asked from the supplier's own
// org context, not a merchant's restricted member access). Used to populate the Buyer
// picker in PLM's catalog upload flows when the uploader is a vendor — those flows
// previously had no buyer field at all for vendor uploads, so a vendor's own catalog SKUs
// never carried a for_buyer_org_id and were never visible to any merchant.
export async function resolveBuyerOrgsForSupplier(supplierOrgId) {
  if (!supplierOrgId) return []

  const { data: links } = await supabase
    .from('buyer_supplier_links')
    .select('buyer_org_id')
    .eq('supplier_org_id', supplierOrgId)
    .eq('relationship_status', 'active')

  const buyerOrgIds = [...new Set((links || []).map(l => l.buyer_org_id).filter(Boolean))]
  if (!buyerOrgIds.length) return []

  const { data: orgs } = await supabase
    .from('organizations')
    .select('id, display_name, name, domain')
    .in('id', buyerOrgIds)
    .eq('type', 'buyer')

  return (orgs || [])
    .map(o => ({ id: o.id, name: o.display_name || o.name, domain: o.domain || null }))
    .filter(o => o.name)
    .sort((a, b) => a.name.localeCompare(b.name))
}

// Merchant→buyer→vendor cascade for MIS's filter dropdowns (SkuShipmentSummary.jsx),
// same cascading idea as PoRecord.jsx's usePODropdowns.js getBuyers/getSuppliers.
// Only used once a Merchant is picked, which is only ever shown to
// admin/owner — so no member_organization_access scoping needed here, unlike
// the member-restricted resolvers above.
//
// Prefers resolving the merchant string to an actual portal member and using
// their full member_organization_access list (same source
// analyticsStore.js's merchant switcher uses via resolveBuyerOrgsForMember) —
// that's the complete "buyers this merchandiser is assigned to" list, which
// can include a buyer they haven't created any PO for yet. Falls back to
// deriving buyers from purchase_orders.created_by (PO-derived, so it only
// ever shows buyers with an existing PO) when no matching member is found.
export async function findMerchantMemberId(merchantName) {
  const { data } = await supabase
    .from('organization_members')
    .select('id')
    .ilike('full_name', `%${merchantName.trim()}%`)
    .limit(1)
  return data?.[0]?.id || null
}

export async function resolveBuyerOrgsForMerchant(merchantName) {
  const memberId = await findMerchantMemberId(merchantName)
  if (memberId) {
    const orgs = await resolveBuyerOrgsForMember(memberId)
    if (orgs.length) return orgs
  }

  const { data: pos } = await supabase
    .from('purchase_orders')
    .select('buyer_supplier_link_id')
    .is('deleted_at', null).is('delete_meta', null)
    .ilike('created_by', `%${merchantName.trim()}%`)

  const linkIds = [...new Set((pos || []).map(r => r.buyer_supplier_link_id).filter(Boolean))]
  if (!linkIds.length) return []

  const { data: links } = await supabase
    .from('buyer_supplier_links')
    .select('buyer:organizations!buyer_supplier_links_buyer_org_id_fkey(id, display_name)')
    .in('id', linkIds).eq('relationship_status', 'active')

  return [...new Map((links || []).filter(l => l.buyer).map(l => [l.buyer.id, l.buyer.display_name])).entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function resolveSupplierOrgsForMerchant(merchantName, buyerOrgId) {
  const memberId = await findMerchantMemberId(merchantName)
  let linkIds

  if (memberId) {
    linkIds = await resolveMerchantMemberLinkIds(memberId)
  } else {
    const { data: pos } = await supabase
      .from('purchase_orders')
      .select('buyer_supplier_link_id')
      .is('deleted_at', null).is('delete_meta', null)
      .ilike('created_by', `%${merchantName.trim()}%`)
    linkIds = [...new Set((pos || []).map(r => r.buyer_supplier_link_id).filter(Boolean))]
  }
  if (!linkIds?.length) return []

  if (buyerOrgId) {
    const { data: buyerLinks } = await supabase
      .from('buyer_supplier_links').select('id')
      .eq('buyer_org_id', buyerOrgId).eq('relationship_status', 'active')
    const buyerLinkIds = new Set((buyerLinks || []).map(l => l.id))
    linkIds = linkIds.filter(id => buyerLinkIds.has(id))
    if (!linkIds.length) return []
  }

  const { data: links } = await supabase
    .from('buyer_supplier_links')
    .select('supplier:organizations!buyer_supplier_links_supplier_org_id_fkey(id, display_name)')
    .in('id', linkIds).eq('relationship_status', 'active')

  return [...new Map((links || []).filter(l => l.supplier).map(l => [l.supplier.id, l.supplier.display_name])).entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function resolveBuyerOrgLinkIds(orgId, memberId) {
  if (!orgId) return null

  // Check if this member has a specific link scoped in their access record.
  // organization_id, not a nonexistent buyer_org_id column — this was a
  // real, previously-dormant bug (see sql/sync_member_organization_access.sql's
  // own schema comment): querying the wrong column meant this branch could
  // never match, so a member with an actual scoped grant silently always
  // fell through to "all active links for this buyer org" below instead.
  if (memberId) {
    const { data: access } = await supabase
      .from('member_organization_access')
      .select('buyer_supplier_link_id')
      .eq('organization_id', orgId)
      .eq('member_id', memberId)
      .maybeSingle()

    if (access?.buyer_supplier_link_id) {
      return [access.buyer_supplier_link_id]
    }
  }

  // Fall back: all active links for this buyer org
  const { data: links } = await supabase
    .from('buyer_supplier_links').select('id')
    .eq('buyer_org_id', orgId)
    .eq('relationship_status', 'active')
  return (links || []).map(l => l.id)
}

// Supplier-org counterpart to resolveBuyerOrgLinkIds above — same shape,
// scoped by supplier_org_id instead, querying member_organization_access's
// real column (organization_id — a generic column that can hold either a
// buyer or supplier org id depending on which org the grant is for, see
// sql/sync_member_organization_access.sql's own comment).
export async function resolveSupplierOrgLinkIds(orgId, memberId) {
  if (!orgId) return null

  // Check if this member has a specific link scoped in their access record
  if (memberId) {
    const { data: access } = await supabase
      .from('member_organization_access')
      .select('buyer_supplier_link_id')
      .eq('organization_id', orgId)
      .eq('member_id', memberId)
      .maybeSingle()

    if (access?.buyer_supplier_link_id) {
      return [access.buyer_supplier_link_id]
    }
  }

  // Fall back: all active links for this supplier org
  const { data: links } = await supabase
    .from('buyer_supplier_links').select('id')
    .eq('supplier_org_id', orgId)
    .eq('relationship_status', 'active')
  return (links || []).map(l => l.id)
}