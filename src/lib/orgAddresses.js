import { supabase } from './supabase'

const norm = s => (s || '').trim().toLowerCase().replace(/\s+/g, ' ')

// Returns one row per (org, address) pair — orgs with no saved address yet
// still appear once (with address: null) so they remain selectable/typeable.
export async function searchOrgAddresses(orgType, q) {
  let orgQuery = supabase.from('organizations').select('id, display_name, name').eq('type', orgType)
  if (q) orgQuery = orgQuery.or(`display_name.ilike.%${q}%,name.ilike.%${q}%`)
  const { data: orgs } = await orgQuery.order('display_name', { ascending: true, nullsFirst: false })
  if (!orgs?.length) return []

  const orgIds = orgs.map(o => o.id)
  const { data: addresses } = await supabase
    .from('organization_addresses')
    .select('id, organization_id, label, address_line1, address_line2, city, state, country, zip_code, is_default')
    .in('organization_id', orgIds)
    .order('is_default', { ascending: false })
    .order('created_on', { ascending: true })

  const byOrg = new Map(orgIds.map(id => [id, []]))
  ;(addresses || []).forEach(a => byOrg.get(a.organization_id)?.push(a))

  const result = []
  for (const org of orgs) {
    const orgAddrs = byOrg.get(org.id) || []
    if (!orgAddrs.length) {
      result.push({ ...org, addressId: null, label: null, address: null, city: null, state: null, country: null, zip: null, _variantKey: `${org.id}:none` })
      continue
    }
    for (const a of orgAddrs) {
      result.push({
        ...org,
        addressId: a.id,
        label: a.label,
        address: [a.address_line1, a.address_line2].filter(Boolean).join(', '),
        city: a.city,
        state: a.state,
        country: a.country,
        zip: a.zip_code,
        isDefault: a.is_default,
        _variantKey: `${org.id}:${a.id}`,
      })
    }
  }
  return result
}

// Inserts a new address for the org, skipping the insert if a row with the
// same address_line1 already exists (case/whitespace-insensitive) — city and
// zip_code are only compared when the caller actually supplied them, since
// most callers (courier log forms) only ever have one free-text address field
// and no separate city, and would otherwise never match an existing row that
// does have a city (e.g. one migrated from organizations.city).
// If the org had no addresses at all, the new row is marked as the default
// "Primary" address, and it's also mirrored onto organizations.address/city/
// state/country/zip so the org's own record isn't left blank.
export async function saveOrgAddress(organizationId, { address_line1, address_line2 = null, city = null, state = null, country = null, zip_code = null, label = null }) {
  if (!organizationId || !address_line1?.trim()) return null

  const { data: existing } = await supabase
    .from('organization_addresses')
    .select('id, address_line1, city, zip_code')
    .eq('organization_id', organizationId)

  const dupe = (existing || []).find(a => {
    if (norm(a.address_line1) !== norm(address_line1)) return false
    if (city && norm(a.city) !== norm(city)) return false
    if (zip_code && norm(a.zip_code) !== norm(zip_code)) return false
    return true
  })
  if (dupe) return dupe.id

  const isFirstAddress = !existing?.length
  const resolvedLabel = label || (isFirstAddress ? 'Primary' : `Address ${(existing?.length || 0) + 1}`)

  const { data, error } = await supabase
    .from('organization_addresses')
    .insert({
      organization_id: organizationId,
      label: resolvedLabel,
      address_line1: address_line1.trim(),
      address_line2, city, state, country, zip_code,
      is_default: isFirstAddress,
    })
    .select('id')
    .single()
  if (error) throw error

  if (isFirstAddress) {
    await supabase.from('organizations')
      .update({ address: address_line1.trim(), city, state, country, zip: zip_code })
      .eq('id', organizationId)
      .is('address', null)
  }

  return data.id
}
