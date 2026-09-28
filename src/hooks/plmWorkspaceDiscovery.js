import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'

const chunkArray = (arr, size) => Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size))

// Fetches comments across many workspaces at once, filtered server-side by channel/role/group
// membership (POST /sku-workspaces/comments-bulk) — used by the Activity Log and the floating
// Dock's unread badge, neither of which should see a buyer-channel or vendor-channel message
// (or a group-chat message from a group they're not in) just because it's the workspace's
// most recent activity. Chunked the same way as fetchInChunks since workspaceIds can be huge
// for tech-dept org-wide visibility.
export async function fetchFilteredComments(workspaceIds) {
  if (!workspaceIds.length) return []
  const session = useAuthStore.getState().session
  const chunks = chunkArray(workspaceIds, 150)
  const results = await Promise.all(
    chunks.map(async (chunk) => {
      try {
        const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/plm/sku-workspaces/comments-bulk`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
          body: JSON.stringify({ workspaceIds: chunk }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) { console.error('[plm-discovery] comments-bulk failed:', json.error || res.status); return [] }
        return json.comments || []
      } catch (err) {
        // Network failure (backend unreachable, offline, etc.) — fail this chunk closed
        // instead of letting the fetch rejection blow up the whole Promise.all uncaught.
        console.error('[plm-discovery] comments-bulk network error:', err.message)
        return []
      }
    })
  )
  return results.flat()
}

// Batches an .in(column, ids) query — a single request with hundreds of ids (e.g. tech-dept
// org-wide discovery pulling 800+ uploads) blows past PostgREST's URL length limit and 400s.
// Exported so callers downstream of discoverWorkspaces (e.g. usePLMActivity resolving SKU/
// comment details for the same potentially-huge id lists) can batch the same way.
export async function fetchInChunks(table, select, column, ids, extra = q => q) {
  if (!ids.length) return []
  const chunks = chunkArray(ids, 150)
  const results = await Promise.all(
    chunks.map(chunk => extra(supabase.from(table).select(select).in(column, chunk)))
  )
  const rows = []
  for (const { data, error } of results) {
    if (error) console.error(`[plm-discovery] chunked query on ${table} failed:`, error.message)
    rows.push(...(data || []))
  }
  return rows
}

// Finds every workspace a member can see, role-branched:
//   - merchant: via catalog uploads they (or a granted peer) created — tech-dept members see
//     every merchant's uploads org-wide instead (see seeAllOrgWorkspaces), always on, so their
//     Activity Log/Dock aren't limited to just their own workspaces
//   - buyer/supplier: workspaces directly linked to them
// Shared by useRecentWorkspaces (floating dock) and usePLMActivity (activity log).
export async function discoverWorkspaces({ memberId, role, orgId, seeAllOrgWorkspaces = false }) {
  if (!memberId) return { wsRows: [], skuMap: {}, uploadMap: {} }

  if (role === 'merchant') {
    let creatorIds
    if (seeAllOrgWorkspaces && orgId) {
      const { data: orgMembers } = await supabase
        .from('organization_members')
        .select('id')
        .eq('organization_id', orgId)
      creatorIds = (orgMembers || []).map(m => m.id)
    } else {
      const { data: pairRows } = await supabase
        .from('merchant_access_pairs')
        .select('grantor_member_id')
        .eq('grantee_member_id', memberId)
      creatorIds = [memberId, ...(pairRows || []).map(r => r.grantor_member_id)]
    }

    const uploads = await fetchInChunks('npd2_catalog_uploads', 'id, supplier', 'created_by_member_id', creatorIds)

    const uploadIds = uploads.map(u => u.id)
    const uploadMap = Object.fromEntries(uploads.map(u => [u.id, u]))
    if (!uploadIds.length) return { wsRows: [], skuMap: {}, uploadMap }

    const skuRows_ = await fetchInChunks(
      'npd2_catalog_skus', 'id, auto_code, catalog_upload_id', 'catalog_upload_id', uploadIds,
      q => q.eq('is_archived', false).is('delete_meta', null)
    )

    const skuMap = Object.fromEntries(skuRows_.map(s => [s.id, s]))
    const skuIds = skuRows_.map(s => s.id)
    if (!skuIds.length) return { wsRows: [], skuMap, uploadMap }

    const ws = await fetchInChunks(
      'npd2_workspaces',
      'id, buyer_ref, catalog_sku_id, status, buyer_member_id, supplier_member_id, buyer_org_id, merchant_member_id, group_chat_member_ids',
      'catalog_sku_id', skuIds
    )

    return { wsRows: ws, skuMap, uploadMap }
  }

  if (role === 'qa') {
    // No direct buyer_member_id/supplier_member_id field to query — QA only ever reaches
    // workspaces via an accepted npd2_invites row (role='qa'), same as fetchCatalog's 'qa'
    // branch in plmStore.js.
    const { data: qaInvites } = await supabase
      .from('npd2_invites')
      .select('workspace_id')
      .eq('member_id', memberId)
      .eq('role', 'qa')
      .eq('status', 'accepted')
    const qaWsIds = (qaInvites || []).map(i => i.workspace_id).filter(Boolean)
    if (!qaWsIds.length) return { wsRows: [], skuMap: {}, uploadMap: {} }

    const ws = await fetchInChunks(
      'npd2_workspaces',
      'id, buyer_ref, catalog_sku_id, status, buyer_member_id, supplier_member_id, buyer_org_id, merchant_member_id, group_chat_member_ids',
      'id', qaWsIds
    )
    return { wsRows: ws, skuMap: {}, uploadMap: {} }
  }

  // buyer / supplier — workspaces they're directly linked to
  const field = role === 'buyer' ? 'buyer_member_id' : 'supplier_member_id'
  const { data: ws } = await supabase
    .from('npd2_workspaces')
    .select('id, buyer_ref, catalog_sku_id, status, buyer_member_id, supplier_member_id, buyer_org_id, merchant_member_id, group_chat_member_ids')
    .eq(field, memberId)

  return { wsRows: ws || [], skuMap: {}, uploadMap: {} }
}
