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

export async function resolveBuyerOrgLinkIds(orgId, memberId) {
  if (!orgId) return null

  // Check if this member has a specific link scoped in their access record
  if (memberId) {
    const { data: access } = await supabase
      .from('member_organization_access')
      .select('buyer_supplier_link_id')
      .eq('buyer_org_id', orgId)
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