import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useMemberId, useRole, useOrgDepartment } from '../stores/profileStore'
import { usePlmStore, mapComment } from '../stores/plmStore'
import { discoverWorkspaces, fetchFilteredComments, fetchInChunks } from './plmWorkspaceDiscovery'
import { attachmentPreview } from '../utils/plmAttachments'

// Small-scale name lookup (at most a handful of distinct authors across the Dock's top-5
// unread workspaces) — same fallback chain as the Activity Log's resolveAuthorNames.
async function resolveAuthorNames(authorIds) {
  if (!authorIds.length) return {}
  const mRows = await fetchInChunks('organization_members', 'id, full_name, user_id', 'id', authorIds)
  const nullIds = mRows.filter(m => !m.full_name).map(m => m.user_id).filter(Boolean)
  const uRows = await fetchInChunks('portal_users', 'id, email', 'id', nullIds)
  const emailMap = Object.fromEntries(uRows.map(u => [u.id, u.email]))
  const nameMap = {}
  mRows.forEach(m => { nameMap[m.id] = m.full_name || emailMap[m.user_id] || null })
  return nameMap
}

export function useRecentWorkspaces() {
  const memberId          = useMemberId()
  const orgRole           = (useRole() || 'buyer').toLowerCase()
  const orgDepartment     = useOrgDepartment()
  // Same department override as usePLMCatalog.js/WorkspaceModal.jsx — a QA-dept merchant
  // member must never fall into the 'merchant' org-wide discovery branch.
  const role              = (orgRole === 'merchant' && orgDepartment === 'qa') ? 'qa' : orgRole
  const activeWorkspaceId = usePlmStore(s => s.activeWorkspaceId)
  const activeWsRef       = useRef(activeWorkspaceId)
  const [unread, setUnread] = useState([])

  useEffect(() => { activeWsRef.current = activeWorkspaceId }, [activeWorkspaceId])

  const fetchUnread = useCallback(async () => {
    if (!memberId) { setUnread([]); return }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    const [{ wsRows, skuMap, uploadMap }, { data: lastSeen }] = await Promise.all([
      discoverWorkspaces({ memberId, role }),
      supabase.from('workspace_last_seen')
        .select('workspace_id, seen_at')
        .eq('member_id', memberId),
    ])
    if (!wsRows.length) { setUnread([]); return }

    const seenMap = Object.fromEntries((lastSeen || []).map(r => [r.workspace_id, r.seen_at]))
    return buildUnread({ wsRows, skuMap, uploadMap, seenMap, memberId, thirtyDaysAgo, activeWsRef, setUnread })
  }, [memberId, role])

  useEffect(() => {
    if (activeWorkspaceId) fetchUnread()
  }, [activeWorkspaceId, fetchUnread])

  useEffect(() => {
    fetchUnread()
    const onVisible = () => { if (document.visibilityState === 'visible') fetchUnread() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [fetchUnread])

  useEffect(() => {
    if (!memberId) return
    const channel = supabase
      .channel('dock-activity')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'npd2_comments' },
        () => fetchUnread()
      )
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [memberId, fetchUnread])

  // Dismiss every currently-unread workspace at once, instead of having to open
  // each one individually just to have it drop off the list.
  const dismissAll = useCallback(async () => {
    if (!memberId || !unread.length) return
    const seenAt = new Date().toISOString()
    const rows = unread.map(w => ({ member_id: memberId, workspace_id: w.workspaceId, seen_at: seenAt }))
    setUnread([])
    const { error } = await supabase
      .from('workspace_last_seen')
      .upsert(rows, { onConflict: 'member_id,workspace_id' })
    if (error) console.error('[last_seen] dismissAll upsert failed:', error.message, error.details, error.hint)
  }, [memberId, unread])

  return { unread, dismissAll }
}

async function buildUnread({ wsRows, skuMap, uploadMap, seenMap, memberId, thirtyDaysAgo, activeWsRef, setUnread }) {
  const wsIds = wsRows.map(w => w.id)
  if (!wsIds.length) { setUnread([]); return }

  // Server-side filtered by channel/role/group-membership — a buyer's Dock badge no longer
  // pops up for a vendor-channel (or non-member group-channel) message.
  const allComments = await fetchFilteredComments(wsIds)
  const comments = allComments
    .filter(c => c.created_at >= thirtyDaysAgo && c.author_member_id !== memberId)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

  const wsMap = Object.fromEntries(wsRows.map(w => [w.id, w]))
  // First (most recent, since `comments` is sorted newest-first) qualifying comment per
  // workspace is the "latest" shown in the hover preview; unreadCount tallies every
  // qualifying comment after last-seen, same "unseen since" rule the Activity Log uses.
  const latestByWs = {}
  const countByWs   = {}
  for (const c of comments) {
    const seen = seenMap[c.workspace_id]
    if (seen && c.created_at <= seen) continue
    if (!latestByWs[c.workspace_id]) latestByWs[c.workspace_id] = c
    countByWs[c.workspace_id] = (countByWs[c.workspace_id] || 0) + 1
  }

  const topEntries = Object.entries(latestByWs)
    .filter(([wsId]) => wsId !== activeWsRef.current)
    .slice(0, 5)

  const nameMap = await resolveAuthorNames([...new Set(topEntries.map(([, row]) => row.author_member_id).filter(Boolean))])

  setUnread(
    topEntries.map(([wsId, latestRow]) => {
      const ws       = wsMap[wsId]
      const sku      = skuMap[ws?.catalog_sku_id]
      const supplier = uploadMap[sku?.catalog_upload_id]?.supplier || null
      const latest   = mapComment(latestRow)
      // latest.body is raw HTML for rich-text ("Notes") comments — run it through the shared
      // preview so the Dock shows readable text, not "<div>…&nbsp;</div>".
      const preview  = attachmentPreview(latest)
      return {
        workspaceId:     wsId,
        label:           ws?.buyer_ref || sku?.auto_code || 'Workspace',
        skuCode:         sku?.auto_code || null,
        supplier,
        unreadCount:     countByWs[wsId] || 0,
        lastMessage:     preview.text || latest.body || null,
        lastAuthorName:  nameMap[latestRow.author_member_id] || null,
      }
    })
  )
}
