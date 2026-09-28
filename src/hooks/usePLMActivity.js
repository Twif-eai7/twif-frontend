import { useCallback, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useMemberId, useRole, useOrgId, useOrgDepartment } from '../stores/profileStore'
import { usePlmStore, mapComment } from '../stores/plmStore'
import { usePlmActivityStore } from '../stores/plmActivityStore'
import { discoverWorkspaces, fetchInChunks, fetchFilteredComments } from './plmWorkspaceDiscovery'
import { usePlmTechDeptEligible } from './usePlmTechAccess'
import { playPlmActivitySound } from '../utils/callSound'
import { attachmentPreview } from '../utils/plmAttachments'

const NINETY_DAYS_AGO = () => new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
// Backend (routes/plm.js) always inserts plain chat messages as type: 'comment' — never 'text'.
// field_change rows are individual attribute-edit system comments (e.g. brief field saves).
const COMMENT_TYPES   = ['comment', 'milestone', 'field_change']
// Per-workspace cap (not a global cross-workspace one) — a global "most recent N across every
// workspace" cap let busy workspaces crowd out quieter ones entirely, so a workspace with only
// slightly-older (but still in-range) activity could vanish from the log altogether even though
// it genuinely qualified. Capping per workspace means every qualifying workspace still shows up.
const PER_WORKSPACE_ROW_CAP = 50
const RECENT_PER_WS   = 10

export function formatTime(ts) {
  if (!ts) return ''
  const diff = Date.now() - new Date(ts).getTime()
  const m = Math.floor(diff / 60_000)
  const h = Math.floor(diff / 3_600_000)
  const d = Math.floor(diff / 86_400_000)
  if (m < 1)  return 'Just now'
  if (m < 60) return `${m}m ago`
  if (h < 24) return `${h}h ago`
  if (d < 7)  return `${d}d ago`
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

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

// Looks up SKU number/description/vendor ref + supplier name directly, ignoring the
// archived/deleted filters `discoverWorkspaces` applies for its lighter-weight callers —
// the activity log still needs to identify a workspace even if its SKU was since archived.
async function resolveSkuDetails(catalogSkuIds) {
  const ids = [...new Set(catalogSkuIds.filter(Boolean))]
  if (!ids.length) return { skuMap: {}, uploadMap: {} }

  const skuRows = await fetchInChunks('npd2_catalog_skus', 'id, auto_code, description, vendor_sku_ref, catalog_upload_id', 'id', ids)
  const skuMap = Object.fromEntries(skuRows.map(s => [s.id, s]))

  const uploadIds = [...new Set(skuRows.map(s => s.catalog_upload_id).filter(Boolean))]
  const uploads = await fetchInChunks('npd2_catalog_uploads', 'id, supplier, buyer, created_by_member_id', 'id', uploadIds)
  const uploadMap = Object.fromEntries(uploads.map(u => [u.id, u]))
  return { skuMap, uploadMap }
}

// Buyer org name isn't on the workspace row directly — resolve display_name via
// organizations for every distinct buyer_org_id in this batch of workspaces.
async function resolveBuyerOrgNames(buyerOrgIds) {
  const ids = [...new Set(buyerOrgIds.filter(Boolean))]
  if (!ids.length) return {}
  const { data } = await supabase.from('organizations').select('id, display_name, name').in('id', ids)
  return Object.fromEntries((data || []).map(o => [o.id, o.display_name || o.name || null]))
}

// Milestone events that change an image (product/buyer-brief/reference-media/sample images —
// see routes/plm.js's insertSystemComment2 call sites) log the URL in metadata, but under
// different keys depending on the event: a single-image swap uses `to` (product_image_set,
// buyer_brief_image_set/unset, reference_media_edited/replaced — `to` is null on an "unset"
// so no thumbnail shows there, correctly), while a multi-image sample upload uses `urls` or
// `added`. This is the one place that reads all of them to get a thumbnail either way.
function deriveMilestoneThumb(row) {
  if (row.type !== 'milestone') return null
  try {
    const meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata
    if (!meta) return null
    return meta.to || meta.urls?.[0] || meta.added?.[0] || null
  } catch {
    return null
  }
}

// Builds one row per workspace with qualifying activity — latest entry surfaced on
// top, plus a short recent-history slice for the drawer's expand-to-view.
function groupByWorkspace({ wsRows, skuMap, uploadMap, buyerOrgNameMap, comments, nameMap, seenMap, memberId }) {
  const wsMap  = Object.fromEntries(wsRows.map(w => [w.id, w]))
  const byWs   = {}
  for (const row of comments) {
    let entry = { ...mapComment(row), author_name: nameMap[row.author_member_id] || null }
    // A photo/file sent with no caption has an empty body — mapComment doesn't touch plain
    // 'comment' rows, so without this an attachment-only message showed a blank line here.
    // Mirrors WorkspaceModal's own reply-quote fallback (readable label + image thumbnail).
    // A rich-text ("Notes") comment's body is raw HTML, never "empty" by trim() even when it
    // has no visible text — without the format check, the literal markup (e.g. "<ul><li><img
    // src=...") rendered straight into this feed instead of readable text + thumbnail.
    if (entry.type === 'comment' && (entry.metadata?.format === 'html' || (!entry.body?.trim() && entry.attachments?.length))) {
      const preview = attachmentPreview(entry)
      entry = { ...entry, body: preview.text, thumbUrl: preview.thumbUrl }
    } else {
      const milestoneThumb = deriveMilestoneThumb(row)
      if (milestoneThumb) entry = { ...entry, thumbUrl: milestoneThumb }
    }
    ;(byWs[row.workspace_id] ||= []).push(entry)
  }

  return Object.entries(byWs)
    .map(([wsId, list]) => {
      const ws       = wsMap[wsId]
      const sku       = skuMap[ws?.catalog_sku_id]
      const upload    = uploadMap[sku?.catalog_upload_id]
      const supplier  = upload?.supplier || null
      // buyer_org_id is only set once a workspace is formally linked to a registered
      // buyer org — before/without that, fall back to the free-text buyer label the
      // merchant set at catalog-upload time (same field the SKU panel itself shows).
      const buyerOrg  = (ws?.buyer_org_id && buyerOrgNameMap[ws.buyer_org_id]) || upload?.buyer || null
      const seen      = seenMap[wsId]
      const unreadCount = list.filter(c => c.author_member_id !== memberId && (!seen || c.created_at > seen)).length

      const merchantId   = upload?.created_by_member_id || null
      const buyerId       = ws?.buyer_member_id    || null
      const supplierId    = ws?.supplier_member_id || null

      // Who actually spoke in this workspace (posted a comment/milestone/field_change),
      // as opposed to who's merely assigned/invited as its buyer/vendor/merchant contact.
      const speakerMap = new Map()
      for (const c of list) {
        if (c.author_member_id && !speakerMap.has(c.author_member_id)) {
          speakerMap.set(c.author_member_id, c.author_name || 'Unknown')
        }
      }
      const speakers   = [...speakerMap.entries()].map(([id, name]) => ({ id, name }))
      const speakerIds = [...speakerMap.keys()]

      return {
        workspaceId: wsId,
        skuCode:     sku?.auto_code || null,
        description: sku?.description || null,
        vendorRef:   sku?.vendor_sku_ref || null,
        buyerRef:    ws?.buyer_ref || null,
        buyerOrgName:    buyerOrg,
        supplierOrgName: supplier,
        status:      ws?.status || null,
        latest:      list[0],
        recent:      list.slice(0, RECENT_PER_WS),
        unreadCount,
        // Tech-only "By Contact" filter fields — the specific people, not just their org.
        merchantId,
        merchantName:   nameMap[merchantId] || null,
        buyerContactId:   buyerId,
        buyerContactName: nameMap[buyerId] || null,
        vendorContactId:   supplierId,
        vendorContactName: nameMap[supplierId] || null,
        // "By Conversation" filter fields — everyone who actually posted here.
        speakers,
        speakerIds,
        // Group Chat access — used by the activity chime to avoid ringing for group
        // messages a non-member can't see (the raw table subscription isn't role-filtered).
        wsMerchantMemberId: ws?.merchant_member_id || null,
        groupMemberIds:     ws?.group_chat_member_ids || [],
      }
    })
    .sort((a, b) => new Date(b.latest.created_at) - new Date(a.latest.created_at))
}

// Shared loader for both the drawer (usePLMActivity) and the topbar badge
// (usePLMActivityTrigger) — one source of truth for the fetch + grouping pipeline.
// timeRange: 'recent' (default, last 90 days — the fast "what's new" view) or 'all' (no date
// limit at all — the actual log, for when someone needs to check history rather than just
// recent nudges). Either way the per-workspace row cap below applies, so no workspace with
// qualifying activity ever gets silently dropped just because other workspaces were busier.
async function loadWorkspaceActivity({ memberId, role, orgId, seeAllOrgWorkspaces, timeRange = 'recent' }) {
  const [{ wsRows }, { data: lastSeen }] = await Promise.all([
    discoverWorkspaces({ memberId, role, orgId, seeAllOrgWorkspaces }),
    supabase.from('workspace_last_seen').select('workspace_id, seen_at').eq('member_id', memberId),
  ])
  const seenMap = Object.fromEntries((lastSeen || []).map(r => [r.workspace_id, r.seen_at]))
  const wsIds   = wsRows.map(w => w.id)
  if (!wsIds.length) return []

  const [allCommentRows, { skuMap, uploadMap }, buyerOrgNameMap] = await Promise.all([
    // Server-side filtered by channel/role/group-membership (POST /sku-workspaces/comments-bulk)
    // — a buyer never receives a vendor-channel or non-member group-channel comment at all.
    fetchFilteredComments(wsIds),
    resolveSkuDetails(wsRows.map(w => w.catalog_sku_id)),
    resolveBuyerOrgNames(wsRows.map(w => w.buyer_org_id)),
  ])
  const cutoff = timeRange === 'all' ? null : NINETY_DAYS_AGO()
  const commentRows = allCommentRows.filter(c => COMMENT_TYPES.includes(c.type) && (!cutoff || c.created_at >= cutoff))

  // Cap per workspace, not globally — sort each workspace's own rows newest-first and keep
  // at most PER_WORKSPACE_ROW_CAP of them, then flatten. groupByWorkspace relies on `comments`
  // arriving in descending-date order per workspace (list[0] = latest), which this preserves.
  const byWorkspace = new Map()
  for (const c of commentRows) {
    if (!byWorkspace.has(c.workspace_id)) byWorkspace.set(c.workspace_id, [])
    byWorkspace.get(c.workspace_id).push(c)
  }
  const comments = [...byWorkspace.values()].flatMap(list =>
    list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, PER_WORKSPACE_ROW_CAP)
  )

  const authorIds = [...new Set([
    ...comments.map(c => c.author_member_id),
    ...wsRows.map(w => w.buyer_member_id),
    ...wsRows.map(w => w.supplier_member_id),
    ...Object.values(uploadMap).map(u => u.created_by_member_id),
  ].filter(Boolean))]
  const nameMap    = await resolveAuthorNames(authorIds)

  return groupByWorkspace({ wsRows, skuMap, uploadMap, buyerOrgNameMap, comments, nameMap, seenMap, memberId })
}

export function usePLMActivity() {
  const drawerOpen  = usePlmActivityStore(s => s.drawerOpen)
  const loading     = usePlmActivityStore(s => s.loading)
  const workspaces  = usePlmActivityStore(s => s.workspaces)
  const searchQuery = usePlmActivityStore(s => s.searchQuery)
  const expandedId  = usePlmActivityStore(s => s.expandedId)
  const activityFilter = usePlmActivityStore(s => s.activityFilter)
  const contactFilters = usePlmActivityStore(s => s.contactFilters)
  const timeRange       = usePlmActivityStore(s => s.timeRange)
  const openDrawer      = usePlmActivityStore(s => s.openDrawer)
  const closeDrawer     = usePlmActivityStore(s => s.closeDrawer)
  const setSearch        = usePlmActivityStore(s => s.setSearch)
  const toggleExpanded   = usePlmActivityStore(s => s.toggleExpanded)
  const setWorkspaces    = usePlmActivityStore(s => s.setWorkspaces)
  const setLoading       = usePlmActivityStore(s => s.setLoading)
  const setActivityFilter = usePlmActivityStore(s => s.setActivityFilter)
  const setContactFilter  = usePlmActivityStore(s => s.setContactFilter)
  const setTimeRange      = usePlmActivityStore(s => s.setTimeRange)

  const memberId = useMemberId()
  const orgRole  = (useRole() || 'buyer').toLowerCase()
  const orgDepartment = useOrgDepartment()
  // Same department override as usePLMCatalog.js/WorkspaceModal.jsx.
  const role     = (orgRole === 'merchant' && orgDepartment === 'qa') ? 'qa' : orgRole
  const orgId    = useOrgId()
  const seeAllOrgWorkspaces = usePlmTechDeptEligible()

  const fetchActivity = useCallback(async () => {
    if (!memberId) { setWorkspaces([]); return }
    setLoading(true)
    try {
      setWorkspaces(await loadWorkspaceActivity({ memberId, role, orgId, seeAllOrgWorkspaces, timeRange }))
    } catch (err) {
      console.error('[plm-activity] fetch:', err)
    } finally {
      setLoading(false)
    }
  }, [memberId, role, orgId, seeAllOrgWorkspaces, timeRange, setWorkspaces, setLoading])

  const markWorkspaceSeen = useCallback(async (workspaceId) => {
    if (!memberId) return
    const seenAt = new Date().toISOString()
    usePlmActivityStore.getState().setWorkspaces(
      usePlmActivityStore.getState().workspaces.map(w => w.workspaceId === workspaceId ? { ...w, unreadCount: 0 } : w)
    )
    const { error } = await supabase
      .from('workspace_last_seen')
      .upsert({ member_id: memberId, workspace_id: workspaceId, seen_at: seenAt }, { onConflict: 'member_id,workspace_id' })
    if (error) console.error('[plm-activity] markSeen upsert failed:', error.message)
  }, [memberId])

  const markAllSeen = useCallback(async () => {
    if (!memberId || !workspaces.length) return
    const seenAt = new Date().toISOString()
    const rows = workspaces.map(w => ({ member_id: memberId, workspace_id: w.workspaceId, seen_at: seenAt }))
    setWorkspaces(workspaces.map(w => ({ ...w, unreadCount: 0 })))
    const { error } = await supabase
      .from('workspace_last_seen')
      .upsert(rows, { onConflict: 'member_id,workspace_id' })
    if (error) console.error('[plm-activity] markAllSeen upsert failed:', error.message)
  }, [memberId, workspaces, setWorkspaces])

  // Leaves the drawer open in the background (below the workspace modal's z-index)
  // instead of closing it — user asked to only close via the X button or clicking
  // outside the drawer, not implicitly on every row click.
  const openWorkspaceFromDrawer = useCallback((workspaceId) => {
    // Local-only optimistic badge clear for the drawer list — NOT a DB write. The real
    // workspace_last_seen write now happens inside openWorkspace itself, AFTER it fetches
    // comments (each one carrying a server-computed is_unread flag read against the
    // still-un-bumped cutoff, see routes/plm.js). Writing it here first, before that read,
    // would corrupt the very value that read depends on — the bug this replaced.
    usePlmActivityStore.getState().setWorkspaces(
      usePlmActivityStore.getState().workspaces.map(w => w.workspaceId === workspaceId ? { ...w, unreadCount: 0 } : w)
    )
    usePlmStore.getState().openWorkspace(workspaceId)
  }, [])

  // Fetch + 30s poll while drawer is open
  useEffect(() => {
    if (!drawerOpen) return
    fetchActivity()
    const id = setInterval(fetchActivity, 30_000)
    return () => clearInterval(id)
  }, [drawerOpen, fetchActivity])

  // Realtime refresh on any new comment (same channel pattern as the floating dock)
  useEffect(() => {
    if (!memberId) return
    const channel = supabase
      .channel('plm-activity-drawer')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'npd2_comments' },
        () => { if (usePlmActivityStore.getState().drawerOpen) fetchActivity() }
      )
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [memberId, fetchActivity])

  // Contact/conversation + search narrow the base pool everything else (the type filter AND
  // the sidebar's Overview/By Type counts) operates on — so picking "Dharinie Mittal" scopes
  // "Messages: 42" down to just her messages, not the org-wide total. The activity-type filter
  // itself is applied afterwards, separately, so switching between type tabs while a person is
  // selected keeps showing that person's counts per tab rather than collapsing to one number.
  const scopedWorkspaces = useMemo(() => {
    let list = workspaces
    if (contactFilters.merchant) list = list.filter(w => w.merchantId === contactFilters.merchant)
    if (contactFilters.buyer)    list = list.filter(w => w.buyerContactId === contactFilters.buyer)
    if (contactFilters.vendor)   list = list.filter(w => w.vendorContactId === contactFilters.vendor)
    if (contactFilters.conversation) list = list.filter(w => w.speakerIds.includes(contactFilters.conversation))

    if (!searchQuery) return list
    const q = searchQuery.toLowerCase()
    return list.filter(w =>
      [w.skuCode, w.description, w.vendorRef, w.buyerRef, w.buyerOrgName, w.supplierOrgName, w.latest?.author_name, w.latest?.body]
        .filter(Boolean).join(' ').toLowerCase().includes(q)
    )
  }, [workspaces, searchQuery, contactFilters])

  const filtered = useMemo(() => {
    let list = scopedWorkspaces
    if (activityFilter === 'unread')    list = list.filter(w => w.unreadCount > 0)
    else if (activityFilter === 'read') list = list.filter(w => w.unreadCount === 0)
    else if (activityFilter === 'message')     list = list.filter(w => w.latest?.type === 'comment')
    else if (activityFilter === 'milestone')   list = list.filter(w => w.latest?.type === 'milestone')
    else if (activityFilter === 'field_change') list = list.filter(w => w.latest?.type === 'field_change')
    return list
  }, [scopedWorkspaces, activityFilter])

  // Distinct {id, name} options for the "By Contact" dropdowns — tech-only, built from
  // whatever's currently loaded rather than a separate query, sorted for a stable list.
  const contactOptions = useMemo(() => {
    const build = (idKey, nameKey) => {
      const seen = new Map()
      for (const w of workspaces) {
        const id = w[idKey]
        if (id && !seen.has(id)) seen.set(id, w[nameKey] || 'Unknown')
      }
      return [...seen.entries()]
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name))
    }
    // "By Conversation" options come from actual speakers (one member can post across many
    // workspaces), not from a single id field per workspace like the other three — dedupe
    // across every workspace's `speakers` list instead of a single build(idKey, nameKey) call.
    const conversationSeen = new Map()
    for (const w of workspaces) {
      for (const sp of w.speakers || []) {
        if (!conversationSeen.has(sp.id)) conversationSeen.set(sp.id, sp.name || 'Unknown')
      }
    }
    const conversation = [...conversationSeen.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))

    return {
      merchant: build('merchantId', 'merchantName'),
      buyer:    build('buyerContactId', 'buyerContactName'),
      vendor:   build('vendorContactId', 'vendorContactName'),
      conversation,
    }
  }, [workspaces])

  const counts = useMemo(() => ({
    all:       scopedWorkspaces.length,
    unread:    scopedWorkspaces.filter(w => w.unreadCount > 0).length,
    read:      scopedWorkspaces.filter(w => w.unreadCount === 0).length,
    message:     scopedWorkspaces.filter(w => w.latest?.type === 'comment').length,
    milestone:   scopedWorkspaces.filter(w => w.latest?.type === 'milestone').length,
    field_change: scopedWorkspaces.filter(w => w.latest?.type === 'field_change').length,
  }), [scopedWorkspaces])

  const unreadTotal = useMemo(() => workspaces.reduce((sum, w) => sum + w.unreadCount, 0), [workspaces])

  return {
    workspaces: filtered,
    loading,
    drawerOpen,
    searchQuery,
    expandedId,
    activityFilter,
    counts,
    // Grand total across every workspace the viewer can see, ignoring every filter — the
    // sidebar's counts (via `counts`) already reflect the current contact/conversation
    // selection + search, so the drawer header needs this separately for its "X of Y" readout.
    totalWorkspaces: workspaces.length,
    unreadTotal,
    openDrawer,
    closeDrawer,
    setSearch,
    setActivityFilter,
    toggleExpanded,
    markWorkspaceSeen,
    markAllSeen,
    openWorkspaceFromDrawer,
    // "By Contact" filtering — shown to any merchant, scoped to whatever workspaces they can
    // already see (their own + peer-shared for a regular merchant, org-wide for tech dept) —
    // contactOptions is built from `workspaces` above, which is already scoped per-viewer.
    contactFilters,
    setContactFilter,
    contactOptions,
    canFilterByContact: role === 'merchant',
    // 'recent' (default, last 90 days) or 'all' (the actual log — full history, no date/row limit).
    timeRange,
    setTimeRange,
  }
}

// Lightweight hook for the topbar trigger badge — fetches once on mount without
// requiring the drawer to be open (mirrors useAlertsTrigger's pattern).
export function usePLMActivityTrigger() {
  const memberId = useMemberId()
  const orgRole  = (useRole() || 'buyer').toLowerCase()
  const orgDepartment = useOrgDepartment()
  // Same department override as usePLMCatalog.js/WorkspaceModal.jsx.
  const role     = (orgRole === 'merchant' && orgDepartment === 'qa') ? 'qa' : orgRole
  const orgId    = useOrgId()
  const seeAllOrgWorkspaces = usePlmTechDeptEligible()
  const openDrawer   = usePlmActivityStore(s => s.openDrawer)
  const workspaces   = usePlmActivityStore(s => s.workspaces)
  const setWorkspaces = usePlmActivityStore(s => s.setWorkspaces)

  const refresh = useCallback(async () => {
    if (!memberId) return
    const list = await loadWorkspaceActivity({ memberId, role, orgId, seeAllOrgWorkspaces })
    setWorkspaces(list)
  }, [memberId, role, orgId, seeAllOrgWorkspaces, setWorkspaces])

  useEffect(() => {
    if (!memberId) return
    let cancelled = false
    loadWorkspaceActivity({ memberId, role, orgId, seeAllOrgWorkspaces }).then(list => {
      if (cancelled) return
      setWorkspaces(list)
    })
    return () => { cancelled = true }
  }, [memberId, role, orgId, seeAllOrgWorkspaces])

  // Realtime push (not a poll) so the chime + badge update even while the tab is
  // backgrounded/minimized — browsers throttle timers in background tabs but keep
  // websocket callbacks like this one firing.
  //
  // The chime decision is read straight off the inserted row in the push payload, not off
  // a before/after diff of the org-wide unread total — that total is shared across every
  // member's concurrent reads/marks-as-seen, so on a busy org it can swing either direction
  // for reasons that have nothing to do with this particular row (verified live: total went
  // 436 -> 435 on a message that should have raised it). The payload itself is unambiguous:
  // whether this row is a real chat message and whether I wrote it.
  useEffect(() => {
    if (!memberId) return
    const channel = supabase
      .channel('plm-activity-trigger')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'npd2_comments' }, (payload) => {
        const row = payload.new
        if (row && row.type === 'comment' && row.author_member_id !== memberId) {
          // Group-chat messages must only chime for someone actually in that group (or its
          // merchant) — this raw table subscription isn't role/channel-filtered like the fetch.
          let okToChime = true
          if (row.channel === 'group') {
            const w = usePlmActivityStore.getState().workspaces.find(x => x.workspaceId === row.workspace_id)
            okToChime = !!w && (w.wsMerchantMemberId === memberId || (w.groupMemberIds || []).includes(memberId))
          }
          if (okToChime) playPlmActivitySound()
        }
        // The comments read endpoint can briefly lag the write that triggered this push
        // (backend hop / cache) — delay the badge/list refresh slightly so it reliably
        // includes the row that just landed, instead of racing it.
        setTimeout(refresh, 900)
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [memberId, refresh])

  const unreadTotal = useMemo(() => workspaces.reduce((sum, w) => sum + w.unreadCount, 0), [workspaces])
  return { unreadTotal, openDrawer }
}
