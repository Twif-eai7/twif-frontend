import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { useAuthStore } from './authStore'
import { useProfileStore } from './profileStore'
import { supabase } from '../lib/supabase'
import { playIncomingCallSound } from '../utils/callSound'


function parseCommentMeta(metadata) {
  if (!metadata) return {}
  if (typeof metadata === 'string') {
    try { return JSON.parse(metadata) } catch { return {} }
  }
  return metadata
}

const API_BASE = import.meta.env.VITE_BACKEND_URL

const chunkArray = (arr, size) => Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size))

async function fetchAllRows(buildQuery) {
  const PAGE = 1000
  let from = 0, all = []
  while (true) {
    const { data, error } = await buildQuery(from, from + PAGE - 1)
    if (error) break
    all = all.concat(data || [])
    if ((data || []).length < PAGE) break
    from += PAGE
  }
  return all
}

// Attaches the price frozen on each workspace's sample order (approved_price/approved_currency)
// at "Proceed to Sample" time — the same fields the workspace's Confirmed Details panel shows —
// so catalog cards can display it without opening the workspace. Mutates the objects in place;
// each entry just needs an `id` matching a npd2_workspaces.id.
const attachApprovedPrices = async (workspacesById) => {
  const wsIds = Object.values(workspacesById).map(w => w.id).filter(Boolean)
  if (!wsIds.length) return
  const { data: soRows } = await supabase
    .from('npd2_sample_orders')
    .select('workspace_id, confirmed_price, currency, created_at')
    .in('workspace_id', wsIds)
    .order('created_at', { ascending: false })
  const soByWs = {}
  for (const so of (soRows || [])) if (!soByWs[so.workspace_id]) soByWs[so.workspace_id] = so
  for (const w of Object.values(workspacesById)) {
    const so = soByWs[w.id]
    w.approved_price    = so?.confirmed_price ?? null
    w.approved_currency = so?.currency        ?? null
  }
}

const fetchWorkspaceMap = async (skuIds) => {
  if (!skuIds.length) return {}
  const WS_SELECT = 'catalog_sku_id, id, status, buyer_ref, buyer_brief, buyer_email, buyer_member_id, buyer_org_id, origin, reference_media, supplier_member_id, supplier_email'
  const chunks = chunkArray(skuIds, 100)
  const results = await Promise.all(
    chunks.map(chunk =>
      supabase.from('npd2_workspaces').select(WS_SELECT).in('catalog_sku_id', chunk).order('created_at', { ascending: false })
    )
  )
  const wsMap = {}
  for (const { data } of results)
    for (const w of (data || []))
      if (!wsMap[w.catalog_sku_id]) wsMap[w.catalog_sku_id] = w
  await attachApprovedPrices(wsMap)
  return wsMap
}

const api = async (method, path, body, formData, signal) => {
  const session = useAuthStore.getState().session
  const headers = formData
    ? { Authorization: `Bearer ${session?.access_token}` }
    : { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` }
  const res = await fetch(`${API_BASE}/plm${path}`, {
    method,
    headers,
    signal,
    body: formData ? formData : body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
  return json
}

// fetch() has no upload-progress event, so file uploads use XHR instead —
// onProgress receives real bytes-sent/bytes-total as the request body streams out.
const apiUpload = (path, formData, onProgress) => new Promise((resolve, reject) => {
  const session = useAuthStore.getState().session
  const xhr = new XMLHttpRequest()
  xhr.open('POST', `${API_BASE}/plm${path}`)
  xhr.setRequestHeader('Authorization', `Bearer ${session?.access_token}`)
  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable && onProgress) onProgress(e.loaded, e.total)
  }
  xhr.onload = () => {
    let json = {}
    try { json = JSON.parse(xhr.responseText) } catch { /* ignored */ }
    if (xhr.status >= 200 && xhr.status < 300) resolve(json)
    else reject(new Error(json.error || `HTTP ${xhr.status}`))
  }
  xhr.onerror = () => reject(new Error('Network error'))
  xhr.send(formData)
})

const FIELD_LABELS = {
  l: 'length', w: 'width', h: 'height',
  weight: 'weight', material: 'material', finish: 'finish',
  description: 'description', unit_price: 'target price',
  unit_qty: 'unit qty', quality_notes: 'quality notes',
  buyer_ref: 'buyer reference', color: 'color',
  target_ready_date: 'target ready date',
  actual_ready_date: 'actual ready date',
  additional_notes:  'additional notes',
  dispatch_date:     'dispatch date',
  ship_mode:         'ship mode',
  tracking_ref:      'tracking reference',
  etd:               'ETD',
  eta:               'ETA',
  actual_weight:         'actual weight',
  actual_dims:           'Actual L×W×H',
  inner_qty:             'inner qty',
  inner_dims:            'Inner L×W×H',
  master_qty:            'master qty',
  master_dims:           'Master L×W×H',
  master_pack_weight_kg: 'master weight',
  cbm:                   'CBM (m³)',
}

const MILESTONE_LABELS = {
  approved_to_sample: 'Proceeded to Sample',
  sample_in_process:  'Sample In Process',
  sample_ready:       'Sample Ready',
  sample_on_hold:     'Sample On Hold',
  sample_dropped:     'Sample Dropped',
  findings_updated:   'Sample Findings Updated',
  sample_images_updated:   'Sample Images Updated',
  production_image_set:    'Production Image Set',
  production_image_unset:  'Production Image Unset',
  revision_requested: 'Revision Requested',
  sample_accepted:    'Sample Accepted',
  sample_rejected:    'Sample Rejected',
  video_call_started: 'Video call started',
  video_call_invited: 'Invited to join video call',
  video_call_ended:   'Video call ended',
  status_changed_to_on_hold:  'Workspace On Hold',
  status_changed_to_rejected: 'Workspace Rejected',
  status_changed_to_active:   'Workspace Resumed',
  status_changed_to_approved: 'Workspace Approved',
}

function mapComment(row) {
  let body = row.body
  if (row.type === 'field_change') {
    try {
      const meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata
      if (meta) {
        const label   = FIELD_LABELS[meta.field] || meta.field
        const hasFrom = meta.from != null && String(meta.from).trim() !== ''
        body = hasFrom
          ? `set ${label} to "${meta.to}" from "${meta.from}"`
          : `set ${label} to "${meta.to}"`
      }
    } catch { /* ignored */ }
  } else if (row.type === 'milestone' && !body) {
    try {
      const meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata
      if (meta?.event) {
        body = MILESTONE_LABELS[meta.event] || meta.event
        if (meta.note?.trim()) body += ` — "${meta.note.trim()}"`
      }
    } catch { /* ignored */ }
  }

  let quoted = null, quoted_author = null, quoted_id = null, quoted_thumb = null
  if (row.reply_to) {
    try {
      const rt = typeof row.reply_to === 'string' ? JSON.parse(row.reply_to) : row.reply_to
      quoted        = rt?.body        || null
      quoted_author = rt?.author_name || rt?.role || null
      quoted_id     = rt?.id          || null
      quoted_thumb  = rt?.quoted_thumb || null
    } catch { /* ignored */ }
  }

  return { ...row, body, quoted, quoted_author, quoted_id, quoted_thumb }
}

// Fetch comments of `type` for a workspace, returning only ones not already in
// `knownIds` (a snapshot taken BEFORE the mutating call that triggered them). Diffs
// by ID rather than a client timestamp, so DB/browser clock drift can never cause a
// just-inserted comment to be silently excluded and missed from the activity feed.
async function fetchNewComments(workspaceId, types, knownIds, nameMap) {
  let query = supabase
    .from('npd2_comments').select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: true })
  query = Array.isArray(types) ? query.in('type', types) : query.eq('type', types)
  const { data } = await query
  return (data || [])
    .filter(c => !knownIds.has(c.id))
    .map(r => ({ ...mapComment(r), author_name: nameMap[r.author_member_id] || null }))
}

function mapSkuRows(data) {
  return data.map(row => ({
    id:          row.id,
    auto_code:   row.auto_code,
    image_url:        row.image_url,
    image_processing: row.image_processing || false,
    slide_index: row.slide_index,
    description: row.description,
    category:    row.category || row.npd2_catalog_uploads?.category,
    material:    row.material,
    finish:      row.finish,
    weight:      row.weight || row.weight_kg || null,
    length:      row.length      ?? null,
    width:       row.width       ?? null,
    height:      row.height      ?? null,
    dimensions:  row.dimensions  || null,
    measurement:       row.measurement || 'cm',
    category_id:       row.category_id       || null,
    production_sku_id: row.production_sku_id || null,
    buyer_sku_ref:     row.skus?.buyer_sku_ref || null,
    supplier:              row.npd2_catalog_uploads?.supplier,
    supplier_org_id:       row.npd2_catalog_uploads?.supplier_org_id,
    season:                row.npd2_catalog_uploads?.season,
    created_by_member_id:  row.npd2_catalog_uploads?.created_by_member_id || null,
    upload_buyer_org_id:   row.npd2_catalog_uploads?.for_buyer_org_id    || null,
    upload_buyer_org_name: row.npd2_catalog_uploads?.buyer               || null,
    sku_source:            row.npd2_catalog_uploads?.sku_source          || null,
    created_at:            row.created_at,
    vendor_sku_ref:        row.vendor_sku_ref || null,
    temp_sku_ref:          row.temp_sku_ref   || null,
    buyer_ref_status:      (!row.production_sku_id && row.temp_sku_ref) ? 'pending_buyer_ref' : null,
    sort_position:         row.sort_position ?? null,
  }))
}

// memberIds → { id: displayName } — used to label the "Member" filter with a
// real name instead of falling back to "Unknown Member".
async function fetchMemberNameMap(memberIds) {
  const ids = [...new Set((memberIds || []).filter(Boolean))]
  if (!ids.length) return {}
  const { data: mRows } = await supabase
    .from('organization_members')
    .select('id, full_name, email, organizations(name, display_name)')
    .in('id', ids)
  return Object.fromEntries(
    (mRows || []).map(m => {
      const orgName = m.organizations?.display_name || m.organizations?.name || null
      return [m.id, m.full_name || m.email || orgName || null]
    })
  )
}

export const CAT_DEFS = [
  { val: 'all',          label: 'All Products'  },
  { val: 'Accessories',  label: 'Accessories'   },
  { val: 'Furniture',    label: 'Furniture'     },
  { val: 'Home Decor',   label: 'Home Decor'    },
  { val: 'Home textiles',label: 'Home Textiles' },
]

export const SEASONS = ['OLD', 'SS25', 'AW25', 'SS26', 'AW26', 'SS27','AW27', 'SS28', 'AW28']

export const STATUS_LABELS = {
  new:               'New',
  active:            'Active',
  inactive:          'Inactive',
  invited:           'Invited',
  reviewing:         'Reviewing',
  approved:          'Approved',
  sample:            'Sample Stage',
  production:        'Approved to PO',
  on_hold:           'On Hold',
  rejected:          'Rejected',
  to_do:             'To Do',
  in_progress:       'In Progress',
  complete:          'Complete',
  pending_buyer_ref: 'Pending Buyer Ref',
  production_sku:    'Production SKU',
}

// Single source of truth for workspace-status badge colors — shared by SKUStatusBadge
// (SKU cards) and WorkspaceModal's header StatusBadge, so a status reads the same everywhere.
export const STATUS_COLORS = {
  active:      'bg-[#DCF5F2] text-[#0E6655]',    // teal    — workspace open
  inactive:    'bg-[#787878] text-white',        // grey    — inactive
  invited:     'bg-[#FFF3DC] text-[#8C5A00]',    // amber   — supplier pending
  reviewing:   'bg-[#EDE9FF] text-[#4A1FA8]',    // purple  — under review
  approved:    'bg-[#E6F2DC] text-[#2D6A1F]',    // green   — approved
  sample:      'bg-[#D0E8FF] text-[#0B4F8A]',    // blue    — sample stage
  production:  'bg-[#2D6A1F] text-white',        // solid dark green — approved to PO
  on_hold:     'bg-[#FFE8D0] text-[#8C3A00]',    // orange  — paused
  rejected:    'bg-[#FCEAEA] text-[#7A1A1A]',    // red     — rejected
  dropped:     'bg-[#FCEAEA] text-[#7A1A1A]',    // red     — sample dropped
  to_do:       'bg-black/[.07] text-[#1A1A18]',  // grey    — not started
  in_progress: 'bg-[#E0EAFF] text-[#1A3A8A]',    // indigo  — in progress
  complete:    'bg-[#C8EDD8] text-[#0A5C35]',    // emerald — done
}

export function getCategoryDescendantIds(categories, id) {
  const result = new Set([id])
  const queue  = [id]
  while (queue.length) {
    const cur = queue.shift()
    categories.filter(c => c.parent_id === cur).forEach(c => { result.add(c.id); queue.push(c.id) })
  }
  return result
}

export const usePlmStore = create(
  devtools(
    (set, get) => ({
      // ── Data ──────────────────────────────────────────────────────────────────
      skus:       [],
      categories: [],
      loading:    true,
      error:      null,
      memberId:   null,
      customerId: null,
      role:       null,

      // ── Filters ───────────────────────────────────────────────────────────────
      filters: { season: 'all', category: 'all', buyer: 'all', supplier: 'all', status: 'all', member: 'all', search: '', sort: 'all', buyerContact: 'all', supplierContact: 'all' },

      // ── UI ────────────────────────────────────────────────────────────────────
      sidebarCollapsed:  localStorage.getItem('plm_aside_collapsed') === 'true',
      toastMsg:          null,
      selectedIds:       new Set(),
      activeSku:         null,   // SKU shown in the workspace panel
      activeWorkspaceId: null,
      activeWorkspace:   null,
      workspaceLoading:  false,
      _realtimeChannel:  null,
      _catalogChannel:   null,
      _fetchCallId:      0,
      _memberNameMap:    {},   // memberId → display name
      incomingVideoCall: null, // { workspaceId, startedBy, startedByName, isInvite }
      activeVideoCall:   null, // { workspaceId, roomUrl, token }
      videoCallConnecting: null, // workspaceId while POST in flight

      // ── Fetch catalog ─────────────────────────────────────────────────────────
      fetchCatalog: async (memberId, customerId, role) => {
        const callId = (get()._fetchCallId || 0) + 1
        const prevChannel = get()._catalogChannel
        if (prevChannel) supabase.removeChannel(prevChannel)
        set({ loading: true, error: null, memberId, customerId, role, _fetchCallId: callId, _catalogChannel: null }, false, 'plm/fetchStart')
        try {
          let skus = []

          if (role === 'merchant') {
            // Layer 1: own uploads + supplier public catalogs + peer access lookups
            const SKU_SELECT = '*, npd2_catalog_uploads!inner ( id, supplier, buyer, supplier_org_id, season, category, created_by_member_id, for_buyer_org_id, sku_source ), skus ( buyer_sku_ref )'
            const [
              { data: ownData,      error: dbErr },
              { data: supplierData },
              { data: pairRows },
              { data: explicitRows },
            ] = await Promise.all([
              supabase.from('npd2_catalog_skus')
                .select(SKU_SELECT)
                .eq('npd2_catalog_uploads.created_by_member_id', memberId)
                .eq('is_archived', false).is('delete_meta', null)
                .order('created_at', { ascending: false }),
              supabase.from('npd2_catalog_skus')
                .select(SKU_SELECT)
                .is('npd2_catalog_uploads.created_by_member_id', null)
                .not('npd2_catalog_uploads.supplier_org_id', 'is', null)
                .eq('is_archived', false).is('delete_meta', null)
                .order('created_at', { ascending: false }),
              // Standing peer pairs where this member is the grantee
              supabase.from('merchant_access_pairs')
                .select('grantor_member_id')
                .eq('grantee_member_id', memberId),
              // Explicit one-off catalog shares granted to this member
              supabase.from('npd2_catalog_access')
                .select('catalog_upload_id')
                .eq('member_id', memberId),
            ])

            if (dbErr) throw dbErr

            // Layer 2: fetch SKUs for peer pairs and explicit shares (if any)
            const grantorIds    = (pairRows    || []).map(r => r.grantor_member_id).filter(Boolean)
            const sharedUploadIds = (explicitRows || []).map(r => r.catalog_upload_id).filter(Boolean)

            const [{ data: pairSkuData }, { data: explicitSkuData }] = await Promise.all([
              grantorIds.length
                ? supabase.from('npd2_catalog_skus')
                    .select(SKU_SELECT)
                    .in('npd2_catalog_uploads.created_by_member_id', grantorIds)
                    .eq('is_archived', false).is('delete_meta', null)
                    .order('created_at', { ascending: false })
                : Promise.resolve({ data: [] }),
              sharedUploadIds.length
                ? supabase.from('npd2_catalog_skus')
                    .select(SKU_SELECT)
                    .in('npd2_catalog_uploads.id', sharedUploadIds)
                    .eq('is_archived', false).is('delete_meta', null)
                    .order('created_at', { ascending: false })
                : Promise.resolve({ data: [] }),
            ])

            // Merge all sources, deduplicate by SKU id; peer/explicit = full access (no is_read_only)
            const seenIds = new Set()
            const merged = []
            for (const row of [
              ...(ownData         || []),
              ...(supplierData    || []),
              ...(pairSkuData     || []),
              ...(explicitSkuData || []),
            ]) {
              if (!seenIds.has(row.id)) { seenIds.add(row.id); merged.push(row) }
            }
            const rawSkus = mapSkuRows(merged)

            // Admin/owner: read-only view of all merchandising members' SKUs
            const membership = useProfileStore.getState().orgMembership
            const isAdmin = membership?.role === 'admin' || membership?.role === 'owner'
            let adminViewSkus = []
            if (isAdmin && membership?.orgId) {
              const { data: merchMembers } = await supabase
                .from('organization_members')
                .select('id')
                .eq('organization_id', membership.orgId)
                .eq('department', 'merchandising')
                .neq('id', memberId)
              const merchIds = (merchMembers || []).map(m => m.id).filter(Boolean)
              if (merchIds.length) {
                const adminSkuData = await fetchAllRows((from, to) =>
                  supabase.from('npd2_catalog_skus')
                    .select('*, npd2_catalog_uploads!inner ( id, supplier, buyer, supplier_org_id, season, category, created_by_member_id, for_buyer_org_id, sku_source ), skus ( buyer_sku_ref )')
                    .filter('npd2_catalog_uploads.created_by_member_id', 'in', `(${merchIds.join(',')})`)
                    .eq('is_archived', false)
                    .is('delete_meta', null)
                    .order('created_at', { ascending: false })
                    .range(from, to)
                )
                adminViewSkus = mapSkuRows(adminSkuData)
                  .filter(s => !seenIds.has(s.id))
                  .map(s => ({ ...s, is_read_only: true }))
              }
            }

            const allRawSkus = [...rawSkus, ...adminViewSkus]

            const memberIds = [...new Set(allRawSkus.map(s => s.created_by_member_id).filter(Boolean))]
            const skuIds = allRawSkus.map(s => s.id)

            const [memberNameMap, wsMap] = await Promise.all([
              (async () => {
                if (!memberIds.length) return {}
                const { data: mRows } = await supabase
                  .from('organization_members')
                  .select('id, full_name, email, organizations(name, display_name)')
                  .in('id', memberIds)
                return Object.fromEntries(
                  (mRows || []).map(m => {
                    const orgName = m.organizations?.display_name || m.organizations?.name || null
                    return [m.id, m.full_name || m.email || orgName || null]
                  })
                )
              })(),
              fetchWorkspaceMap(skuIds),
            ])

            const wsList = Object.values(wsMap)

            const allBuyerOrgIds    = [...new Set(wsList.map(w => w.buyer_org_id).filter(Boolean))]
            // Emails from workspaces where buyer_member_id is null — need name lookup by email
            const emailsWithoutMemberId = [...new Set(
              wsList.filter(w => w.buyer_org_id && !w.buyer_member_id && w.buyer_email).map(w => w.buyer_email)
            )]

            // Fetch org names
            let buyerOrgNameMap = {}
            if (allBuyerOrgIds.length) {
              const { data: orgRows } = await supabase
                .from('organizations')
                .select('id, display_name, name')
                .in('id', allBuyerOrgIds)
              buyerOrgNameMap = Object.fromEntries((orgRows || []).map(o => [o.id, o.display_name || o.name]))
            }

            // Fetch all accepted invites per workspace (captures secondary buyers + vendors)
            const allWsIds = [...new Set(wsList.map(w => w.id).filter(Boolean))]
            let wsAcceptedBuyerIds = {}, wsAcceptedSupplierIds = {}, inviteEmailById = {}
            if (allWsIds.length) {
              const invChunks = chunkArray(allWsIds, 100)
              const invResults = await Promise.all(
                invChunks.map(chunk =>
                  supabase.from('npd2_invites').select('workspace_id, member_id, role, email')
                    .in('workspace_id', chunk).eq('status', 'accepted').not('member_id', 'is', null)
                )
              )
              for (const { data } of invResults)
                for (const row of (data || [])) {
                  inviteEmailById[row.member_id] = inviteEmailById[row.member_id] || row.email
                  const isBuyer = row.role === 'buyer'
                  const map = isBuyer ? wsAcceptedBuyerIds : wsAcceptedSupplierIds
                  if (!map[row.workspace_id]) map[row.workspace_id] = []
                  if (!map[row.workspace_id].includes(row.member_id)) map[row.workspace_id].push(row.member_id)
                }
            }

            const allBuyerMemberIds = [...new Set([
              ...wsList.map(w => w.buyer_member_id).filter(Boolean),
              ...Object.values(wsAcceptedBuyerIds).flat(),
            ])]
            const allSupplierMemberIds = [...new Set([
              ...wsList.map(w => w.supplier_member_id).filter(Boolean),
              ...Object.values(wsAcceptedSupplierIds).flat(),
            ])]

            let buyerNameById = {}, buyerNameByEmail = {}, supplierNameById = {}
            await Promise.all([
              allBuyerMemberIds.length
                ? supabase.from('organization_members').select('id, full_name').in('id', allBuyerMemberIds)
                    .then(({ data }) => {
                      buyerNameById = Object.fromEntries((data || []).map(m => [m.id, m.full_name || null]))
                    })
                : Promise.resolve(),
              emailsWithoutMemberId.length && allBuyerOrgIds.length
                ? supabase.from('organization_members').select('email, full_name').in('organization_id', allBuyerOrgIds).in('email', emailsWithoutMemberId)
                    .then(({ data }) => {
                      buyerNameByEmail = Object.fromEntries((data || []).map(m => [m.email, m.full_name || null]))
                    })
                : Promise.resolve(),
              allSupplierMemberIds.length
                ? supabase.from('organization_members').select('id, full_name').in('id', allSupplierMemberIds)
                    .then(({ data }) => {
                      supplierNameById = Object.fromEntries((data || []).map(m => [m.id, m.full_name || null]))
                    })
                : Promise.resolve(),
            ])

            skus = allRawSkus.map(s => {
              const ws = wsMap[s.id]
              const buyerName = ws?.buyer_member_id
                ? (buyerNameById[ws.buyer_member_id] || null)
                : (ws?.buyer_email ? (buyerNameByEmail[ws.buyer_email] || null) : null)
              const supplierName = ws?.supplier_member_id
                ? (supplierNameById[ws.supplier_member_id] || ws?.supplier_email || null)
                : (ws?.supplier_email || null)
              const acceptedBuyerIds    = ws?.id ? (wsAcceptedBuyerIds[ws.id]    || []) : []
              const acceptedSupplierIds = ws?.id ? (wsAcceptedSupplierIds[ws.id] || []) : []
              const extraBuyerNames    = acceptedBuyerIds.filter(id => id !== ws?.buyer_member_id)
                .map(id => buyerNameById[id] || inviteEmailById[id] || null).filter(Boolean)
              const extraSupplierNames = acceptedSupplierIds.filter(id => id !== ws?.supplier_member_id)
                .map(id => supplierNameById[id] || inviteEmailById[id] || null).filter(Boolean)
              // Historical data safety net: some npd2_workspaces rows were left with a null
              // status/buyer_email by a since-fixed backend accept-flow bug (co-buyer joins used
              // to reset status). If an accepted buyer invite exists but the workspace row itself
              // is blank, fall back so the grid doesn't show it as "inactive". Note: this only
              // ever derives 'active', never a further stage — a workspace nulled out after
              // reaching approved/sample would under-report here as merely active.
              const hasAcceptedBuyer = !!(ws?.buyer_member_id || acceptedBuyerIds.length)
              const derivedStatus = ws?.status || (ws?.id && hasAcceptedBuyer ? 'active' : null)
              const derivedBuyerEmail = ws?.buyer_email || (acceptedBuyerIds.length ? inviteEmailById[acceptedBuyerIds[0]] : null)
              return {
                ...s,
                created_by_member_name: memberNameMap[s.created_by_member_id] || null,
                workspace_id:     ws?.id         || null,
                workspace_status: derivedStatus,
                buyer_ref:        ws?.buyer_ref   || null,
                buyer_brief:      ws?.buyer_brief || null,
                buyer_email:      derivedBuyerEmail,
                buyer_org_id:          ws?.buyer_org_id || null,
                buyer_org_name:        ws?.buyer_org_id ? (buyerOrgNameMap[ws.buyer_org_id] || null) : null,
                buyer_name:            buyerName,
                extra_buyer_names:     extraBuyerNames,
                supplier_name:         supplierName,
                extra_supplier_names:  extraSupplierNames,
                supplier_email:        ws?.supplier_email || null,
                approved_price:        ws?.approved_price    ?? null,
                approved_currency:     ws?.approved_currency ?? null,
              }
            })
          } else if (role === 'buyer') {
            const [{ data: ws, error: wsErr }, { data: secondaryInvites }] = await Promise.all([
              supabase.from('npd2_workspaces')
                .select('catalog_sku_id, id, status, supplier_org_id, buyer_ref, buyer_brief, created_at, origin, reference_media')
                .eq('buyer_member_id', memberId),
              supabase.from('npd2_invites')
                .select('workspace_id')
                .eq('member_id', memberId)
                .eq('role', 'buyer')
                .eq('status', 'accepted'),
            ])

            if (wsErr) throw wsErr

            // Secondary buyer: fetch workspaces linked via accepted invite rows
            const secondaryWsIds = (secondaryInvites || []).map(i => i.workspace_id).filter(Boolean)
            let secondaryWsData = []
            if (secondaryWsIds.length) {
              const { data: secWs } = await supabase.from('npd2_workspaces')
                .select('catalog_sku_id, id, status, supplier_org_id, buyer_ref, buyer_brief, created_at, origin, reference_media')
                .in('id', secondaryWsIds)
              secondaryWsData = secWs || []
            }

            const workspaceMap = {}
            for (const w of [...(ws || []), ...secondaryWsData])
              if (!workspaceMap[w.catalog_sku_id]) workspaceMap[w.catalog_sku_id] = { id: w.id, status: w.status, supplier_org_id: w.supplier_org_id, buyer_ref: w.buyer_ref, buyer_brief: w.buyer_brief, created_at: w.created_at }
            await attachApprovedPrices(workspaceMap)

            const ids = Object.keys(workspaceMap).filter(Boolean)
            if (ids.length) {
              const { data, error: dbErr } = await supabase
                .from('npd2_catalog_skus')
                .select('*, npd2_catalog_uploads!inner ( id, supplier, buyer, supplier_org_id, season, category, created_by_member_id, for_buyer_org_id, sku_source ), skus ( buyer_sku_ref )')
                .in('id', ids)
                .is('delete_meta', null)
                .order('created_at', { ascending: false })

              if (dbErr) throw dbErr
              const mappedBuyerSkus = mapSkuRows(data || [])
              const buyerMerchNameMap = await fetchMemberNameMap(mappedBuyerSkus.map(s => s.created_by_member_id))
              skus = mappedBuyerSkus.map(s => ({
                ...s,
                workspace_id:       workspaceMap[s.id]?.id,
                workspace_status:   workspaceMap[s.id]?.status,
                supplier_org_id:    workspaceMap[s.id]?.supplier_org_id || s.supplier_org_id,
                buyer_ref:          workspaceMap[s.id]?.buyer_ref   || null,
                buyer_brief:        workspaceMap[s.id]?.buyer_brief || null,
                workspace_created_at: workspaceMap[s.id]?.created_at || null,
                created_by_member_name: buyerMerchNameMap[s.created_by_member_id] || null,
                approved_price:     workspaceMap[s.id]?.approved_price    ?? null,
                approved_currency:  workspaceMap[s.id]?.approved_currency ?? null,
              }))
            }
          } else {
            // supplier: show all their org's uploaded SKUs, overlay any workspace for that org
            const supplierOrgId = useProfileStore.getState().orgMembership?.orgId
            const [{ data: skuData, error: skuErr }, { data: wsData }] = await Promise.all([
              supabase.from('npd2_catalog_skus')
                .select('*, npd2_catalog_uploads!inner ( id, supplier, buyer, supplier_org_id, season, category, created_by_member_id, for_buyer_org_id, sku_source ), skus ( buyer_sku_ref )')
                .eq('npd2_catalog_uploads.supplier_org_id', supplierOrgId)
                .eq('is_archived', false)
                .is('delete_meta', null)
                .order('created_at', { ascending: false }),
              supabase.from('npd2_workspaces')
                .select('catalog_sku_id, id, status, supplier_org_id, supplier_member_id, buyer_ref, buyer_brief, origin, reference_media')
                .eq('supplier_org_id', supplierOrgId),
            ])

            if (skuErr) throw skuErr

            const wsMap = {}
            for (const w of (wsData || []))
              if (!wsMap[w.catalog_sku_id]) wsMap[w.catalog_sku_id] = w

            // Check which workspaces have an active supplier invite (pending or accepted)
            const wsIds = Object.values(wsMap).map(w => w.id).filter(Boolean)
            const invitedWsIds = new Set()
            if (wsIds.length) {
              const { data: invRows } = await supabase
                .from('npd2_invites')
                .select('workspace_id')
                .in('workspace_id', wsIds)
                .in('role', ['supplier', 'vendor'])
                .in('status', ['pending', 'accepted'])
              for (const i of (invRows || [])) invitedWsIds.add(i.workspace_id)
              // also treat already-accepted members as invited
              for (const w of Object.values(wsMap))
                if (w.supplier_member_id) invitedWsIds.add(w.id)
            }

            const mappedSupplierSkus = mapSkuRows(skuData || [])
            const merchNameMap = await fetchMemberNameMap(mappedSupplierSkus.map(s => s.created_by_member_id))

            skus = mappedSupplierSkus.map(s => ({
              ...s,
              workspace_id:       wsMap[s.id]?.id              || null,
              workspace_status:   wsMap[s.id]?.status           || null,
              supplier_org_id:    wsMap[s.id]?.supplier_org_id  || s.supplier_org_id,
              buyer_ref:          wsMap[s.id]?.buyer_ref        || null,
              buyer_brief:        wsMap[s.id]?.buyer_brief      || null,
              supplier_invited:   wsMap[s.id] ? invitedWsIds.has(wsMap[s.id].id) : false,
              created_by_member_name: merchNameMap[s.created_by_member_id] || null,
            }))
          }

          set({ skus, loading: false }, false, 'plm/fetchDone')

          // Poll any SKUs that were already processing when we loaded
          const processingIds = skus.filter(sk => sk.image_processing).map(sk => sk.id)
          if (processingIds.length) {
            const pollProcessing = async () => {
              const { data } = await supabase
                .from('npd2_catalog_skus')
                .select('id, image_url, image_processing, description, material, finish, weight, length, width, height, measurement')
                .in('id', processingIds)
              if (!data?.length) return false
              set(s => ({
                skus: s.skus.map(sk => {
                  const updated = data.find(r => r.id === sk.id)
                  return updated ? { ...sk, ...updated } : sk
                })
              }), false, 'plm/processingPoll')
              return data.every(r => !r.image_processing)
            }
            pollProcessing().then(done => {
              if (done) return
              const interval = setInterval(() => {
                pollProcessing().then(done => { if (done) clearInterval(interval) }).catch(() => {})
              }, 4000)
            }).catch(() => {})
          }

          // Skip channel setup if a newer fetchCatalog call has started
          if (get()._fetchCallId !== callId) return

          const catalogChannel = supabase
            .channel(`catalog-sku-updates-${memberId}-${callId}`)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'npd2_catalog_skus' }, ({ new: row }) => {
              if (row.delete_meta != null) {
                set(s => ({ skus: s.skus.filter(sk => sk.id !== row.id) }), false, 'plm/skuDeletedRealtime')
              } else if (row.image_processing === false && row.image_url) {
                set(s => ({
                  skus: s.skus.map(sk => sk.id === row.id
                    ? { ...sk, image_url: row.image_url, image_processing: false }
                    : sk
                  )
                }), false, 'plm/skuImageProcessed')
              }
            })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'npd2_workspaces' }, ({ new: row }) => {
              console.log('[PLM] workspace realtime event:', row.id, 'status:', row.status)
              set(s => {
                const wsIds = s.skus.map(sk => sk.workspace_id).filter(Boolean)
                const matched = wsIds.includes(row.id)
                console.log('[PLM] store has', wsIds.length, 'workspace_ids, match:', matched)
                return {
                  skus: s.skus.map(sk =>
                    sk.workspace_id === row.id
                      ? { ...sk, workspace_status: row.status ?? sk.workspace_status, buyer_member_id: row.buyer_member_id ?? sk.buyer_member_id }
                      : sk
                  ),
                  activeWorkspace: s.activeWorkspace?.id === row.id
                    ? { ...s.activeWorkspace, status: row.status ?? s.activeWorkspace.status }
                    : s.activeWorkspace,
                }
              }, false, 'plm/workspaceRealtime')
            })
            .subscribe()
          set({ _catalogChannel: catalogChannel }, false, 'plm/catalogChannelSet')
        } catch (err) {
          set({ error: err.message, loading: false }, false, 'plm/fetchError')
        }
      },

      closeCatalogChannel: () => {
        const ch = get()._catalogChannel
        if (ch) supabase.removeChannel(ch)
        set({ _catalogChannel: null }, false, 'plm/catalogChannelClosed')
      },

      refreshCatalog: async () => {
        const { memberId, role } = get()
        if (!memberId) return
        try {
          if (role === 'supplier') {
            const supplierOrgId = useProfileStore.getState().orgMembership?.orgId
            const [{ data: skuData }, { data: wsData }] = await Promise.all([
              supabase.from('npd2_catalog_skus')
                .select('*, npd2_catalog_uploads!inner ( id, supplier, buyer, supplier_org_id, season, category, created_by_member_id, for_buyer_org_id, sku_source ), skus ( buyer_sku_ref )')
                .eq('npd2_catalog_uploads.supplier_org_id', supplierOrgId)
                .eq('is_archived', false)
                .is('delete_meta', null)
                .order('created_at', { ascending: false }),
              supabase.from('npd2_workspaces')
                .select('catalog_sku_id, id, status, supplier_org_id, supplier_member_id, buyer_ref, buyer_brief, origin, reference_media')
                .eq('supplier_org_id', supplierOrgId),
            ])
            const wsMap = {}
            for (const w of (wsData || []))
              if (!wsMap[w.catalog_sku_id]) wsMap[w.catalog_sku_id] = w
            const wsIds = Object.values(wsMap).map(w => w.id).filter(Boolean)
            const invitedWsIds = new Set()
            if (wsIds.length) {
              const { data: invRows } = await supabase
                .from('npd2_invites')
                .select('workspace_id')
                .in('workspace_id', wsIds)
                .in('role', ['supplier', 'vendor'])
                .in('status', ['pending', 'accepted'])
              for (const i of (invRows || [])) invitedWsIds.add(i.workspace_id)
              for (const w of Object.values(wsMap))
                if (w.supplier_member_id) invitedWsIds.add(w.id)
            }
            const mappedRefreshSkus = mapSkuRows(skuData || [])
            const refreshMerchNameMap = await fetchMemberNameMap(mappedRefreshSkus.map(s => s.created_by_member_id))
            set({
              skus: mappedRefreshSkus.map(s => ({
                ...s,
                workspace_id:     wsMap[s.id]?.id              || null,
                workspace_status: wsMap[s.id]?.status           || null,
                supplier_org_id:  wsMap[s.id]?.supplier_org_id  || s.supplier_org_id,
                buyer_ref:        wsMap[s.id]?.buyer_ref        || null,
                buyer_brief:      wsMap[s.id]?.buyer_brief      || null,
                supplier_invited: wsMap[s.id] ? invitedWsIds.has(wsMap[s.id].id) : false,
                created_by_member_name: refreshMerchNameMap[s.created_by_member_id] || null,
              })),
            }, false, 'plm/refresh')
          } else {
            const SKU_SELECT = '*, npd2_catalog_uploads!inner ( id, supplier, buyer, supplier_org_id, season, category, created_by_member_id, for_buyer_org_id, sku_source ), skus ( buyer_sku_ref )'
            const [
              { data: ownData },
              { data: supplierData },
              { data: pairRows },
              { data: explicitRows },
            ] = await Promise.all([
              supabase.from('npd2_catalog_skus')
                .select(SKU_SELECT)
                .eq('npd2_catalog_uploads.created_by_member_id', memberId)
                .eq('is_archived', false).is('delete_meta', null)
                .order('created_at', { ascending: false }),
              supabase.from('npd2_catalog_skus')
                .select(SKU_SELECT)
                .is('npd2_catalog_uploads.created_by_member_id', null)
                .not('npd2_catalog_uploads.supplier_org_id', 'is', null)
                .eq('is_archived', false).is('delete_meta', null)
                .order('created_at', { ascending: false }),
              supabase.from('merchant_access_pairs')
                .select('grantor_member_id')
                .eq('grantee_member_id', memberId),
              supabase.from('npd2_catalog_access')
                .select('catalog_upload_id')
                .eq('member_id', memberId),
            ])

            const grantorIds      = (pairRows    || []).map(r => r.grantor_member_id).filter(Boolean)
            const sharedUploadIds = (explicitRows || []).map(r => r.catalog_upload_id).filter(Boolean)

            const [{ data: pairSkuData }, { data: explicitSkuData }] = await Promise.all([
              grantorIds.length
                ? supabase.from('npd2_catalog_skus')
                    .select(SKU_SELECT)
                    .in('npd2_catalog_uploads.created_by_member_id', grantorIds)
                    .eq('is_archived', false).is('delete_meta', null)
                    .order('created_at', { ascending: false })
                : Promise.resolve({ data: [] }),
              sharedUploadIds.length
                ? supabase.from('npd2_catalog_skus')
                    .select(SKU_SELECT)
                    .in('npd2_catalog_uploads.id', sharedUploadIds)
                    .eq('is_archived', false).is('delete_meta', null)
                    .order('created_at', { ascending: false })
                : Promise.resolve({ data: [] }),
            ])

            const seenIds = new Set()
            const merged = []
            for (const row of [
              ...(ownData || []), ...(supplierData || []),
              ...(pairSkuData || []), ...(explicitSkuData || []),
            ]) {
              if (!seenIds.has(row.id)) { seenIds.add(row.id); merged.push(row) }
            }
            const rawSkus = mapSkuRows(merged)

            const membership = useProfileStore.getState().orgMembership
            const isAdmin = membership?.role === 'admin' || membership?.role === 'owner'
            let adminViewSkus = []
            if (isAdmin && membership?.orgId) {
              const { data: merchMembers } = await supabase
                .from('organization_members')
                .select('id')
                .eq('organization_id', membership.orgId)
                .eq('department', 'merchandising')
                .neq('id', memberId)
              const merchIds = (merchMembers || []).map(m => m.id).filter(Boolean)
              if (merchIds.length) {
                const adminSkuData = await fetchAllRows((from, to) =>
                  supabase.from('npd2_catalog_skus')
                    .select('*, npd2_catalog_uploads!inner ( id, supplier, buyer, supplier_org_id, season, category, created_by_member_id, for_buyer_org_id, sku_source ), skus ( buyer_sku_ref )')
                    .filter('npd2_catalog_uploads.created_by_member_id', 'in', `(${merchIds.join(',')})`)
                    .eq('is_archived', false)
                    .is('delete_meta', null)
                    .order('created_at', { ascending: false })
                    .range(from, to)
                )
                adminViewSkus = mapSkuRows(adminSkuData)
                  .filter(s => !seenIds.has(s.id))
                  .map(s => ({ ...s, is_read_only: true }))
              }
            }

            const allRawSkus = [...rawSkus, ...adminViewSkus]
            const memberIds  = [...new Set(allRawSkus.map(s => s.created_by_member_id).filter(Boolean))]
            const skuIds     = allRawSkus.map(s => s.id)

            const [memberNameMap, wsMap] = await Promise.all([
              (async () => {
                if (!memberIds.length) return {}
                const { data: mRows } = await supabase
                  .from('organization_members').select('id, full_name, email, organizations(name, display_name)').in('id', memberIds)
                return Object.fromEntries(
                  (mRows || []).map(m => {
                    const orgName = m.organizations?.display_name || m.organizations?.name || null
                    return [m.id, m.full_name || m.email || orgName || 'Unknown Member']
                  })
                )
              })(),
              fetchWorkspaceMap(skuIds),
            ])

            const wsList = Object.values(wsMap)
            const allBuyerOrgIds    = [...new Set(wsList.map(w => w.buyer_org_id).filter(Boolean))]
            const emailsWithoutMemberId = [...new Set(
              wsList.filter(w => w.buyer_org_id && !w.buyer_member_id && w.buyer_email).map(w => w.buyer_email)
            )]

            let buyerOrgNameMap = {}
            if (allBuyerOrgIds.length) {
              const { data: orgRows } = await supabase
                .from('organizations').select('id, display_name, name').in('id', allBuyerOrgIds)
              buyerOrgNameMap = Object.fromEntries((orgRows || []).map(o => [o.id, o.display_name || o.name]))
            }

            const allWsIds = [...new Set(wsList.map(w => w.id).filter(Boolean))]
            let wsAcceptedBuyerIds = {}, wsAcceptedSupplierIds = {}, inviteEmailById = {}
            if (allWsIds.length) {
              const invChunks = chunkArray(allWsIds, 100)
              const invResults = await Promise.all(
                invChunks.map(chunk =>
                  supabase.from('npd2_invites').select('workspace_id, member_id, role, email')
                    .in('workspace_id', chunk).eq('status', 'accepted').not('member_id', 'is', null)
                )
              )
              for (const { data } of invResults)
                for (const row of (data || [])) {
                  inviteEmailById[row.member_id] = inviteEmailById[row.member_id] || row.email
                  const isBuyer = row.role === 'buyer'
                  const map = isBuyer ? wsAcceptedBuyerIds : wsAcceptedSupplierIds
                  if (!map[row.workspace_id]) map[row.workspace_id] = []
                  if (!map[row.workspace_id].includes(row.member_id)) map[row.workspace_id].push(row.member_id)
                }
            }

            const allBuyerMemberIds = [...new Set([
              ...wsList.map(w => w.buyer_member_id).filter(Boolean),
              ...Object.values(wsAcceptedBuyerIds).flat(),
            ])]
            const allSupplierMemberIds = [...new Set([
              ...wsList.map(w => w.supplier_member_id).filter(Boolean),
              ...Object.values(wsAcceptedSupplierIds).flat(),
            ])]

            let buyerNameById = {}, buyerNameByEmail = {}, supplierNameById = {}
            await Promise.all([
              allBuyerMemberIds.length
                ? supabase.from('organization_members').select('id, full_name').in('id', allBuyerMemberIds)
                    .then(({ data }) => { buyerNameById = Object.fromEntries((data || []).map(m => [m.id, m.full_name || null])) })
                : Promise.resolve(),
              emailsWithoutMemberId.length && allBuyerOrgIds.length
                ? supabase.from('organization_members').select('email, full_name').in('organization_id', allBuyerOrgIds).in('email', emailsWithoutMemberId)
                    .then(({ data }) => { buyerNameByEmail = Object.fromEntries((data || []).map(m => [m.email, m.full_name || null])) })
                : Promise.resolve(),
              allSupplierMemberIds.length
                ? supabase.from('organization_members').select('id, full_name').in('id', allSupplierMemberIds)
                    .then(({ data }) => { supplierNameById = Object.fromEntries((data || []).map(m => [m.id, m.full_name || null])) })
                : Promise.resolve(),
            ])

            const refreshedSkus = allRawSkus.map(s => {
              const ws = wsMap[s.id]
              const buyerName = ws?.buyer_member_id
                ? (buyerNameById[ws.buyer_member_id] || null)
                : (ws?.buyer_email ? (buyerNameByEmail[ws.buyer_email] || null) : null)
              const supplierName = ws?.supplier_member_id
                ? (supplierNameById[ws.supplier_member_id] || ws?.supplier_email || null)
                : (ws?.supplier_email || null)
              const acceptedBuyerIds    = ws?.id ? (wsAcceptedBuyerIds[ws.id]    || []) : []
              const acceptedSupplierIds = ws?.id ? (wsAcceptedSupplierIds[ws.id] || []) : []
              const extraBuyerNames    = acceptedBuyerIds.filter(id => id !== ws?.buyer_member_id)
                .map(id => buyerNameById[id] || inviteEmailById[id] || null).filter(Boolean)
              const extraSupplierNames = acceptedSupplierIds.filter(id => id !== ws?.supplier_member_id)
                .map(id => supplierNameById[id] || inviteEmailById[id] || null).filter(Boolean)
              // Historical data safety net: some npd2_workspaces rows were left with a null
              // status/buyer_email by a since-fixed backend accept-flow bug (co-buyer joins used
              // to reset status). If an accepted buyer invite exists but the workspace row itself
              // is blank, fall back so the grid doesn't show it as "inactive". Note: this only
              // ever derives 'active', never a further stage — a workspace nulled out after
              // reaching approved/sample would under-report here as merely active.
              const hasAcceptedBuyer = !!(ws?.buyer_member_id || acceptedBuyerIds.length)
              const derivedStatus = ws?.status || (ws?.id && hasAcceptedBuyer ? 'active' : null)
              const derivedBuyerEmail = ws?.buyer_email || (acceptedBuyerIds.length ? inviteEmailById[acceptedBuyerIds[0]] : null)
              return {
                ...s,
                created_by_member_name: memberNameMap[s.created_by_member_id] || null,
                workspace_id:     ws?.id         || null,
                workspace_status: derivedStatus,
                buyer_ref:        ws?.buyer_ref   || null,
                buyer_brief:      ws?.buyer_brief || null,
                buyer_email:      derivedBuyerEmail,
                buyer_org_id:          ws?.buyer_org_id || null,
                buyer_org_name:        ws?.buyer_org_id ? (buyerOrgNameMap[ws.buyer_org_id] || null) : null,
                buyer_name:            buyerName,
                extra_buyer_names:     extraBuyerNames,
                supplier_name:         supplierName,
                extra_supplier_names:  extraSupplierNames,
                supplier_email:        ws?.supplier_email || null,
              }
            })
            set({ skus: refreshedSkus }, false, 'plm/refresh')

            const processingIds = refreshedSkus.filter(sk => sk.image_processing).map(sk => sk.id)
            if (processingIds.length) {
              const pollProcessing = async () => {
                const { data } = await supabase
                  .from('npd2_catalog_skus')
                  .select('id, image_url, image_processing, description, material, finish, weight, length, width, height, measurement')
                  .in('id', processingIds)
                if (!data?.length) return false
                set(s => ({
                  skus: s.skus.map(sk => {
                    const updated = data.find(r => r.id === sk.id)
                    return updated ? { ...sk, ...updated } : sk
                  })
                }), false, 'plm/processingPoll')
                return data.every(r => !r.image_processing)
              }
              pollProcessing().then(done => {
                if (done) return
                const interval = setInterval(() => {
                  pollProcessing().then(done => { if (done) clearInterval(interval) }).catch(() => {})
                }, 4000)
              }).catch(() => {})
            }
          }
        } catch { /* ignored */ }
      },

      // ── Categories ───────────────────────────────────────────────────────────
      fetchCategories: async () => {
        const { data } = await supabase
          .from('categories')
          .select('id, name, parent_id, level')
          .order('level')
          .order('name')
        if (data) set({ categories: data }, false, 'plm/categories')
      },

      // ── Filters ───────────────────────────────────────────────────────────────
      setFilter: (key, value) =>
        set(s => ({ filters: { ...s.filters, [key]: value } }), false, 'plm/filter'),

      toast: (msg) => {
        set({ toastMsg: msg }, false, 'plm/toast')
        setTimeout(() => set({ toastMsg: null }, false, 'plm/toastClear'), 3000)
      },

      // ── Sidebar ───────────────────────────────────────────────────────────────
      toggleSidebar: () =>
        set(s => {
          const next = !s.sidebarCollapsed
          localStorage.setItem('plm_aside_collapsed', next)
          return { sidebarCollapsed: next }
        }, false, 'plm/sidebar'),

      // ── Selection ─────────────────────────────────────────────────────────────
      toggleSelect: (id) =>
        set(s => {
          const next = new Set(s.selectedIds)
          next.has(id) ? next.delete(id) : next.add(id)
          return { selectedIds: next }
        }, false, 'plm/select'),

      clearSelection: () => set({ selectedIds: new Set() }, false, 'plm/clearSel'),

      deselectIds: (ids) => set(s => {
        const next = new Set(s.selectedIds)
        ids.forEach(id => next.delete(id))
        return { selectedIds: next }
      }, false, 'plm/deselectIds'),

      selectBatch: (ids) => set(s => {
        const next = new Set(s.selectedIds)
        const allSelected = ids.every(id => next.has(id))
        if (allSelected) ids.forEach(id => next.delete(id))
        else             ids.forEach(id => next.add(id))
        return { selectedIds: next }
      }, false, 'plm/selectBatch'),

      // ── Delete ────────────────────────────────────────────────────────────────
      // Hard delete — permanent, used after PPT/PDF upload to remove bad SKUs
      deleteSku: async (id, role) => {
        await api('DELETE', `/catalog/skus/${id}?role=${role}`)
        set(s => ({ skus: s.skus.filter(sk => sk.id !== id) }), false, 'plm/deleteSku')
      },

      deleteSkus: async (ids, role) => {
        await Promise.all(ids.map(id =>
          api('DELETE', `/catalog/skus/${id}?role=${role}`)
        ))
        set(s => {
          const del = new Set(ids)
          return { skus: s.skus.filter(sk => !del.has(sk.id)), selectedIds: new Set() }
        }, false, 'plm/deleteSkus')
      },

      // Soft delete — flags with delete_meta, used from the catalog selection toolbar
      softDeleteSkus: async (ids, role, reason) => {
        await Promise.all(ids.map(id =>
          api('PATCH', `/catalog/skus/${id}/soft-delete?role=${role}`, reason ? { reason } : undefined)
        ))
        set(s => {
          const del = new Set(ids)
          return { skus: s.skus.filter(sk => !del.has(sk.id)), selectedIds: new Set() }
        }, false, 'plm/softDeleteSkus')
      },

      // Persist drag-reorder of SKU cards within a supplier+season group
      reorderSkus: async (orderedIds) => {
        const positions = Object.fromEntries(orderedIds.map((id, i) => [id, i]))
        set(s => ({
          skus: s.skus.map(sk => positions[sk.id] !== undefined ? { ...sk, sort_position: positions[sk.id] } : sk),
        }), false, 'plm/reorderSkus')
        await api('PATCH', '/catalog/skus/reorder', { ordered_ids: orderedIds })
      },

      // Bulk workspace status — routes through backend so milestone events get logged
      bulkSetWorkspaceStatus: async (workspaceIds, status, note) => {
        const { customerId, role } = get()
        const preSave  = get().activeWorkspace
        const knownIds = new Set(preSave && workspaceIds.includes(preSave.id) ? preSave.npd_comments.map(c => c.id) : [])
        const result = await api('PATCH', '/workspaces/bulk-status', { workspace_ids: workspaceIds, status, note, customerId, role })
        // Resuming a paused workspace can resolve to a different status than what was
        // requested (e.g. 'active' requested, 'approved' restored) — use the backend's actual
        // per-workspace result instead of assuming every workspace ended up at `status`.
        const resolved = result?.statuses || {}
        const statusFor = (workspaceId) => resolved[workspaceId] ?? status
        set(s => ({
          skus: s.skus.map(sk =>
            workspaceIds.includes(sk.workspace_id) ? { ...sk, workspace_status: statusFor(sk.workspace_id) } : sk
          ),
          selectedIds: new Set(),
          // Keep an already-open detail modal in sync — otherwise it shows a stale status
          // until closed and reopened if its workspace is part of this batch.
          ...(s.activeWorkspace && workspaceIds.includes(s.activeWorkspace.id) && {
            activeWorkspace: { ...s.activeWorkspace, status: statusFor(s.activeWorkspace.id) },
          }),
        }), false, 'plm/bulkWorkspaceStatus')

        // Surface the milestone comment (who did it + when) the backend just inserted,
        // the same way setHoldDropStatus does — otherwise the actor doesn't see their own
        // hold/reject/resume in the Activity tab until the modal is closed and reopened.
        if (preSave && workspaceIds.includes(preSave.id)) {
          const enriched = await fetchNewComments(preSave.id, 'milestone', knownIds, get()._memberNameMap)
          if (enriched.length) {
            set(s => {
              if (!s.activeWorkspace || s.activeWorkspace.id !== preSave.id) return {}
              const existing = new Set(s.activeWorkspace.npd_comments.map(c => c.id))
              const toAdd    = enriched.filter(c => !existing.has(c.id))
              if (!toAdd.length) return {}
              return { activeWorkspace: { ...s.activeWorkspace, npd_comments: [...s.activeWorkspace.npd_comments, ...toAdd] } }
            }, false, 'plm/bulkWorkspaceStatusComment')

            const channel = get()._realtimeChannel
            if (channel) enriched.forEach(c => channel.send({ type: 'broadcast', event: 'comment', payload: c }))
          }
        }
      },

      // ── SKU attributes ────────────────────────────────────────────────────────
      patchSkus: async (patches) => {
        await Promise.all(patches.map(({ id, fields }) => {
          const { l, w, h, categoryId, categoryName: _cn, buyerSkuRef: _bsr, productionSkuId, tempSkuRef, ...rest } = fields
          const mapped = {
            ...rest,
            ...(l               !== undefined && { length:               l }),
            ...(w               !== undefined && { width:                w }),
            ...(h               !== undefined && { height:               h }),
            ...(categoryId      !== undefined && { category_id:  categoryId }),
            ...(productionSkuId !== undefined && { production_sku_id : productionSkuId }),
            ...(tempSkuRef      !== undefined && { temp_sku_ref:  tempSkuRef }),
          }
          return api('PATCH', `/supplier-catalog/skus/${id}`, mapped)
        }))
        set(s => {
          const updatedSkus = s.skus.map(sk => {
            const patch = patches.find(p => p.id === sk.id)
            if (!patch) return sk
            const { l, w, h, weight, material, measurement, buyerSkuRef, categoryId, categoryName, productionSkuId, tempSkuRef, ...rest } = patch.fields
            return {
              ...sk, ...rest,
              ...(weight          !== undefined && { weight }),
              ...(l               !== undefined && { length:           l }),
              ...(w               !== undefined && { width:            w }),
              ...(h               !== undefined && { height:           h }),
              ...(material        !== undefined && { material }),
              ...(measurement     !== undefined && { measurement }),
              ...(categoryId      !== undefined && { category_id:      categoryId }),
              ...(categoryName    !== undefined && { category:         categoryName }),
              ...(productionSkuId !== undefined && { production_sku_id: productionSkuId }),
              ...(buyerSkuRef     !== undefined && { buyer_sku_ref:    buyerSkuRef }),
              ...(tempSkuRef      !== undefined && { temp_sku_ref: tempSkuRef, buyer_ref_status: tempSkuRef ? 'pending_buyer_ref' : null }),
            }
          })
          const updatedActiveSku = s.activeSku
            ? updatedSkus.find(sk => sk.id === s.activeSku.id) ?? s.activeSku
            : s.activeSku
          return { skus: updatedSkus, activeSku: updatedActiveSku }
        }, false, 'plm/patchSkus')
        const ch = get()._realtimeChannel
        if (ch) {
          patches.forEach(({ id }) => {
            const updated = get().skus.find(sk => sk.id === id)
            if (updated) ch.send({ type: 'broadcast', event: 'sku_update', payload: { id, fields: updated } })
          })
        }
      },

      updateVendorSkuRef: async (skuId, value) => {
        const { error } = await supabase
          .from('npd2_catalog_skus')
          .update({ vendor_sku_ref: value || null })
          .eq('id', skuId)
        if (error) throw new Error(error.message)
        set(s => {
          const skus = s.skus.map(sk => sk.id === skuId ? { ...sk, vendor_sku_ref: value || null } : sk)
          const activeSku = s.activeSku?.id === skuId ? { ...s.activeSku, vendor_sku_ref: value || null } : s.activeSku
          return { skus, activeSku }
        }, false, 'plm/updateVendorSkuRef')
        const ch = get()._realtimeChannel
        if (ch) ch.send({ type: 'broadcast', event: 'sku_update', payload: { id: skuId, fields: { vendor_sku_ref: value || null } } })
      },

      // Refetch DB fields that the upload-status polling response may omit
      fetchBuyerSkuRefs: async (skuIds) => {
        if (!skuIds.length) return {}
        const { data } = await supabase
          .from('npd2_catalog_skus')
          .select('id, slide_index, production_sku_id, temp_sku_ref, length, width, height, dimensions, measurement, description, material, finish, weight, skus(buyer_sku_ref)')
          .in('id', skuIds)
        return Object.fromEntries((data || []).map(r => [r.id, {
          slide_index:       r.slide_index          ?? null,
          buyer_sku_ref:     r.skus?.buyer_sku_ref || null,
          production_sku_id: r.production_sku_id   ?? null,
          temp_sku_ref:      r.temp_sku_ref         || null,
          buyer_ref_status:  (!r.production_sku_id && r.temp_sku_ref) ? 'pending_buyer_ref' : null,
          length:            r.length              ?? null,
          width:             r.width               ?? null,
          height:            r.height              ?? null,
          dimensions:        r.dimensions          || null,
          measurement:       r.measurement         || 'cm',
          description:       r.description         || null,
          material:          r.material            || null,
          finish:            r.finish              || null,
          weight:            r.weight              ?? null,
        }]))
      },

      addSkus: (newSkus) => {
        set(s => {
          const newIds = new Set(newSkus.map(sk => sk.id))
          return { skus: [...newSkus, ...s.skus.filter(sk => !newIds.has(sk.id))] }
        }, false, 'plm/addSkus')

        // Poll for any SKUs still processing until they're all done
        const processingIds = newSkus.filter(sk => sk.image_processing).map(sk => sk.id)
        if (!processingIds.length) return
        const applyUpdate = async () => {
          const { data } = await supabase
            .from('npd2_catalog_skus')
            .select('id, image_url, image_processing, description, material, finish, weight, length, width, height, measurement')
            .in('id', processingIds)
          if (!data?.length) return false
          set(s => ({
            skus: s.skus.map(sk => {
              const updated = data.find(r => r.id === sk.id)
              return updated ? { ...sk, ...updated } : sk
            })
          }), false, 'plm/processingPoll')
          return data.every(r => !r.image_processing)
        }
        // Immediate check first — job may already be done
        applyUpdate().then(done => {
          if (done) return
          const interval = setInterval(() => {
            applyUpdate().then(done => { if (done) clearInterval(interval) }).catch(() => {})
          }, 4000)
        }).catch(() => {})
      },

      createSku: async (formData) => {
        const memberId = useProfileStore.getState().orgMembership?.memberId
        formData.append('memberId', memberId || '')
        const result = await api('POST', '/supplier-catalog/skus', null, formData)
        await get().refreshCatalog()
        return result
      },

      createSkusBulk: async (images, attributesPerImage, shared) => {
        const memberId = useProfileStore.getState().orgMembership?.memberId
        const fd = new FormData()
        fd.append('memberId', memberId || '')
        if (shared.season)        fd.append('season',        shared.season)
        if (shared.supplierOrgId) fd.append('supplierOrgId', shared.supplierOrgId)
        if (shared.supplier)      fd.append('supplier',      shared.supplier)
        if (shared.mode)          fd.append('mode',          shared.mode)
        if (shared.buyerOrgId)    fd.append('buyerOrgId',    shared.buyerOrgId)
        images.forEach(img => fd.append('images', img.file))
        fd.append('attributes', JSON.stringify(attributesPerImage))
        const result = await api('POST', '/supplier-catalog/skus/bulk', null, fd)
        await get().refreshCatalog()
        return result
      },

      // ── Workspace ─────────────────────────────────────────────────────────────
      openSkuPanel: (sku) =>
        set({ activeSku: sku, activeWorkspaceId: null, activeWorkspace: null, workspaceLoading: false }, false, 'plm/skuPanel'),

      openWorkspace: async (workspaceId, sku = null, { silent = false } = {}) => {
        const prev = get()._realtimeChannel
        if (prev) supabase.removeChannel(prev)

        // silent = true: already showing SKU data (merchant auto-load path),
        // don't flash a loading spinner — just fetch in background and merge in
        if (silent) {
          set({ activeWorkspaceId: workspaceId, _realtimeChannel: null }, false, 'plm/wsOpenSilent')
        } else {
          set({ activeSku: sku, activeWorkspaceId: workspaceId, workspaceLoading: true, activeWorkspace: null, _realtimeChannel: null }, false, 'plm/wsOpen')
        }
        try {
          const [wsRes, cmRes, invRes, soRes] = await Promise.all([
            supabase.from('npd2_workspaces')
              .select('*, npd2_catalog_skus!catalog_sku_id(id, auto_code, image_url, slide_index, description, material, finish, weight, length, width, height, measurement, dimensions, npd2_catalog_uploads(id, supplier, supplier_org_id, season, category, created_by_member_id))')
              .eq('id', workspaceId).maybeSingle(),
            supabase.from('npd2_comments').select('*').eq('workspace_id', workspaceId).order('created_at', { ascending: true }),
            supabase.from('npd2_invites').select('id, email, role, status, member_id, expires_at, accepted_at').eq('workspace_id', workspaceId),
            supabase.from('npd2_sample_orders').select('*').eq('workspace_id', workspaceId).maybeSingle(),
          ])
          if (wsRes.error) throw wsRes.error
          if (soRes.error) console.warn('[PLM] sample order fetch error:', soRes.error)

          const invites     = invRes.data || []
          const buyerInv    = invites.find(i => i.role === 'buyer')
          const supplierInv = invites.find(i => i.role === 'supplier' || i.role === 'vendor')
          const wsBase      = wsRes.data || {}

          // Look up emails + names for accepted members (workspace-level + per-invite) + merchant
          const acceptedInviteMemberIds = invites.filter(i => i.member_id && i.status === 'accepted').map(i => i.member_id)
          const acceptedIds = [...new Set([wsBase.buyer_member_id, wsBase.supplier_member_id, wsBase.merchant_member_id, ...acceptedInviteMemberIds].filter(Boolean))]
          let memberEmailMap = {}
          let inviteNameMap  = {}
          if (acceptedIds.length) {
            const { data: members } = await supabase
              .from('organization_members').select('id, full_name, email').in('id', acceptedIds)
            memberEmailMap = Object.fromEntries((members || []).filter(m => m.email).map(m => [m.id, m.email]))
            inviteNameMap  = Object.fromEntries((members || []).filter(m => m.full_name).map(m => [m.id, m.full_name]))
          }

          // Look up org names — supplier_org_id falls back to catalog upload's org if not set on workspace
          const skuRow0  = wsBase.npd2_catalog_skus || {}
          const upload0  = skuRow0.npd2_catalog_uploads || {}
          const resolvedSupplierOrgId = wsBase.supplier_org_id || upload0.supplier_org_id || null

          // Look up names by email for pending invites (member_id not set yet).
          // Scoped per-org+role — the same email can belong to different member rows in
          // different orgs, so a global email->name lookup can attach the wrong person's name.
          const buyerInviteEmails    = [...new Set(invites.filter(i => i.role === 'buyer' && i.email).map(i => i.email))]
          const supplierInviteEmails = [...new Set(invites.filter(i => (i.role === 'supplier' || i.role === 'vendor') && i.email).map(i => i.email))]
          const [buyerEmailRows, supplierEmailRows] = await Promise.all([
            (buyerInviteEmails.length && wsBase.buyer_org_id)
              ? supabase.from('organization_members').select('email, full_name')
                  .eq('organization_id', wsBase.buyer_org_id).in('email', buyerInviteEmails)
              : Promise.resolve({ data: [] }),
            (supplierInviteEmails.length && resolvedSupplierOrgId)
              ? supabase.from('organization_members').select('email, full_name')
                  .eq('organization_id', resolvedSupplierOrgId).in('email', supplierInviteEmails)
              : Promise.resolve({ data: [] }),
          ])
          const emailNameMap = Object.fromEntries(
            [...(buyerEmailRows.data || []), ...(supplierEmailRows.data || [])]
              .filter(m => m.full_name).map(m => [m.email, m.full_name])
          )
          const orgIdSet = [wsBase.buyer_org_id, resolvedSupplierOrgId].filter(Boolean)
          let orgNameMap = {}
          if (orgIdSet.length) {
            const { data: orgs } = await supabase
              .from('organizations').select('id, display_name, name').in('id', orgIdSet)
            orgNameMap = Object.fromEntries((orgs || []).map(o => [o.id, o.display_name || o.name]))
          }

          // Flatten catalog SKU fields into workspace so the modal can display
          // product info even when activeSku is null (e.g. buyer opened via URL)
          const skuRow  = skuRow0
          const upload  = upload0
          const workspace = wsRes.data ? {
            ...wsBase,
            // SKU attributes
            image_url:   wsBase.image_url   || skuRow.image_url,
            auto_code:   wsBase.auto_code   || skuRow.auto_code,
            description: wsBase.description || skuRow.description,
            material:    wsBase.material    || skuRow.material,
            finish:      wsBase.finish      || skuRow.finish,
            weight:      wsBase.weight      || skuRow.weight,
            length:      skuRow.length,
            width:       skuRow.width,
            height:      skuRow.height,
            measurement: skuRow.measurement || 'cm',
            dimensions:  wsBase.dimensions  || skuRow.dimensions,
            supplier:         wsBase.supplier    || upload.supplier,
            season:           wsBase.season      || upload.season,
            category:         wsBase.category    || upload.category,
            supplier_org_id:   resolvedSupplierOrgId,
            // People
            merchant_name:        inviteNameMap[wsBase.merchant_member_id]   || null,
            merchant_email:       memberEmailMap[wsBase.merchant_member_id]  || null,
            // If accepted, show only the accepted member's real email (not the invite-sent-to email which may be a different person).
            buyer_email:          wsBase.buyer_member_id
              ? (memberEmailMap[wsBase.buyer_member_id] || null)
              : (wsBase.buyer_email || buyerInv?.email),
            buyer_name:           inviteNameMap[wsBase.buyer_member_id]     || null,
            buyer_org_name:       orgNameMap[wsBase.buyer_org_id]           || wsBase.buyer_org_name,
            buyer_invite_status:  buyerInv?.status    || null,
            supplier_email:       wsBase.supplier_member_id
              ? (memberEmailMap[wsBase.supplier_member_id] || null)
              : (wsBase.supplier_email || supplierInv?.email),
            supplier_name:        inviteNameMap[wsBase.supplier_member_id]  || null,
            supplier_org_name:    orgNameMap[resolvedSupplierOrgId]         || wsBase.supplier_org_name,
            supplier_invite_status: supplierInv?.status || null,
            buyer_invites:    invites.filter(i => i.role === 'buyer'                             && i.status !== 'revoked').map(i => ({ ...i, name: inviteNameMap[i.member_id] || emailNameMap[i.email] || null })),
            supplier_invites: invites.filter(i => (i.role === 'supplier' || i.role === 'vendor') && i.status !== 'revoked').map(i => ({ ...i, name: inviteNameMap[i.member_id] || emailNameMap[i.email] || null })),
            extra_buyer_member_ids:    invites.filter(i => i.role === 'buyer'                            && i.status === 'accepted' && i.member_id).map(i => i.member_id),
            extra_supplier_member_ids: invites.filter(i => (i.role === 'supplier' || i.role === 'vendor') && i.status === 'accepted' && i.member_id).map(i => i.member_id),
            npd_comments:      [],   // filled below after name lookup
            sampleOrder:       soRes.data || null,
          } : null

          // If no activeSku was passed (e.g. reopened from the ?workspace= URL param on
          // page reload, or buyer opened via URL), populate it from the joined SKU. This
          // bypasses fetchCatalog's admin-view read-only computation, so re-derive it here
          // too — otherwise an admin reloading on a colleague's workspace loses the
          // is_read_only flag and the workspace becomes silently editable.
          let resolvedIsReadOnly = false
          if (!sku && upload.created_by_member_id) {
            const membership = useProfileStore.getState().orgMembership
            const currentMemberId = membership?.memberId
            const isAdminUser = membership?.role === 'admin' || membership?.role === 'owner'
            if (isAdminUser && upload.created_by_member_id !== currentMemberId) {
              const [{ data: pairRow }, { data: explicitRow }] = await Promise.all([
                supabase.from('merchant_access_pairs').select('grantor_member_id')
                  .eq('grantee_member_id', currentMemberId).eq('grantor_member_id', upload.created_by_member_id).maybeSingle(),
                upload.id
                  ? supabase.from('npd2_catalog_access').select('catalog_upload_id')
                      .eq('member_id', currentMemberId).eq('catalog_upload_id', upload.id).maybeSingle()
                  : Promise.resolve({ data: null }),
              ])
              resolvedIsReadOnly = !pairRow && !explicitRow
            }
          }

          const resolvedSku = sku || (skuRow.id ? {
            id:          skuRow.id,
            auto_code:   skuRow.auto_code,
            image_url:   skuRow.image_url,
            slide_index: skuRow.slide_index,
            description: skuRow.description,
            material:    skuRow.material,
            finish:      skuRow.finish,
            weight:      skuRow.weight,
            length:      skuRow.length,
            width:       skuRow.width,
            height:      skuRow.height,
            measurement: skuRow.measurement || 'cm',
            dimensions:  skuRow.dimensions,
            supplier:    upload.supplier,
            season:      upload.season,
            category:    upload.category,
            created_by_member_id: upload.created_by_member_id || null,
            workspace_id:     workspaceId,
            workspace_status: wsBase.status,
            is_read_only: resolvedIsReadOnly,
          } : null)

          // Build member-name map for all comment authors
          const authorIds = [...new Set((cmRes.data || []).map(c => c.author_member_id).filter(Boolean))]
          let memberNameMap = { ...get()._memberNameMap }
          if (authorIds.length) {
            const { data: mRows } = await supabase
              .from('organization_members').select('id, full_name, user_id').in('id', authorIds)
            const nullIds = (mRows || []).filter(m => !m.full_name).map(m => m.user_id).filter(Boolean)
            let emailMap = {}
            if (nullIds.length) {
              const { data: uRows } = await supabase
                .from('portal_users').select('id, email').in('id', nullIds)
              emailMap = Object.fromEntries((uRows || []).map(u => [u.id, u.email]))
            }
            ;(mRows || []).forEach(m => {
              memberNameMap[m.id] = m.full_name || emailMap[m.user_id] || null
            })
          }

          const enrich = (row) => ({ ...mapComment(row), author_name: memberNameMap[row.author_member_id] || null })

          if (workspace) workspace.npd_comments = (cmRes.data || []).map(enrich)

          const addComment = (row) => {
            const named = { ...mapComment(row), author_name: get()._memberNameMap[row.author_member_id] || row.author_name || null }
            set(s => {
              if (!s.activeWorkspace) return {}
              if (s.activeWorkspace.npd_comments?.some(c => c.id === named.id)) return {}
              return { activeWorkspace: { ...s.activeWorkspace, npd_comments: [...(s.activeWorkspace.npd_comments || []), named] } }
            }, false, 'plm/newComment')
          }

          const handleVideoCallMilestone = (row, meta, { playSound = true } = {}) => {
            const myId = useProfileStore.getState().orgMembership?.memberId
            const event = meta?.event
            if (!event?.startsWith('video_call_')) return

            const named = {
              ...mapComment(row),
              author_name: get()._memberNameMap[row.author_member_id] || meta.started_by || meta.invited_by || null,
            }
            set(s => {
              if (!s.activeWorkspace || s.activeWorkspace.id !== workspaceId) return {}
              if (s.activeWorkspace.npd_comments?.some(c => c.id === named.id)) return {}
              return { activeWorkspace: { ...s.activeWorkspace, npd_comments: [...(s.activeWorkspace.npd_comments || []), named] } }
            }, false, 'plm/vcComment')

            if (event === 'video_call_ended') {
              set(s => ({
                incomingVideoCall: s.incomingVideoCall?.workspaceId === workspaceId ? null : s.incomingVideoCall,
                activeVideoCall: s.activeVideoCall?.workspaceId === workspaceId ? null : s.activeVideoCall,
                activeWorkspace: s.activeWorkspace?.id === workspaceId
                  ? { ...s.activeWorkspace, video_room_name: null, video_room_url: null }
                  : s.activeWorkspace,
              }), false, 'plm/vcEnded')
              return
            }

            if (row.author_member_id === myId) return

            const alreadyRinging = get().incomingVideoCall?.workspaceId === workspaceId
            if (playSound && !alreadyRinging) playIncomingCallSound()
            set({
              incomingVideoCall: {
                workspaceId,
                startedBy: row.author_member_id,
                startedByName: meta.started_by || meta.invited_by || 'Someone',
                isInvite: event === 'video_call_invited',
              },
            }, false, 'plm/incomingCall')
          }

          const channel = supabase
            .channel(`ws-chat:${workspaceId}`)
            .on('postgres_changes', {
              event: 'UPDATE', schema: 'public', table: 'npd2_workspaces', filter: `id=eq.${workspaceId}`
            }, () => {
              // Silently reload when workspace row changes (e.g. buyer/supplier accepts invite)
              get().openWorkspace(workspaceId, get().activeSku, { silent: true })
            })
            .on('postgres_changes', {
              event: 'INSERT', schema: 'public', table: 'npd2_comments', filter: `workspace_id=eq.${workspaceId}`,
            }, (payload) => {
              const row = payload.new
              if (!row || row.type !== 'milestone') return
              const meta = parseCommentMeta(row.metadata)
              if (meta.event?.startsWith('video_call_')) handleVideoCallMilestone(row, meta)
            })
            .on('broadcast', { event: 'video_call' }, ({ payload }) => {
              const myId = useProfileStore.getState().orgMembership?.memberId
              if (!payload || payload.workspaceId !== workspaceId || payload.memberId === myId) return
              if (get().incomingVideoCall?.workspaceId === workspaceId) return
              playIncomingCallSound()
              set({
                incomingVideoCall: {
                  workspaceId,
                  startedBy: payload.memberId,
                  startedByName: payload.userName || 'Someone',
                  isInvite: payload.action === 'invite',
                },
              }, false, 'plm/incomingCallBroadcast')
            })
            .on('broadcast', { event: 'comment' }, ({ payload }) => addComment(payload))
            .on('broadcast', { event: 'workspace_status' }, ({ payload }) => {
              set(s => {
                if (!s.activeWorkspace || s.activeWorkspace.id !== workspaceId) return {}
                return {
                  activeWorkspace: { ...s.activeWorkspace, status: payload.status },
                  skus: s.skus.map(sk => sk.workspace_id === workspaceId ? { ...sk, workspace_status: payload.status } : sk),
                }
              }, false, 'plm/wsStatusUpdate')
              // 'approved' creates a new sample order on the backend — silent reload to fetch it
              if (payload.status === 'approved') {
                get().openWorkspace(workspaceId, get().activeSku, { silent: true })
              }
            })
            .on('broadcast', { event: 'sample_order' }, ({ payload }) => {
              set(s => {
                if (!s.activeWorkspace || s.activeWorkspace.id !== workspaceId) return {}
                return { activeWorkspace: { ...s.activeWorkspace, sampleOrder: payload } }
              }, false, 'plm/sampleOrderLive')
            })
            .on('broadcast', { event: 'buyer_brief' }, ({ payload }) => {
              set(s => {
                if (!s.activeWorkspace || s.activeWorkspace.id !== workspaceId) return {}
                return { activeWorkspace: { ...s.activeWorkspace, buyer_ref: payload.buyer_ref, buyer_brief: payload.buyer_brief } }
              }, false, 'plm/buyerBriefLive')
            })
            .on('broadcast', { event: 'sku_update' }, ({ payload }) => {
              set(s => {
                if (!s.activeSku || s.activeSku.id !== payload.id) return {}
                const activeSku = { ...s.activeSku, ...payload.fields }
                const skus = s.skus.map(sk => sk.id === payload.id ? { ...sk, ...payload.fields } : sk)
                return { activeSku, skus }
              }, false, 'plm/skuUpdateLive')
            })
            .subscribe()

          // Restore incoming-call banner if user opens workspace mid-call
          let incomingRestore = null
          if (workspace?.video_room_name && !get().activeVideoCall) {
            const myId = useProfileStore.getState().orgMembership?.memberId
            const lastStart = [...(workspace.npd_comments || [])].reverse()
              .find(c => c.metadata?.event === 'video_call_started')
            if (lastStart?.author_member_id && lastStart.author_member_id !== myId) {
              incomingRestore = {
                workspaceId,
                startedBy: lastStart.author_member_id,
                startedByName: lastStart.metadata?.started_by || 'Someone',
                isInvite: false,
              }
            }
          }

          set(s => ({
            // In silent mode activeSku is already set — only update if resolved
            ...((!silent || resolvedSku) && { activeSku: resolvedSku }),
            activeWorkspace:  workspace,
            workspaceLoading: false,
            _realtimeChannel: channel,
            _memberNameMap:   memberNameMap,
            ...(incomingRestore && { incomingVideoCall: incomingRestore }),
            ...(workspace && {
              skus: s.skus.map(sk => sk.workspace_id === workspaceId ? {
                ...sk,
                workspace_status: workspace.status,
                buyer_ref:   workspace.buyer_ref   ?? sk.buyer_ref,
                buyer_brief: workspace.buyer_brief ?? sk.buyer_brief,
              } : sk),
            }),
          }), false, 'plm/wsLoaded')

          // Record that this member has seen this workspace
          const memberId = useProfileStore.getState().orgMembership?.memberId
          if (memberId) {
            supabase.from('workspace_last_seen').upsert(
              { member_id: memberId, workspace_id: workspaceId, seen_at: new Date().toISOString() },
              { onConflict: 'member_id,workspace_id' }
            ).then(({ error }) => {
              if (error) console.error('[last_seen] upsert failed:', error.message, error.details, error.hint)
            })
          }
        } catch {
          set({ workspaceLoading: false }, false, 'plm/wsError')
        }
      },

      closeWorkspace: () => {
        const ch = get()._realtimeChannel
        if (ch) supabase.removeChannel(ch)
        set({
          activeSku: null, activeWorkspaceId: null, activeWorkspace: null, workspaceLoading: false,
          _realtimeChannel: null, incomingVideoCall: null,
        }, false, 'plm/wsClose')
      },

      sendInvite: async (catalogSkuId, buyerEmail, supplierEmail, merchantId, orgIds = {}) => {
        const result = await api('POST', '/sku-workspaces', {
          catalogSkuId,
          merchantId,
          buyerEmail,
          supplierEmail:  supplierEmail || undefined,
          buyerOrgId:    orgIds.buyerOrgId    || undefined,
          supplierOrgId: orgIds.supplierOrgId || undefined,
        })
        return result
      },

      // Bulk: create N workspaces + N invite rows sharing one token → one email
      createWorkspacesBulk: async (skuIds, memberId, { buyerEmail, buyerOrgId, supplierEmail, supplierOrgId, skipInvites }) => {
        const result = await api('POST', '/sku-workspaces/bulk', {
          catalogSkuIds: skuIds,
          merchantId:    memberId,
          buyerEmail,
          ...(skipInvites   && { skipInvites: true }),
          ...(buyerOrgId    && { buyerOrgId }),
          ...(supplierEmail && { supplierEmail }),
          ...(supplierOrgId && { supplierOrgId }),
        })
        if (result.workspaces?.length) {
          set(s => ({
            skus: s.skus.map(sk => {
              const ws = result.workspaces.find(w => w.catalog_sku_id === sk.id)
              return ws ? { ...sk, workspace_id: ws.id, workspace_status: 'invited' } : sk
            })
          }), false, 'plm/createWorkspacesBulk')
        }
        return result
      },

      // Add the same invite across multiple existing workspaces in one request → one aggregated email
      addWorkspaceInvitesBulk: async (workspaceIds, email, role, orgId, skipEmail) => {
        const result = await api('POST', '/sku-workspaces/bulk-invite', {
          workspaceIds,
          email,
          role,
          orgId: orgId || undefined,
          skipEmail: skipEmail || undefined,
        })
        // Update activeWorkspace state if the open workspace is one of the ones just invited
        const activeId = get().activeWorkspace?.id
        if (result?.results && activeId && workspaceIds.includes(activeId)) {
          const sent = result.results.find(r => r.workspaceId === activeId && r.status === 'sent')
          if (sent) {
            const { data: newInv } = await supabase
              .from('npd2_invites')
              .select('id, email, role, status, member_id')
              .eq('workspace_id', activeId)
              .eq('email', email)
              .eq('role', role)
              .neq('status', 'revoked')
              .maybeSingle()
            if (newInv) {
              set(s => {
                if (!s.activeWorkspace || s.activeWorkspace.id !== activeId) return {}
                const listKey = role === 'buyer' ? 'buyer_invites' : 'supplier_invites'
                const already = (s.activeWorkspace[listKey] || []).some(i => i.id === newInv.id)
                if (already) return {}
                return { activeWorkspace: { ...s.activeWorkspace, [listKey]: [...(s.activeWorkspace[listKey] || []), newInv] } }
              }, false, 'plm/addInvitesBulk')
            }
          }
        }
        return result
      },

      // Fetch the shared invite token for a given email+role across a set of workspace IDs.
      // Bulk invites share one token across N workspaces, so any matching row gives the link.
      getWorkspaceInviteToken: async (workspaceIds, email, role) => {
        const now = new Date().toISOString()
        const { data } = await supabase
          .from('npd2_invites')
          .select('token')
          .in('workspace_id', workspaceIds)
          .eq('email', email)
          .eq('role', role)
          .eq('status', 'pending')
          .neq('status', 'revoked')
          .neq('status', 'expired')
          .or(`expires_at.is.null,expires_at.gt.${now}`)
          .limit(1)
        return data?.[0]?.token || null
      },

      // Check which of the given emails belong to an existing member of orgId —
      // used to warn merchants before inviting someone outside the intended org.
      verifyOrgMemberEmails: async (orgId, emails) => {
        if (!orgId || !emails?.length) return {}
        const { data } = await supabase
          .from('organization_members').select('email').eq('organization_id', orgId)
        const emailSet = new Set((data || []).map(m => (m.email || '').toLowerCase()))
        return Object.fromEntries(emails.map(e => [e, emailSet.has((e || '').toLowerCase())]))
      },

      // List registered members of an org — used to populate buyer/vendor invite
      // pickers so invites can only be sent to people already registered in that org.
      fetchOrgMembers: async (orgId) => {
        if (!orgId) return []
        const { data } = await supabase
          .from('organization_members').select('id, full_name, email')
          .eq('organization_id', orgId).not('email', 'is', null).order('full_name')
        return data || []
      },

      // Add invite to an existing workspace (buyer or supplier) without creating a new workspace
      addWorkspaceInvite: async (workspaceId, email, role, orgId) => {
        const result = await api('POST', `/sku-workspaces/${workspaceId}/invite`, { email, role, orgId: orgId || undefined })
        if (result?.status === 'sent') {
          const { data: newInv } = await supabase
            .from('npd2_invites')
            .select('id, email, role, status, member_id, expires_at')
            .eq('workspace_id', workspaceId)
            .eq('email', email)
            .neq('status', 'revoked')
            .maybeSingle()
          if (newInv) {
            set(s => {
              if (!s.activeWorkspace || s.activeWorkspace.id !== workspaceId) return {}
              const listKey = role === 'buyer' ? 'buyer_invites' : 'supplier_invites'
              // Replace by email (handles renewal case where old invite was deleted and new one created)
              const without = (s.activeWorkspace[listKey] || []).filter(i => i.email !== newInv.email)
              return { activeWorkspace: { ...s.activeWorkspace, [listKey]: [...without, newInv] } }
            }, false, 'plm/addInvite')
          }
        }
        return result
      },

      revokeInvite: async (workspaceId, inviteId) => {
        const result = await api('PATCH', `/sku-workspaces/${workspaceId}/invites/${inviteId}/revoke`)
        set(s => {
          if (!s.activeWorkspace || s.activeWorkspace.id !== workspaceId) return {}
          const listKey = result?.role === 'buyer' ? 'buyer_invites' : 'supplier_invites'
          return {
            activeWorkspace: {
              ...s.activeWorkspace,
              [listKey]: (s.activeWorkspace[listKey] || []).filter(inv => inv.id !== inviteId),
            },
          }
        }, false, 'plm/revokeInvite')
      },

      // Renders the message + its local file previews immediately, then uploads
      // in the background so the composer never blocks on network/upload time.
      sendComment: async (workspaceId, body, channel, files = [], replyTo = null) => {
        const membership = useProfileStore.getState().orgMembership
        const memberId = membership?.memberId
        const myName   = membership?.fullName || null
        // Store only the fields needed to render the quoted bubble
        const replyPayload = replyTo
          ? { id: replyTo.id, body: replyTo.body, author_name: replyTo.author_name, role: replyTo.role, quoted_thumb: replyTo.quoted_thumb || null }
          : null

        const tempId = `temp-${memberId || 'anon'}-${get()._tempCommentSeq || 0}`
        set(s => ({ _tempCommentSeq: (s._tempCommentSeq || 0) + 1 }), false, 'plm/tempSeq')

        const localAttachments = files.map(f => ({
          url: URL.createObjectURL(f), name: f.name, type: f.type, uploading: true,
        }))
        const optimistic = {
          id: tempId, body, channel, role: membership?.orgType || null,
          author_name: myName, created_at: new Date().toISOString(),
          attachments: localAttachments,
          reply_to: replyPayload ? JSON.stringify(replyPayload) : null,
          quoted: replyPayload?.body || null, quoted_author: replyPayload?.author_name || replyPayload?.role || null,
          quoted_id: replyPayload?.id || null, quoted_thumb: replyPayload?.quoted_thumb || null,
          _uploading: files.length > 0,
          _uploadPct: 0, _uploadedBytes: 0, _uploadTotalBytes: files.reduce((sum, f) => sum + f.size, 0),
          _retry: { body, channel, files, replyTo },
        }

        set(s => {
          if (!s.activeWorkspace || s.activeWorkspace.id !== workspaceId) return {}
          return {
            activeWorkspace: {
              ...s.activeWorkspace,
              npd_comments: [...(s.activeWorkspace.npd_comments || []), optimistic],
            },
          }
        }, false, 'plm/commentOptimistic')

        const revokeLocalUrls = () => localAttachments.forEach(a => URL.revokeObjectURL(a.url))
        const replaceTemp = (updater) => set(s => {
          if (!s.activeWorkspace || s.activeWorkspace.id !== workspaceId) return {}
          return {
            activeWorkspace: {
              ...s.activeWorkspace,
              npd_comments: (s.activeWorkspace.npd_comments || []).map(c => c.id === tempId ? updater(c) : c),
            },
          }
        }, false, 'plm/commentSettled')

        try {
          let result
          if (files && files.length > 0) {
            const fd = new FormData()
            fd.append('body', body)
            fd.append('memberId', memberId)
            fd.append('channel', channel)
            if (replyPayload) fd.append('reply_to', JSON.stringify(replyPayload))
            files.forEach(f => fd.append('files', f))
            let lastPct = -1
            result = await apiUpload(`/sku-workspaces/${workspaceId}/comments`, fd, (loaded, total) => {
              const pct = Math.round((loaded / total) * 100)
              if (pct === lastPct) return
              lastPct = pct
              replaceTemp(c => ({ ...c, _uploadedBytes: loaded, _uploadTotalBytes: total, _uploadPct: pct }))
            })
          } else {
            result = await api('POST', `/sku-workspaces/${workspaceId}/comments`, { body, memberId, channel, reply_to: replyPayload })
          }
          if (result?.comment) {
            const enriched = { ...mapComment(result.comment), author_name: myName }

            // Cache own name for incoming broadcast dedup path
            if (memberId && myName) {
              set(s => ({ _memberNameMap: { ...s._memberNameMap, [memberId]: myName } }), false, 'plm/cacheName')
            }

            replaceTemp(() => enriched)
            revokeLocalUrls()

            // Broadcast enriched comment (includes author_name) to other participants
            const ch = get()._realtimeChannel
            if (ch) ch.send({ type: 'broadcast', event: 'comment', payload: enriched })
          }
          return result
        } catch (err) {
          // Keep the local blob URLs alive so the failed bubble can still show what was attached
          replaceTemp(c => ({
            ...c, _uploading: false, _failed: true, _error: err.message,
            attachments: c.attachments.map(a => ({ ...a, uploading: false })),
          }))
          throw err
        }
      },

      // Re-sends a failed comment with its original body/files/reply — drops the failed
      // bubble first so retrying doesn't leave a duplicate on screen.
      retryComment: (workspaceId, tempId) => {
        const failed = (get().activeWorkspace?.npd_comments || []).find(c => c.id === tempId)
        if (!failed?._retry) return
        failed.attachments?.forEach(a => a.url?.startsWith('blob:') && URL.revokeObjectURL(a.url))
        set(s => {
          if (!s.activeWorkspace || s.activeWorkspace.id !== workspaceId) return {}
          return { activeWorkspace: { ...s.activeWorkspace, npd_comments: (s.activeWorkspace.npd_comments || []).filter(c => c.id !== tempId) } }
        }, false, 'plm/retryRemoveFailed')
        const { body, channel, files, replyTo } = failed._retry
        get().sendComment(workspaceId, body, channel, files, replyTo).catch(() => {})
      },

      removeFailedComment: (workspaceId, tempId) => {
        set(s => {
          if (!s.activeWorkspace || s.activeWorkspace.id !== workspaceId) return {}
          const target = (s.activeWorkspace.npd_comments || []).find(c => c.id === tempId)
          target?.attachments?.forEach(a => a.url?.startsWith('blob:') && URL.revokeObjectURL(a.url))
          return { activeWorkspace: { ...s.activeWorkspace, npd_comments: (s.activeWorkspace.npd_comments || []).filter(c => c.id !== tempId) } }
        }, false, 'plm/removeFailedComment')
      },

      // Sends only the image_url sub-field as a patch (not the whole brief) — same
      // merge-safe pattern as saveBrief, so pinning an image can't clobber a concurrent
      // editor's unrelated brief changes, and the server's response is authoritative.
      pinImage: async (workspaceId, imageUrl) => {
        const memberId = useProfileStore.getState().orgMembership?.memberId
        const result    = await api('PATCH', `/sku-workspaces/${workspaceId}`, { buyer_brief: { image_url: imageUrl ?? null }, memberId })
        const buyer_brief = result.workspace?.buyer_brief
        set(s => {
          if (!s.activeWorkspace || s.activeWorkspace.id !== workspaceId) return {}
          return { activeWorkspace: { ...s.activeWorkspace, buyer_brief } }
        }, false, 'plm/pinImage')
        const ch = get()._realtimeChannel
        if (ch) ch.send({ type: 'broadcast', event: 'buyer_brief', payload: { buyer_ref: get().activeWorkspace?.buyer_ref ?? null, buyer_brief } })
      },

      removeSpecImage: async (workspaceId, imageUrl) => {
        // Works whether or not the workspace is currently open in the modal
        const active = get().activeWorkspace
        let currentMedia
        if (active?.id === workspaceId) {
          currentMedia = active.reference_media || []
        } else {
          const { data } = await supabase
            .from('npd2_workspaces')
            .select('reference_media')
            .eq('id', workspaceId)
            .single()
          currentMedia = data?.reference_media || []
        }
        const updated = currentMedia.filter(img => img.url !== imageUrl)
        const { error } = await supabase
          .from('npd2_workspaces')
          .update({ reference_media: updated })
          .eq('id', workspaceId)
        if (error) throw error
        set(s => {
          if (!s.activeWorkspace || s.activeWorkspace.id !== workspaceId) return {}
          return { activeWorkspace: { ...s.activeWorkspace, reference_media: updated } }
        }, false, 'plm/removeSpecImage')
      },

      pruneSpecImages: async (workspaceId, keepUrls) => {
        const keepSet = new Set(keepUrls)
        const active  = get().activeWorkspace
        let currentMedia
        if (active?.id === workspaceId) {
          currentMedia = active.reference_media || []
        } else {
          const { data } = await supabase
            .from('npd2_workspaces')
            .select('reference_media')
            .eq('id', workspaceId)
            .single()
          currentMedia = data?.reference_media || []
        }
        const updated = currentMedia.filter(img => keepSet.has(img.url))
        const { error } = await supabase
          .from('npd2_workspaces')
          .update({ reference_media: updated })
          .eq('id', workspaceId)
        if (error) throw error
        set(s => {
          if (!s.activeWorkspace || s.activeWorkspace.id !== workspaceId) return {}
          return { activeWorkspace: { ...s.activeWorkspace, reference_media: updated } }
        }, false, 'plm/pruneSpecImages')
      },

      // Uploads an edited reference-media image. mode='copy' always appends a new
      // entry; mode='replace' overwrites the matching entry in place — the backend
      // silently falls back to 'copy' if replaceUrl is pinned as the buyer-brief or
      // product image, so a pinned original is never touched.
      saveReferenceMediaEdit: async (workspaceId, blob, { mode = 'copy', replaceUrl } = {}) => {
        const fd = new FormData()
        fd.append('image', blob, `edited-${Date.now()}.png`)
        fd.append('mode', mode)
        if (replaceUrl) fd.append('replaceUrl', replaceUrl)
        const json = await api('PATCH', `/sku-workspaces/${workspaceId}/reference-media`, null, fd)
        set(s => {
          if (!s.activeWorkspace || s.activeWorkspace.id !== workspaceId) return {}
          return { activeWorkspace: { ...s.activeWorkspace, reference_media: json.reference_media } }
        }, false, 'plm/saveReferenceMediaEdit')
        return json
      },

      setSkuImageFromUrl: async (skuId, imageUrl) => {
        const { image_url: newUrl } = await api('PATCH', `/catalog/skus/${skuId}/image-from-url`, { imageUrl })
        set(s => ({
          skus: s.skus.map(sk => sk.id === skuId ? { ...sk, image_url: imageUrl, image_processing: false } : sk),
          ...(s.activeSku?.id === skuId && { activeSku: { ...s.activeSku, image_url: imageUrl, image_processing: false } }),
          ...(s.activeWorkspace?.catalog_sku_id === skuId && { activeWorkspace: { ...s.activeWorkspace, image_url: imageUrl } }),
        }), false, 'plm/setSkuImageFromUrl')
      },

      // briefFieldsPatch should contain ONLY the sub-fields the user actually edited (a diff
      // against the brief as it was loaded), not the whole brief — the backend merges this
      // patch into whatever's currently saved, so a concurrent editor's already-saved changes
      // to fields this request didn't touch are preserved instead of silently reverted.
      saveBrief: async (workspaceId, briefFieldsPatch) => {
        const memberId = useProfileStore.getState().orgMembership?.memberId
        const { buyer_ref, ...rest } = briefFieldsPatch
        const preSave = get().activeWorkspace
        const knownIds = new Set(preSave?.id === workspaceId ? preSave.npd_comments.map(c => c.id) : [])
        const result = await api('PATCH', `/sku-workspaces/${workspaceId}`, { buyer_ref, buyer_brief: rest, memberId })
        const updatedWs = result.workspace || {}

        // Sync local state from the server's authoritative merged result, not a client-side
        // guess — the client only ever sent a partial patch, so it doesn't know the full brief.
        set(s => {
          if (!s.activeWorkspace || s.activeWorkspace.id !== workspaceId) return {}
          return {
            activeWorkspace: { ...s.activeWorkspace, buyer_ref: updatedWs.buyer_ref, buyer_brief: updatedWs.buyer_brief },
            skus: s.skus.map(sk => sk.workspace_id === workspaceId ? { ...sk, buyer_ref: updatedWs.buyer_ref, buyer_brief: updatedWs.buyer_brief } : sk),
          }
        }, false, 'plm/savedBrief')
        const finalBuyerRef   = updatedWs.buyer_ref
        const finalBuyerBrief = updatedWs.buyer_brief

        // Fetch field_change comments the backend just inserted and append any not already known
        const enriched = await fetchNewComments(workspaceId, 'field_change', knownIds, get()._memberNameMap)

        if (enriched.length) {
          set(s => {
            if (!s.activeWorkspace || s.activeWorkspace.id !== workspaceId) return {}
            const existing = new Set(s.activeWorkspace.npd_comments.map(c => c.id))
            const toAdd = enriched.filter(c => !existing.has(c.id))
            if (!toAdd.length) return {}
            return { activeWorkspace: { ...s.activeWorkspace, npd_comments: [...s.activeWorkspace.npd_comments, ...toAdd] } }
          }, false, 'plm/briefLogs')
          // Broadcast field_change comments + updated brief to other participants
          const ch = get()._realtimeChannel
          if (ch) {
            enriched.forEach(c => ch.send({ type: 'broadcast', event: 'comment', payload: c }))
            ch.send({ type: 'broadcast', event: 'buyer_brief', payload: { buyer_ref: finalBuyerRef, buyer_brief: finalBuyerBrief } })
          }
        } else {
          // No field_change comments but still broadcast brief update
          const ch = get()._realtimeChannel
          if (ch) ch.send({ type: 'broadcast', event: 'buyer_brief', payload: { buyer_ref: finalBuyerRef, buyer_brief: finalBuyerBrief } })
        }
      },

      // Previous rounds of sample findings — snapshotted server-side on reject/revision/resume.
      // Powers the "View Previous Findings" dropdown in the Sample tab.
      fetchSampleVersions: async (workspaceId) => {
        const result = await api('GET', `/sku-workspaces/${workspaceId}/sample-versions`)
        return result.versions || []
      },

      // `findings` should contain only the sub-fields actually changed since load (a partial
      // patch) — the backend merges it into whatever's currently saved, so it never wipes out
      // fields this request didn't touch.
      saveSampleFindings: async (orderId, workspaceId, findings) => {
        const memberId   = useProfileStore.getState().orgMembership?.memberId
        const role       = useProfileStore.getState().orgMembership?.orgType || 'merchant'
        const preSave    = get().activeWorkspace
        const knownIds   = new Set(preSave?.id === workspaceId ? preSave.npd_comments.map(c => c.id) : [])
        const result     = await api('PATCH', `/sku-sample-orders/${orderId}`, { memberId, role, findings })
        set(s => {
          if (!s.activeWorkspace || s.activeWorkspace.id !== workspaceId) return {}
          return { activeWorkspace: { ...s.activeWorkspace, sampleOrder: result.sampleOrder } }
        }, false, 'plm/findingsSaved')
        // Without this, the other party's already-open workspace never sees findings changes
        // (including the approved/production image pick) until they close and reopen it.
        const findingsCh = get()._realtimeChannel
        if (findingsCh && result.sampleOrder) findingsCh.send({ type: 'broadcast', event: 'sample_order', payload: result.sampleOrder })

        // field_change/milestone comments for what changed are now logged server-side by the
        // PATCH /sku-sample-orders/:id handler itself (grouped per UI row, e.g. one "Actual
        // L×W×H" line instead of three) — the postgres_changes subscription on npd2_comments
        // picks those up automatically, so this used to also insert its own separate, ungrouped
        // set of field_change rows directly into Supabase, which just produced duplicates.

        const milestoneEnriched = await fetchNewComments(workspaceId, ['milestone', 'field_change'], knownIds, get()._memberNameMap)

        if (milestoneEnriched.length) {
          set(s => {
            if (!s.activeWorkspace || s.activeWorkspace.id !== workspaceId) return {}
            const existing = new Set(s.activeWorkspace.npd_comments.map(c => c.id))
            const toAdd    = milestoneEnriched.filter(c => !existing.has(c.id))
            if (!toAdd.length) return {}
            return { activeWorkspace: { ...s.activeWorkspace, npd_comments: [...s.activeWorkspace.npd_comments, ...toAdd] } }
          }, false, 'plm/findingsMilestone')
          const channel = get()._realtimeChannel
          if (channel) milestoneEnriched.forEach(c => channel.send({ type: 'broadcast', event: 'comment', payload: c }))
        }
        // Broadcast updated sample order so other participants see findings instantly
        const ch = get()._realtimeChannel
        if (ch && result.sampleOrder) ch.send({ type: 'broadcast', event: 'sample_order', payload: result.sampleOrder })
      },

      uploadSampleImages: async (orderId, workspaceId, files) => {
        const memberId = useProfileStore.getState().orgMembership?.memberId
        const formData = new FormData()
        files.forEach(f => formData.append('images', f))
        formData.append('workspaceId', workspaceId)
        formData.append('memberId', memberId || '')
        const result = await api('POST', `/sku-sample-orders/${orderId}/images`, null, formData)
        const newUrls = result.urls || []
        set(s => {
          if (!s.activeWorkspace || s.activeWorkspace.id !== workspaceId) return {}
          const so = s.activeWorkspace.sampleOrder
          const existing = so?.findings?.sample_images || []
          const sampleOrder = {
            ...so,
            findings: { ...(so?.findings || {}), sample_images: [...existing, ...newUrls] },
          }
          return { activeWorkspace: { ...s.activeWorkspace, sampleOrder } }
        }, false, 'plm/imagesUploaded')
        const ch = get()._realtimeChannel
        const updatedOrder = get().activeWorkspace?.sampleOrder
        if (ch && updatedOrder) ch.send({ type: 'broadcast', event: 'sample_order', payload: updatedOrder })
        return newUrls
      },

      updateSampleOrder: async (orderId, workspaceId, updates) => {
        const memberId = useProfileStore.getState().orgMembership?.memberId
        const role     = useProfileStore.getState().orgMembership?.orgType || 'merchant'
        const preSave  = get().activeWorkspace
        const knownIds = new Set(preSave?.id === workspaceId ? preSave.npd_comments.map(c => c.id) : [])
        const result   = await api('PATCH', `/sku-sample-orders/${orderId}`, { memberId, role, ...updates })

        set(s => {
          if (!s.activeWorkspace || s.activeWorkspace.id !== workspaceId) return {}
          return { activeWorkspace: { ...s.activeWorkspace, sampleOrder: result.sampleOrder } }
        }, false, 'plm/sampleOrderUpdate')

        // Fetch and append any new comments the backend just inserted (milestone + field_change)
        {
          // Broadcast the updated sample order unconditionally — must not depend on whether
        // the comment fetch below happens to find anything (see rejectSample/setHoldDropStatus:
        // nesting this inside "if comments found" left the other party's screen stale whenever
        // that fetch came back empty, even though the update itself succeeded).
        const sampleOrderCh = get()._realtimeChannel
        if (sampleOrderCh && result.sampleOrder) sampleOrderCh.send({ type: 'broadcast', event: 'sample_order', payload: result.sampleOrder })

        const enriched = await fetchNewComments(workspaceId, ['milestone', 'field_change'], knownIds, get()._memberNameMap)

          if (enriched.length) {
            set(s => {
              if (!s.activeWorkspace || s.activeWorkspace.id !== workspaceId) return {}
              const existing = new Set(s.activeWorkspace.npd_comments.map(c => c.id))
              const toAdd = enriched.filter(c => !existing.has(c.id))
              if (!toAdd.length) return {}
              return { activeWorkspace: { ...s.activeWorkspace, npd_comments: [...s.activeWorkspace.npd_comments, ...toAdd] } }
            }, false, 'plm/sampleMilestone')

            const channel = get()._realtimeChannel
            if (channel) enriched.forEach(c => channel.send({ type: 'broadcast', event: 'comment', payload: c }))
          }
        }
      },

      createSamplePO: async (workspaceIds, poNumber, amount_usd) => {
        const memberId = useProfileStore.getState().orgMembership?.memberId
        const result   = await api('POST', '/purchase-orders/sample', { workspaceIds, poNumber, memberId, amount_usd })
        return { po: result.po, fileUrl: result.fileUrl }
      },

      setHoldDropStatus: async (orderId, workspaceId, status, note) => {
        const preSave  = get().activeWorkspace
        const knownIds = new Set(preSave?.id === workspaceId ? preSave.npd_comments.map(c => c.id) : [])
        await api('PATCH', `/sku-workspaces/${workspaceId}/sample-hold`, { status, note })

        // Backend returns { success } only — no comment row — so update local state
        // ourselves and fetch the milestone comment it just inserted.
        set(s => {
          if (!s.activeWorkspace || s.activeWorkspace.id !== workspaceId) return {}
          return {
            activeWorkspace: {
              ...s.activeWorkspace,
              sampleOrder: s.activeWorkspace.sampleOrder
                ? { ...s.activeWorkspace.sampleOrder, sample_status: status }
                : s.activeWorkspace.sampleOrder,
            },
          }
        }, false, 'plm/holdDrop')

        // Broadcast unconditionally — see updateSampleOrder for why this can't be nested
        // inside the comment-fetch result below.
        const holdDropCh = get()._realtimeChannel
        const holdDropOrder = get().activeWorkspace?.sampleOrder
        if (holdDropCh && holdDropOrder) holdDropCh.send({ type: 'broadcast', event: 'sample_order', payload: holdDropOrder })

        const enriched = await fetchNewComments(workspaceId, 'milestone', knownIds, get()._memberNameMap)

        if (enriched.length) {
          set(s => {
            if (!s.activeWorkspace || s.activeWorkspace.id !== workspaceId) return {}
            const existing = new Set(s.activeWorkspace.npd_comments.map(c => c.id))
            const toAdd    = enriched.filter(c => !existing.has(c.id))
            if (!toAdd.length) return {}
            return { activeWorkspace: { ...s.activeWorkspace, npd_comments: [...s.activeWorkspace.npd_comments, ...toAdd] } }
          }, false, 'plm/holdDropComment')

          const channel = get()._realtimeChannel
          if (channel) enriched.forEach(c => channel.send({ type: 'broadcast', event: 'comment', payload: c }))
        }
      },

      rejectSample: async (workspaceId, note) => {
        const preSave  = get().activeWorkspace
        const knownIds = new Set(preSave?.id === workspaceId ? preSave.npd_comments.map(c => c.id) : [])
        await api('POST', `/sku-workspaces/${workspaceId}/reject-sample`, { note })

        // Backend returns { success, version } only — no comment/sample-order row — so update
        // local state ourselves and fetch the milestone comment it just inserted.
        set(s => {
          if (!s.activeWorkspace || s.activeWorkspace.id !== workspaceId) return {}
          return {
            activeWorkspace: {
              ...s.activeWorkspace,
              sampleOrder: s.activeWorkspace.sampleOrder
                ? { ...s.activeWorkspace.sampleOrder, sample_status: 'dropped' }
                : s.activeWorkspace.sampleOrder,
            },
          }
        }, false, 'plm/sampleRejected')

        // Without this, the other party's already-open workspace only ever sees the rejection
        // as a chat comment — their local sample_status stays stale until they reopen it.
        const rejectCh = get()._realtimeChannel
        const rejectedOrder = get().activeWorkspace?.sampleOrder
        if (rejectCh && rejectedOrder) rejectCh.send({ type: 'broadcast', event: 'sample_order', payload: rejectedOrder })

        const enriched = await fetchNewComments(workspaceId, 'milestone', knownIds, get()._memberNameMap)

        if (enriched.length) {
          set(s => {
            if (!s.activeWorkspace || s.activeWorkspace.id !== workspaceId) return {}
            const existing = new Set(s.activeWorkspace.npd_comments.map(c => c.id))
            const toAdd    = enriched.filter(c => !existing.has(c.id))
            if (!toAdd.length) return {}
            return { activeWorkspace: { ...s.activeWorkspace, npd_comments: [...s.activeWorkspace.npd_comments, ...toAdd] } }
          }, false, 'plm/rejectComment')
          const channel = get()._realtimeChannel
          if (channel) enriched.forEach(c => channel.send({ type: 'broadcast', event: 'comment', payload: c }))
        }
      },

      requestRevision: async (workspaceId, note) => {
        const memberId = useProfileStore.getState().orgMembership?.memberId
        const preSave  = get().activeWorkspace
        const knownIds = new Set(preSave?.id === workspaceId ? preSave.npd_comments.map(c => c.id) : [])
        await api('POST', `/sku-workspaces/${workspaceId}/revision`, { memberId, note })
        set(s => {
          if (!s.activeWorkspace || s.activeWorkspace.id !== workspaceId) return {}
          return {
            activeWorkspace: { ...s.activeWorkspace, status: 'active' },
            skus: s.skus.map(sk => sk.workspace_id === workspaceId ? { ...sk, workspace_status: 'active' } : sk),
          }
        }, false, 'plm/revisionRequested')
        const enriched = await fetchNewComments(workspaceId, 'milestone', knownIds, get()._memberNameMap)
        if (enriched.length) {
          set(s => {
            if (!s.activeWorkspace || s.activeWorkspace.id !== workspaceId) return {}
            const existing = new Set(s.activeWorkspace.npd_comments.map(c => c.id))
            const toAdd    = enriched.filter(c => !existing.has(c.id))
            if (!toAdd.length) return {}
            return { activeWorkspace: { ...s.activeWorkspace, npd_comments: [...s.activeWorkspace.npd_comments, ...toAdd] } }
          }, false, 'plm/revisionComment')
          const channel = get()._realtimeChannel
          if (channel) {
            channel.send({ type: 'broadcast', event: 'workspace_status', payload: { status: 'active' } })
            enriched.forEach(c => channel.send({ type: 'broadcast', event: 'comment', payload: c }))
          }
        }
      },

      acceptSample: async (workspaceId) => {
        const memberId = useProfileStore.getState().orgMembership?.memberId
        const preSave  = get().activeWorkspace
        const knownIds = new Set(preSave?.id === workspaceId ? preSave.npd_comments.map(c => c.id) : [])
        await api('POST', `/sku-workspaces/${workspaceId}/accept-sample`, { memberId })
        set(s => {
          if (!s.activeWorkspace || s.activeWorkspace.id !== workspaceId) return {}
          return {
            activeWorkspace: { ...s.activeWorkspace, status: 'sample' },
            skus: s.skus.map(sk => sk.workspace_id === workspaceId ? { ...sk, workspace_status: 'sample' } : sk),
          }
        }, false, 'plm/sampleAccepted')
        const enriched = await fetchNewComments(workspaceId, 'milestone', knownIds, get()._memberNameMap)
        if (enriched.length) {
          set(s => {
            if (!s.activeWorkspace || s.activeWorkspace.id !== workspaceId) return {}
            const existing = new Set(s.activeWorkspace.npd_comments.map(c => c.id))
            const toAdd    = enriched.filter(c => !existing.has(c.id))
            if (!toAdd.length) return {}
            return { activeWorkspace: { ...s.activeWorkspace, npd_comments: [...s.activeWorkspace.npd_comments, ...toAdd] } }
          }, false, 'plm/acceptComment')
          const channel = get()._realtimeChannel
          if (channel) {
            channel.send({ type: 'broadcast', event: 'workspace_status', payload: { status: 'sample' } })
            enriched.forEach(c => channel.send({ type: 'broadcast', event: 'comment', payload: c }))
          }
        }
      },

      approveWorkspace: async (workspaceId, { confirmedPrice, confirmedQty, confirmedCurrency, confirmedAmountUsd }) => {
        const memberId = useProfileStore.getState().orgMembership?.memberId
        await api('POST', `/sku-workspaces/${workspaceId}/approve`, {
          confirmedPrice: Number(confirmedPrice),
          confirmedQty:   Number(confirmedQty),
          confirmedCurrency,
          confirmedAmountUsd: confirmedAmountUsd != null ? Number(confirmedAmountUsd) : null,
          memberId,
        })
        const activeSku = get().activeSku
        await get().openWorkspace(workspaceId, activeSku, { silent: true })

        // Broadcast so other participants (merchant/supplier) update without reload
        const channel = get()._realtimeChannel
        if (channel) {
          channel.send({ type: 'broadcast', event: 'workspace_status', payload: { status: 'approved' } })
          const milestone = [...(get().activeWorkspace?.npd_comments || [])].reverse().find(c => c.type === 'milestone')
          if (milestone) channel.send({ type: 'broadcast', event: 'comment', payload: milestone })
        }
      },

      // ── Video calls ───────────────────────────────────────────────────────────
      dismissIncomingCall: () =>
        set({ incomingVideoCall: null }, false, 'plm/dismissCall'),

      startVideoCall: async (workspaceId, memberId, userName) => {
        set({ videoCallConnecting: workspaceId }, false, 'plm/vcConnecting')
        try {
          const session = useAuthStore.getState().session
          const res = await fetch(`${API_BASE}/plm/sku-workspaces/${workspaceId}/video-call`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
            body: JSON.stringify({ memberId, userName }),
          })
          const data = await res.json().catch(() => ({}))
          if (!res.ok) throw new Error(data.error || `Server error ${res.status}`)

          set({
            activeVideoCall: { workspaceId, roomUrl: data.roomUrl, token: data.token },
            incomingVideoCall: null,
            videoCallConnecting: null,
          }, false, 'plm/vcActive')

          if (data.roomName) {
            set(s => s.activeWorkspace?.id === workspaceId
              ? { activeWorkspace: { ...s.activeWorkspace, video_room_name: data.roomName, video_room_url: data.roomUrl } }
              : {}, false, 'plm/vcRoomActive')
          }

          if (data.created && data.comment) {
            const enriched = { ...mapComment(data.comment), author_name: userName }
            set(s => {
              if (!s.activeWorkspace || s.activeWorkspace.id !== workspaceId) return {}
              if (s.activeWorkspace.npd_comments?.some(c => c.id === enriched.id)) return {}
              return { activeWorkspace: { ...s.activeWorkspace, npd_comments: [...(s.activeWorkspace.npd_comments || []), enriched] } }
            }, false, 'plm/vcStartComment')
          }

          const ch = get()._realtimeChannel
          if (ch && data.created) {
            ch.send({ type: 'broadcast', event: 'video_call', payload: { action: 'started', memberId, userName, workspaceId } })
          }
          return data
        } catch (err) {
          set({ videoCallConnecting: null }, false, 'plm/vcError')
          throw err
        }
      },

      joinVideoCall: (workspaceId, memberId, userName) =>
        get().startVideoCall(workspaceId, memberId, userName),

      endVideoCall: async (workspaceId, memberId) => {
        try {
          const session = useAuthStore.getState().session
          await fetch(`${API_BASE}/plm/sku-workspaces/${workspaceId}/video-call/end`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
            body: JSON.stringify({ memberId }),
          })
        } catch { /* best-effort */ }
        set({
          activeVideoCall: null,
          incomingVideoCall: null,
        }, false, 'plm/vcEnd')
        set(s => s.activeWorkspace?.id === workspaceId
          ? { activeWorkspace: { ...s.activeWorkspace, video_room_name: null, video_room_url: null } }
          : {}, false, 'plm/vcRoomClear')
      },

      inviteToVideoCall: async (workspaceId, memberId, userName, targetMemberIds, emails) => {
        const session = useAuthStore.getState().session
        const res = await fetch(`${API_BASE}/plm/sku-workspaces/${workspaceId}/video-call/invite`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
          body: JSON.stringify({ memberId, userName, targetMemberIds, emails }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || `Server error ${res.status}`)

        if (data.comment) {
          const enriched = { ...mapComment(data.comment), author_name: userName }
          set(s => {
            if (!s.activeWorkspace || s.activeWorkspace.id !== workspaceId) return {}
            if (s.activeWorkspace.npd_comments?.some(c => c.id === enriched.id)) return {}
            return { activeWorkspace: { ...s.activeWorkspace, npd_comments: [...(s.activeWorkspace.npd_comments || []), enriched] } }
          }, false, 'plm/vcInviteComment')
        }

        const ch = get()._realtimeChannel
        if (ch) {
          ch.send({ type: 'broadcast', event: 'video_call', payload: { action: 'invite', memberId, userName, workspaceId } })
          if (data.comment) {
            ch.send({ type: 'broadcast', event: 'comment', payload: { ...mapComment(data.comment), author_name: userName } })
          }
        }
        return data
      },

      // ── Upload ────────────────────────────────────────────────────────────────
      uploadCatalog: async (formData) => {
        const result = await api('POST', '/supplier-catalog/upload', null, formData)
        return result
      },

      uploadBuyerSpec: async (formData) => {
        const result = await api('POST', '/buyer-spec/upload', null, formData)
        return result
      },

    }),
    { name: 'PLM Store' }
  )
)
