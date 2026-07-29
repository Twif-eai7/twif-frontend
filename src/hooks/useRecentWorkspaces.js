import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useMemberId, useRole } from '../stores/profileStore'
import { usePlmStore } from '../stores/plmStore'

export function useRecentWorkspaces() {
  const memberId          = useMemberId()
  const role              = (useRole() || 'buyer').toLowerCase()
  const activeWorkspaceId = usePlmStore(s => s.activeWorkspaceId)
  const activeWsRef       = useRef(activeWorkspaceId)
  const [unread, setUnread] = useState([])

  useEffect(() => { activeWsRef.current = activeWorkspaceId }, [activeWorkspaceId])

  const fetchUnread = useCallback(async () => {
    if (!memberId) { setUnread([]); return }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    let wsRows = []
    let skuMap = {}
    let uploadMap = {}

    // ── Merchant: discover workspaces via catalog uploads + peer pairs ──────────
    if (role === 'merchant') {
      const [{ data: pairRows }, { data: lastSeen }] = await Promise.all([
        supabase.from('merchant_access_pairs')
          .select('grantor_member_id')
          .eq('grantee_member_id', memberId),
        supabase.from('workspace_last_seen')
          .select('workspace_id, seen_at')
          .eq('member_id', memberId),
      ])

      const creatorIds = [memberId, ...(pairRows || []).map(r => r.grantor_member_id)]

      const { data: uploads } = await supabase
        .from('npd2_catalog_uploads')
        .select('id, supplier')
        .in('created_by_member_id', creatorIds)

      const uploadIds = (uploads || []).map(u => u.id)
      uploadMap = Object.fromEntries((uploads || []).map(u => [u.id, u]))
      if (!uploadIds.length) { setUnread([]); return }

      const { data: skuRows_ } = await supabase
        .from('npd2_catalog_skus')
        .select('id, auto_code, catalog_upload_id')
        .in('catalog_upload_id', uploadIds)
        .eq('is_archived', false)
        .is('delete_meta', null)

      skuMap = Object.fromEntries((skuRows_ || []).map(s => [s.id, s]))
      const skuIds = (skuRows_ || []).map(s => s.id)
      if (!skuIds.length) { setUnread([]); return }

      const { data: ws } = await supabase
        .from('npd2_workspaces')
        .select('id, buyer_ref, catalog_sku_id')
        .in('catalog_sku_id', skuIds)
      wsRows = ws || []

      const seenMap = Object.fromEntries((lastSeen || []).map(r => [r.workspace_id, r.seen_at]))
      return buildUnread({ wsRows, skuMap, uploadMap, seenMap, memberId, thirtyDaysAgo, activeWsRef, setUnread })
    }

    // ── Buyer: workspaces they are directly linked to ───────────────────────────
    // ── Supplier: workspaces they are directly linked to ────────────────────────
    const field = role === 'buyer' ? 'buyer_member_id' : 'supplier_member_id'
    const [{ data: ws }, { data: lastSeen }] = await Promise.all([
      supabase.from('npd2_workspaces')
        .select('id, buyer_ref, catalog_sku_id')
        .eq(field, memberId),
      supabase.from('workspace_last_seen')
        .select('workspace_id, seen_at')
        .eq('member_id', memberId),
    ])
    wsRows = ws || []
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

  const { data: comments } = await supabase
    .from('npd2_comments')
    .select('workspace_id, created_at')
    .in('workspace_id', wsIds)
    .gte('created_at', thirtyDaysAgo)
    .neq('author_member_id', memberId)
    .order('created_at', { ascending: false })

  const wsMap = Object.fromEntries(wsRows.map(w => [w.id, w]))
  const latestByWs = {}
  for (const c of (comments || [])) {
    if (!latestByWs[c.workspace_id]) latestByWs[c.workspace_id] = c.created_at
  }

  setUnread(
    Object.entries(latestByWs)
      .filter(([wsId, latest]) => {
        if (wsId === activeWsRef.current) return false
        const seen = seenMap[wsId]
        return !seen || latest > seen
      })
      .map(([wsId]) => {
        const ws       = wsMap[wsId]
        const sku      = skuMap[ws?.catalog_sku_id]
        const supplier = uploadMap[sku?.catalog_upload_id]?.supplier || null
        return {
          workspaceId: wsId,
          label:    ws?.buyer_ref || sku?.auto_code || 'Workspace',
          supplier,
        }
      })
      .slice(0, 5)
  )
}
