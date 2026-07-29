import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useProfileStore } from '../stores/profileStore'
import { resolveBuyerOrgsForMember } from '../lib/poQueries'
import { titleCaseName } from '../utils/formatters'

// Visibility rules (shared across the Logistics MIS):
//   admin/owner (any dept)  → all buyers
//   dept === 'tech'         → all buyers
//   logistics member        → only buyers in member_organization_access
function canSeeAll(role, dept) {
  return role === 'admin' || role === 'owner' || dept === 'tech'
}

async function fetchAllBuyers() {
  const { data } = await supabase
    .from('buyer_supplier_links')
    .select('buyer_org_id, buyer:organizations!buyer_supplier_links_buyer_org_id_fkey(id, display_name)')
    .eq('relationship_status', 'active')

  const map = new Map()
  ;(data || []).forEach(l => { if (l.buyer && !map.has(l.buyer_org_id)) map.set(l.buyer_org_id, l.buyer.display_name) })
  return [...map.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

// The buyers a member can browse into — feeds PendingWorkOverview.jsx's
// buyer sidebar.
export function useBuyerOptions() {
  const { orgMembership } = useProfileStore()
  const role = orgMembership?.role
  const dept = orgMembership?.department
  const memberId = orgMembership?.memberId

  const [buyers, setBuyers] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!role) return
    setLoading(true)

    const load = canSeeAll(role, dept)
      ? fetchAllBuyers()
      : resolveBuyerOrgsForMember(memberId)

    load.then(list => {
      setBuyers(list.map(b => ({ ...b, name: titleCaseName(b.name) })))
      setLoading(false)
    })
  }, [role, dept, memberId])

  return { buyers, loading }
}
