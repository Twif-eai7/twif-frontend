import { useState, Fragment } from 'react'
import { usePlmAdminWorkspaces, usePlmAdminOrgRelationships, usePlmAdminAdmins, usePlmAdminAuditLog,
  usePlmAdminPermissions, usePlmAdminActions, usePlmAdminMembers, usePlmAdminOrganizations, usePlmAdminInvites } from '../../hooks/usePlmAdmin'
import { Badge, EmptyState, TableSkeleton, SearchableSelect, MultiSearchableSelect } from '../admin/AdminUi'
import { STATUS_LABELS, STATUS_COLORS } from '../../stores/plmStore'

// Workspace-status pill using the exact same colours as the PLM catalog SKU cards and the
// WorkspaceModal header (STATUS_COLORS / STATUS_LABELS), so a status reads identically here.
function PlmStatusBadge({ status }) {
  const style = STATUS_COLORS[status] || 'bg-stone-100 text-stone-600'
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium ${style}`}>
      {STATUS_LABELS[status] || status || 'Unknown'}
    </span>
  )
}

// Shared tab bodies for the PLM Security console — rendered both from the standalone
// /admin/plm-security page (AdminShell-wrapped, reachable by Admin-tier members who
// aren't necessarily tech-dept) and from the in-app "Super Admin Mode" modal opened
// from PLMTopBar (tech-dept Super Admins only). Kept in one place so the two entry
// points can't drift out of sync.

// Tabs stay mounted once visited (see PLMSecurityPage.jsx) instead of refetching on
// every switch, so each tab needs its own way to pull latest state on demand — there's
// no realtime subscription on this admin data, unlike PLM workspace comments/activity.
export function RefreshButton({ onClick, loading }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="text-xs font-medium text-stone-500 hover:text-stone-900 transition-colors disabled:opacity-50"
    >
      {loading ? 'Refreshing…' : 'Refresh'}
    </button>
  )
}

export const memberLabel = (m) => m.full_name || m.email || ''
export const orgLabel = (o) => o.display_name || o.name || ''
// Sorts a copy ascending by label — every member/org dropdown here goes through this
// rather than trusting fetch order, since merging two already-sorted lists (e.g.
// buyer + supplier members) doesn't stay sorted.
export function sortedBy(list, labelFn) {
  return [...list].sort((a, b) => labelFn(a).localeCompare(labelFn(b), undefined, { sensitivity: 'base' }))
}

// ─── Relationships: which merchant member handles which buyer/supplier org ───
export function RelationshipsTab({ tier, notify }) {
  const { data, loading, refresh } = usePlmAdminOrgRelationships()
  // merchant_member_id is always a merchandising-dept merchant member — they're the ones
  // who actually own buyer/supplier relationships in this app (see CLAUDE.md: PLM has
  // its own department gate, only merchandising members edit it). Scoped server-side
  // rather than fetching everyone and filtering client-side.
  const { data: merchantMembers, loading: membersLoading } = usePlmAdminMembers({ type: 'merchant', department: 'merchandising' })
  const { data: orgs, loading: orgsLoading } = usePlmAdminOrganizations()
  // The table below resolves ids to names via these two lookups, fetched independently
  // of the relationships list itself — on a fresh mount (e.g. navigating back to this
  // page) they can resolve at different times, so without this the table would briefly
  // render raw uuids before flashing to real names once the lookups catch up.
  const listReady = !loading && !membersLoading && !orgsLoading
  const actions = usePlmAdminActions()
  const [form, setForm] = useState({ merchant_member_id: '', buyer_org_id: '', supplier_org_id: '' })
  const [saving, setSaving] = useState(false)

  const byId = (list) => Object.fromEntries(list.map(x => [x.id, x]))
  const membersById = byId(merchantMembers)
  const orgsById = byId(orgs)

  async function submit() {
    if (!form.merchant_member_id || (!form.buyer_org_id && !form.supplier_org_id)) {
      notify('Pick a merchant member and at least one org'); return
    }
    setSaving(true)
    try {
      await actions.setOrgRelationship({
        merchant_member_id: form.merchant_member_id,
        buyer_org_id: form.buyer_org_id || null,
        supplier_org_id: form.supplier_org_id || null,
      })
      setForm({ merchant_member_id: '', buyer_org_id: '', supplier_org_id: '' })
      notify('Relationship saved')
      refresh()
    } catch (err) { notify(err.message) } finally { setSaving(false) }
  }

  async function remove(id) {
    try { await actions.removeOrgRelationship(id); notify('Removed'); refresh() }
    catch (err) { notify(err.message) }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <RefreshButton loading={loading} onClick={() => refresh()} />
      </div>
      {tier === 'super_admin' && (
        <div className="bg-white border border-stone-200 rounded-xl p-5 flex flex-wrap items-end gap-3">
          <div className="w-56">
            <Field label="Merchant member">
              <SearchableSelect
                options={sortedBy(merchantMembers, memberLabel).map(m => ({ value: m.id, label: memberLabel(m) }))}
                value={form.merchant_member_id}
                onChange={(id) => setForm(f => ({ ...f, merchant_member_id: id }))}
                placeholder="Select…"
              />
            </Field>
          </div>
          <div className="w-56">
            <Field label="Buyer org">
              <SearchableSelect
                options={sortedBy(orgs.filter(o => o.type === 'buyer'), orgLabel).map(o => ({ value: o.id, label: orgLabel(o) }))}
                value={form.buyer_org_id}
                onChange={(id) => setForm(f => ({ ...f, buyer_org_id: id }))}
                placeholder="None"
              />
            </Field>
          </div>
          <div className="w-56">
            <Field label="Supplier org">
              <SearchableSelect
                options={sortedBy(orgs.filter(o => o.type === 'supplier'), orgLabel).map(o => ({ value: o.id, label: orgLabel(o) }))}
                value={form.supplier_org_id}
                onChange={(id) => setForm(f => ({ ...f, supplier_org_id: id }))}
                placeholder="None"
              />
            </Field>
          </div>
          <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm font-medium bg-stone-900 text-white rounded-lg hover:bg-stone-700 transition-colors disabled:opacity-50">Assign</button>
        </div>
      )}

      {!listReady ? <TableSkeleton /> : !data.length ? (
        <EmptyState title="No relationships yet" subtitle="Assign a merchant member to a buyer or supplier org above." />
      ) : (
        <Table headers={['Merchant', 'Buyer org', 'Supplier org', 'Created', '']}>
          {data.map(r => (
            <tr key={r.id} className="border-t border-stone-100">
              <Td>{membersById[r.merchant_member_id]?.full_name || shortId(r.merchant_member_id)}</Td>
              <Td>{r.buyer_org_id ? (orgsById[r.buyer_org_id]?.display_name || shortId(r.buyer_org_id)) : '—'}</Td>
              <Td>{r.supplier_org_id ? (orgsById[r.supplier_org_id]?.display_name || shortId(r.supplier_org_id)) : '—'}</Td>
              <Td>{new Date(r.created_at).toLocaleDateString()}</Td>
              <Td>{tier === 'super_admin' && <button onClick={() => remove(r.id)} className="text-xs font-medium text-red-600 hover:text-red-700 transition-colors">Remove</button>}</Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  )
}

// ─── Permissions: per-workspace view/comment/edit grants ───
export function PermissionsTab({ tier, notify }) {
  const [workspaceId, setWorkspaceId] = useState('')
  const { data, loading, refresh } = usePlmAdminPermissions(workspaceId || undefined)
  const { data: workspaces } = usePlmAdminWorkspaces()
  const ws = workspaces.find(w => w.id === workspaceId)
  // Only merchandising-dept merchant members are grantable here — they're the ones who can
  // actually open /plm at all (the module's own department gate). Buyers/suppliers already
  // reach a shared workspace through their org's normal role, so listing every member of
  // every org/department (incl. erp/it/qa/logistics who have no PLM access) was just noise.
  const { data: pickableMembers } = usePlmAdminMembers({ type: 'merchant', department: 'merchandising' })
  const actions = usePlmAdminActions()
  const [form, setForm] = useState({ member_ids: [], capability: 'view' })
  const [saving, setSaving] = useState(false)
  const membersById = Object.fromEntries(pickableMembers.map(m => [m.id, m]))

  async function submit() {
    if (!workspaceId || !form.member_ids.length) { notify('Pick a SKU and at least one member'); return }
    setSaving(true)
    try {
      // One grant per selected person — the backend endpoint is a per-member upsert, so
      // granting several people the same capability in one action is just N calls.
      await Promise.all(form.member_ids.map(member_id =>
        actions.grantPermission({ workspace_id: workspaceId, member_id, capability: form.capability })
      ))
      notify(`Permission granted to ${form.member_ids.length} member${form.member_ids.length === 1 ? '' : 's'}`)
      setForm(f => ({ ...f, member_ids: [] }))
      refresh()
    } catch (err) { notify(err.message) } finally { setSaving(false) }
  }

  async function revoke(id) {
    try { await actions.revokePermission(id); notify('Revoked'); refresh() }
    catch (err) { notify(err.message) }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <RefreshButton loading={loading} onClick={() => refresh()} />
      </div>
      <div className="bg-white border border-stone-200 rounded-xl p-5 flex flex-wrap items-end gap-3">
        <div className="w-64">
          <Field label="SKU / workspace">
            <SearchableSelect
              options={sortedBy(workspaces, w => w.npd2_catalog_skus?.auto_code || w.id)
                .map(w => ({ value: w.id, label: `${w.npd2_catalog_skus?.auto_code || 'No SKU'} · ${w.status || 'unknown'}` }))}
              value={workspaceId}
              onChange={setWorkspaceId}
              placeholder="Search by SKU number…"
            />
          </Field>
        </div>
        <div className="w-64">
          <Field label="Member(s)">
            <MultiSearchableSelect
              options={sortedBy(pickableMembers, memberLabel).map(m => ({ value: m.id, label: memberLabel(m) }))}
              values={form.member_ids}
              onChange={(ids) => setForm(f => ({ ...f, member_ids: ids }))}
              placeholder={ws ? 'Select one or more…' : 'Pick a SKU first'}
              disabled={!ws}
            />
          </Field>
        </div>
        <Field label="Capability">
          <select className="border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-300" value={form.capability} onChange={e => setForm(f => ({ ...f, capability: e.target.value }))}>
            <option value="view">View</option>
            <option value="comment">Comment</option>
            <option value="edit">Edit</option>
          </select>
        </Field>
        <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm font-medium bg-stone-900 text-white rounded-lg hover:bg-stone-700 transition-colors disabled:opacity-50">Grant</button>
      </div>

      {loading ? <TableSkeleton /> : !data.length ? (
        <EmptyState title="No grants" subtitle={workspaceId ? 'No grants on this SKU\'s workspace yet.' : 'Pick a SKU above to filter, or view all grants in your scope.'} />
      ) : (
        <Table headers={['SKU', 'Member', 'Capability', 'Granted', '']}>
          {data.map(g => (
            <tr key={g.id} className="border-t border-stone-100">
              <Td>{workspaces.find(w => w.id === g.workspace_id)?.npd2_catalog_skus?.auto_code || <span className="font-mono text-xs">{g.workspace_id}</span>}</Td>
              <Td>{membersById[g.member_id]?.full_name || g.member_id}</Td>
              <Td><Badge label={g.capability} /></Td>
              <Td>{new Date(g.created_at).toLocaleDateString()}</Td>
              <Td><button onClick={() => revoke(g.id)} className="text-xs font-medium text-red-600 hover:text-red-700 transition-colors">Revoke</button></Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  )
}

// ─── Admins: promote/demote Admin-tier members ───
export function AdminsTab({ notify }) {
  const { data, loading, refresh } = usePlmAdminAdmins()
  // Only merchandising-dept merchant members are promotable — Admin-tier manages PLM, so the
  // person has to be a PLM user in the first place. (Tech-dept are already the Super Admins.)
  const { data: merchantMembers } = usePlmAdminMembers({ type: 'merchant', department: 'merchandising' })
  const actions = usePlmAdminActions()
  const [memberId, setMemberId] = useState('')
  const [saving, setSaving] = useState(false)
  const membersById = Object.fromEntries(merchantMembers.map(m => [m.id, m]))

  async function promote() {
    if (!memberId) { notify('Pick a member'); return }
    setSaving(true)
    try { await actions.promoteAdmin(memberId); setMemberId(''); notify('Promoted to Admin'); refresh() }
    catch (err) { notify(err.message) } finally { setSaving(false) }
  }

  async function demote(id) {
    try { await actions.demoteAdmin(id); notify('Demoted'); refresh() }
    catch (err) { notify(err.message) }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <RefreshButton loading={loading} onClick={() => refresh()} />
      </div>
      <div className="bg-white border border-stone-200 rounded-xl p-5 flex flex-wrap items-end gap-3">
        <div className="w-56">
          <Field label="Merchant member">
            <SearchableSelect
              options={sortedBy(merchantMembers, memberLabel).map(m => ({ value: m.id, label: memberLabel(m) }))}
              value={memberId}
              onChange={setMemberId}
              placeholder="Select…"
            />
          </Field>
        </div>
        <button onClick={promote} disabled={saving} className="px-4 py-2 text-sm font-medium bg-stone-900 text-white rounded-lg hover:bg-stone-700 transition-colors disabled:opacity-50">Promote to Admin</button>
      </div>

      {loading ? <TableSkeleton /> : !data.length ? (
        <EmptyState title="No Admin-tier members yet" subtitle="Promote a merchant member above — their scope is whatever orgs they're assigned in Relationships." />
      ) : (
        <Table headers={['Member', 'Promoted', '']}>
          {data.map(a => (
            <tr key={a.id} className="border-t border-stone-100">
              <Td>{membersById[a.member_id]?.full_name || a.member_id}</Td>
              <Td>{new Date(a.created_at).toLocaleDateString()}</Td>
              <Td><button onClick={() => demote(a.id)} className="text-xs font-medium text-red-600 hover:text-red-700 transition-colors">Demote</button></Td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  )
}

// ─── Moderation: workspace reassign + audit trail ───
// Trimmed 2026-08-25 from 5 sub-tabs (Workspaces/Skus/Uploads/Invites/Audit Log) down to
// 2 — Skus/Uploads/Invites were raw read-only dumps with no actions and no clear use
// case; nothing in this console's actual use cases (reassign-on-departure, view-only
// access, extra collaborator) ever needed to browse them.
const shortId = (id) => id ? `${id.slice(0, 8)}…` : '—'
const memberLabelFrom = (membersById, id) => id ? (membersById[id]?.full_name || membersById[id]?.email || shortId(id)) : null

// ─── Audit-log row drill-down ───
// The audit table only shows action / target / actor / time. Everything about *what*
// changed lives in the `detail` JSONB the backend already sends down untouched
// (logSkuMutation → { auto_code, changes:{field:{from,to}}, master_key, via, reason, … }).
// This renders that on an expanded row.
const auditFmt = (v) => {
  if (v === null || v === undefined || v === '') return 'empty'
  const s = String(v)
  return s.length > 200 ? s.slice(0, 200) + '…' : s
}
function AuditImgThumb({ label, url }) {
  return (
    <div className="text-center">
      <div className="text-[10px] text-stone-400 mb-1">{label}</div>
      {url
        ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={label} className="w-16 h-16 object-cover rounded border border-stone-200" /></a>
        : <div className="w-16 h-16 rounded border border-dashed border-stone-200 flex items-center justify-center text-[10px] text-stone-300">none</div>}
    </div>
  )
}
function AuditDetail({ row }) {
  const d = (row.detail && typeof row.detail === 'object') ? row.detail : {}
  const changes = (d.changes && typeof d.changes === 'object') ? Object.entries(d.changes) : []
  const isImg = row.action === 'edit_sku_image'
  const known = new Set(['auto_code', 'changes', 'from', 'to', 'master_key', 'via', 'reason', 'actor_role', 'event', 'stage'])
  const rest = Object.entries(d).filter(([k, v]) => !known.has(k) && v !== null && v !== undefined && v !== '')
  return (
    <div className="space-y-2 text-xs text-stone-600">
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {d.auto_code && <span><span className="text-stone-400">SKU</span> <span className="font-medium text-stone-800">{d.auto_code}</span></span>}
        {row.target_id && <span><span className="text-stone-400">id</span> <span className="font-mono break-all">{row.target_id}</span></span>}
        {d.actor_role && <span><span className="text-stone-400">as</span> {d.actor_role}</span>}
        {d.via && <span><span className="text-stone-400">via</span> {d.via}</span>}
        {d.master_key && <span className="inline-flex px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">master key</span>}
      </div>

      {isImg && (d.from || d.to) && (
        <div className="flex items-start gap-3">
          <AuditImgThumb label="before" url={d.from} />
          <span className="text-stone-300 mt-7">→</span>
          <AuditImgThumb label="after" url={d.to} />
        </div>
      )}

      {!isImg && changes.length > 0 && (
        <table className="w-full max-w-2xl border border-stone-200 rounded-lg">
          <tbody>
            {changes.map(([field, ft]) => (
              <tr key={field} className="border-b border-stone-100 last:border-0 align-top">
                <td className="px-2 py-1.5 font-medium text-stone-700 whitespace-nowrap capitalize">{field.replace(/_/g, ' ')}</td>
                <td className="px-2 py-1.5 text-rose-600 break-words">{auditFmt(ft?.from)}</td>
                <td className="px-2 py-1.5 text-stone-300">→</td>
                <td className="px-2 py-1.5 text-emerald-700 break-words">{auditFmt(ft?.to)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!isImg && !changes.length && (d.from !== undefined || d.to !== undefined) && (
        <div className="flex flex-wrap items-start gap-2 max-w-2xl">
          <span className="text-rose-600 break-words">{auditFmt(d.from)}</span>
          <span className="text-stone-300">→</span>
          <span className="text-emerald-700 break-words">{auditFmt(d.to)}</span>
        </div>
      )}

      {d.reason && <div><span className="text-stone-400">reason</span> {auditFmt(d.reason)}</div>}

      {rest.length > 0 && (
        <pre className="text-[11px] bg-stone-100 border border-stone-200 rounded-lg p-2 overflow-x-auto">{JSON.stringify(Object.fromEntries(rest), null, 2)}</pre>
      )}
    </div>
  )
}

export function ModerationTab({ notify }) {
  const { restoreSku, removeWorkspaceAccess } = usePlmAdminActions()
  const [restoringId, setRestoringId] = useState(null)
  const [removingKey, setRemovingKey] = useState(null) // `${workspaceId}:${memberId}` mid-request
  const [view, setView] = useState('workspaces')
  const [openAuditId, setOpenAuditId] = useState(null)
  const workspaces = usePlmAdminWorkspaces()
  const auditLog = usePlmAdminAuditLog()
  const { data: permissions } = usePlmAdminPermissions()
  const invitesQuery = usePlmAdminInvites()
  const invites = invitesQuery.data
  const { data: members } = usePlmAdminMembers({})
  const membersById = Object.fromEntries(members.map(m => [m.id, m]))
  const { data: orgs } = usePlmAdminOrganizations()
  const orgsById = Object.fromEntries(orgs.map(o => [o.id, o]))
  const [reassigningId, setReassigningId] = useState(null)
  const [managingAccessId, setManagingAccessId] = useState(null)
  const [search, setSearch] = useState('')
  const [deletedFilter, setDeletedFilter] = useState('all') // 'all' | 'active' | 'deleted'
  const [buyerOrgFilter, setBuyerOrgFilter] = useState('')      // buyer org id, '' = all
  const [supplierOrgFilter, setSupplierOrgFilter] = useState('') // supplier org id, '' = all
  const [statusFilter, setStatusFilter] = useState('')           // workspace status, '' = all

  // Buyer / vendor / status filters for the Workspaces list — options come from the values
  // that actually appear on some workspace, so you can't pick one with zero SKUs.
  const orgFilterOptions = (orgIdKey, allLabel) => [
    { value: '', label: allLabel },
    ...sortedBy(
      [...new Set(workspaces.data.map(w => w[orgIdKey]).filter(Boolean))]
        .map(id => ({ value: id, label: orgsById[id]?.display_name || orgsById[id]?.name || shortId(id) })),
      o => o.label
    ),
  ]
  const buyerOrgOptions = orgFilterOptions('buyer_org_id', 'All buyers')
  const supplierOrgOptions = orgFilterOptions('supplier_org_id', 'All vendors')
  const statusOptions = [
    { value: '', label: 'All statuses' },
    ...sortedBy(
      [...new Set(workspaces.data.map(w => w.status).filter(Boolean))]
        .map(s => ({ value: s, label: STATUS_LABELS[s] || s })),
      o => o.label
    ),
  ]

  // Real access per workspace — primary buyer/supplier/merchant plus any accepted
  // co-buyer/co-supplier invite (same set RLS's plm_can_see_workspace() grants access
  // to), deduped by member id. Previously this only counted Permissions-tab grants
  // (npd2_workspace_permissions), a separate opt-in sharing feature almost nobody uses —
  // which meant this column showed 0 for nearly every workspace regardless of who
  // actually has access via the normal invite flow. `removable` marks buyer/supplier
  // entries (primary or co-) — the only ones the new per-workspace remove action
  // (DELETE /workspaces/:id/access/:memberId) actually knows how to clear; merchant and
  // Permissions-tab grants are handled elsewhere (Reassign / Permissions tab) so they're
  // shown but not removable from here.
  const peopleByWorkspace = {}
  const addPerson = (wsId, memberId, role, removable) => {
    if (!wsId || !memberId) return
    if (!peopleByWorkspace[wsId]) peopleByWorkspace[wsId] = new Map()
    const existing = peopleByWorkspace[wsId].get(memberId)
    if (!existing || (removable && !existing.removable)) peopleByWorkspace[wsId].set(memberId, { role, removable })
  }
  for (const w of workspaces.data) {
    addPerson(w.id, w.merchant_member_id, 'merchant', false)
    addPerson(w.id, w.buyer_member_id, 'buyer', true)
    addPerson(w.id, w.supplier_member_id, 'supplier', true)
  }
  for (const inv of invites) {
    if (inv.status === 'accepted')
      addPerson(inv.workspace_id, inv.member_id, (inv.role === 'supplier' || inv.role === 'vendor') ? 'supplier' : 'buyer', true)
  }
  for (const p of permissions) addPerson(p.workspace_id, p.member_id, p.capability || 'grant', false)
  const grantCountByWorkspace = Object.fromEntries(
    Object.entries(peopleByWorkspace).map(([wsId, m]) => [wsId, m.size])
  )

  async function removeAccess(workspaceId, memberId) {
    const key = `${workspaceId}:${memberId}`
    setRemovingKey(key)
    try {
      await removeWorkspaceAccess(workspaceId, memberId)
      notify('Removed from this workspace')
      workspaces.refresh()
      invitesQuery.refresh()
    } catch (err) { notify(err.message) } finally { setRemovingKey(null) }
  }

  const filteredWorkspaces = workspaces.data
    .filter(w => (w.npd2_catalog_skus?.auto_code || '').toLowerCase().includes(search.toLowerCase()))
    .filter(w =>
      deletedFilter === 'all' ? true :
      deletedFilter === 'deleted' ? !!w.npd2_catalog_skus?.delete_meta :
      !w.npd2_catalog_skus?.delete_meta
    )
    .filter(w => !buyerOrgFilter || w.buyer_org_id === buyerOrgFilter)
    .filter(w => !supplierOrgFilter || w.supplier_org_id === supplierOrgFilter)
    .filter(w => !statusFilter || w.status === statusFilter)

  const filteredAudit = search
    ? auditLog.data.filter(a =>
        a.action?.toLowerCase().includes(search.toLowerCase()) ||
        a.target_type?.toLowerCase().includes(search.toLowerCase()) ||
        String(a.detail?.auto_code || '').toLowerCase().includes(search.toLowerCase()) ||
        (memberLabelFrom(membersById, a.actor_member_id) || '').toLowerCase().includes(search.toLowerCase()))
    : auditLog.data

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1.5">
          {['workspaces', 'audit log'].map(v => (
            <button key={v} onClick={() => { setView(v); setReassigningId(null); setSearch(''); setBuyerOrgFilter(''); setSupplierOrgFilter(''); setStatusFilter('') }}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg capitalize ${view === v ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}`}>
              {v}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={view === 'workspaces' ? 'Search by SKU number…' : 'Search by action, SKU code, target type, or actor…'}
          className="border border-stone-200 rounded-lg px-3 py-1.5 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-300 w-64"
        />
        {view === 'workspaces' && (
          <div className="flex gap-1">
            {[['all', 'All'], ['active', 'Active only'], ['deleted', 'Deleted only']].map(([v, label]) => (
              <button key={v} onClick={() => setDeletedFilter(v)}
                className={`px-2.5 py-1.5 text-xs font-medium rounded-lg ${deletedFilter === v ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}`}>
                {label}
              </button>
            ))}
          </div>
        )}
        {view === 'workspaces' && (
          <>
            <div className="w-44">
              <SearchableSelect options={buyerOrgOptions} value={buyerOrgFilter} onChange={setBuyerOrgFilter} placeholder="All buyers" />
            </div>
            <div className="w-44">
              <SearchableSelect options={supplierOrgOptions} value={supplierOrgFilter} onChange={setSupplierOrgFilter} placeholder="All vendors" />
            </div>
            <div className="w-40">
              <SearchableSelect options={statusOptions} value={statusFilter} onChange={setStatusFilter} placeholder="All statuses" />
            </div>
          </>
        )}
        <div className="ml-auto">
          <RefreshButton
            loading={view === 'workspaces' ? workspaces.loading : auditLog.loading}
            onClick={() => (view === 'workspaces' ? workspaces.refresh() : auditLog.refresh())}
          />
        </div>
      </div>

      {view === 'workspaces' && (
        workspaces.loading ? <TableSkeleton /> : !filteredWorkspaces.length ? (
          <EmptyState title="No workspaces" subtitle={(search || buyerOrgFilter || supplierOrgFilter || statusFilter) ? 'No SKU matches the current filters.' : undefined} />
        ) : (
          <Table headers={['SKU', 'Orgs connected', 'People with access', 'Status', '']}>
            {filteredWorkspaces.map(row => (
              <Fragment key={row.id}>
                <tr className="border-t border-stone-100">
                  <Td className="font-medium">
                    <div className="flex items-center gap-1.5">
                      {row.npd2_catalog_skus?.auto_code || shortId(row.id)}
                      {row.npd2_catalog_skus?.delete_meta && (
                        <span
                          title={row.npd2_catalog_skus.delete_meta.flagged_at ? `Deleted ${new Date(row.npd2_catalog_skus.delete_meta.flagged_at).toLocaleString()}` : undefined}
                          className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-red-100 text-red-700"
                        >
                          Deleted
                        </span>
                      )}
                    </div>
                    {row.npd2_catalog_skus?.delete_meta?.reason && (
                      <div className="mt-0.5 text-[11px] font-normal text-stone-500 truncate max-w-[220px]">
                        {row.npd2_catalog_skus.delete_meta.reason}
                      </div>
                    )}
                  </Td>
                  <Td>
                    {[
                      row.buyer_org_id && ['Buyer', orgsById[row.buyer_org_id]],
                      row.supplier_org_id && ['Vendor', orgsById[row.supplier_org_id]],
                    ].filter(Boolean).map(([label, org], i) => (
                      <div key={label} className={i > 0 ? 'mt-0.5' : undefined}>
                        <span className="text-stone-400">{label}:</span>{' '}
                        {org?.display_name || org?.name || 'Unknown org'}
                      </div>
                    ))}
                    {!row.buyer_org_id && !row.supplier_org_id && <span className="text-stone-400">None</span>}
                  </Td>
                  <Td>
                    <button
                      onClick={() => setManagingAccessId(id => id === row.id ? null : row.id)}
                      className="text-xs font-medium text-stone-600 hover:text-stone-900 transition-colors underline decoration-dotted underline-offset-2"
                      title="View and remove individual people from this workspace"
                    >
                      {managingAccessId === row.id ? 'Hide' : 'Manage'} · {grantCountByWorkspace[row.id] || 0} {grantCountByWorkspace[row.id] === 1 ? 'person' : 'people'}
                    </button>
                  </Td>
                  <Td><PlmStatusBadge status={row.status} /></Td>
                  <Td>
                    <div className="flex items-center gap-3">
                      <button onClick={() => setReassigningId(id => id === row.id ? null : row.id)} className="text-xs font-medium text-stone-600 hover:text-stone-900 transition-colors">
                        {reassigningId === row.id ? 'Cancel' : 'Reassign'}
                      </button>
                      {row.npd2_catalog_skus?.delete_meta && (
                        <button
                          disabled={restoringId === row.npd2_catalog_skus.id}
                          onClick={async () => {
                            setRestoringId(row.npd2_catalog_skus.id)
                            try {
                              await restoreSku(row.npd2_catalog_skus.id)
                              notify?.('SKU restored')
                              workspaces.refresh()
                            } catch (err) {
                              notify?.(err.message)
                            } finally {
                              setRestoringId(null)
                            }
                          }}
                          className="text-xs font-medium text-emerald-700 hover:text-emerald-900 transition-colors disabled:opacity-40"
                        >
                          {restoringId === row.npd2_catalog_skus.id ? 'Restoring…' : 'Restore'}
                        </button>
                      )}
                    </div>
                  </Td>
                </tr>
                {reassigningId === row.id && (
                  <tr className="bg-stone-50 border-t border-stone-100">
                    <td colSpan={5} className="px-4 py-4">
                      <ReassignForm workspace={row} notify={notify} onDone={() => { setReassigningId(null); workspaces.refresh() }} />
                    </td>
                  </tr>
                )}
                {managingAccessId === row.id && (
                  <tr className="bg-stone-50 border-t border-stone-100">
                    <td colSpan={5} className="px-4 py-4">
                      {!peopleByWorkspace[row.id]?.size ? (
                        <div className="text-xs text-stone-400">Nobody has access to this workspace yet.</div>
                      ) : (
                        <div className="space-y-2">
                          {[...peopleByWorkspace[row.id].entries()].map(([memberId, { role, removable }]) => {
                            const key = `${row.id}:${memberId}`
                            return (
                              <div key={memberId} className="flex items-center gap-3 text-sm">
                                <span className="w-16 flex-shrink-0"><Badge label={role} /></span>
                                <span className="text-stone-700">{memberLabelFrom(membersById, memberId) || memberId}</span>
                                {removable ? (
                                  <button
                                    disabled={removingKey === key}
                                    onClick={() => removeAccess(row.id, memberId)}
                                    className="text-xs font-medium text-red-600 hover:text-red-700 transition-colors disabled:opacity-40"
                                  >
                                    {removingKey === key ? 'Removing…' : 'Remove from this workspace'}
                                  </button>
                                ) : (
                                  <span className="text-xs text-stone-400">Manage via {role === 'merchant' ? 'Reassign' : 'Permissions tab'}</span>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </Table>
        )
      )}

      {view === 'audit log' && (
        auditLog.loading ? <TableSkeleton /> : !filteredAudit.length ? (
          <EmptyState title="No audit log entries" subtitle={search ? 'No matches for that search.' : undefined} />
        ) : (
          <Table headers={['Action', 'Target', 'By', 'When', '']}>
            {filteredAudit.map(row => {
              const detail = (row.detail && typeof row.detail === 'object') ? row.detail : null
              const hasDetail = !!detail && Object.keys(detail).length > 0
              const open = openAuditId === row.id
              return (
                <Fragment key={row.id}>
                  <tr
                    className={`border-t border-stone-100 ${hasDetail ? 'cursor-pointer hover:bg-stone-50' : ''}`}
                    onClick={hasDetail ? () => setOpenAuditId(open ? null : row.id) : undefined}
                  >
                    <Td className="font-medium">{row.action}</Td>
                    <Td className="capitalize">
                      {row.target_type}
                      {detail?.auto_code && <span className="ml-1.5 font-mono text-xs text-stone-500 normal-case">{detail.auto_code}</span>}
                    </Td>
                    <Td>{memberLabelFrom(membersById, row.actor_member_id) || '—'}</Td>
                    <Td>{new Date(row.created_at).toLocaleString()}</Td>
                    <Td className="text-stone-400 w-6 select-none">{hasDetail ? (open ? '▾' : '▸') : ''}</Td>
                  </tr>
                  {open && hasDetail && (
                    <tr className="border-t border-stone-100 bg-stone-50">
                      <td colSpan={5} className="px-4 py-3">
                        <AuditDetail row={row} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </Table>
        )
      )}
    </div>
  )
}

// Buyer/supplier pickers scoped to the workspace's actual orgs; the merchant picker to
// merchandising-dept members (the only ones who can own a PLM workspace) — never lists
// every member in the portal.
function ReassignForm({ workspace, notify, onDone }) {
  const { data: buyerMembers } = usePlmAdminMembers({ organizationId: workspace.buyer_org_id })
  const { data: supplierMembers } = usePlmAdminMembers({ organizationId: workspace.supplier_org_id })
  const { data: merchantMembers } = usePlmAdminMembers({ type: 'merchant', department: 'merchandising' })
  const actions = usePlmAdminActions()
  const [form, setForm] = useState({
    buyer_member_id: workspace.buyer_member_id || '',
    supplier_member_id: workspace.supplier_member_id || '',
    merchant_member_id: workspace.merchant_member_id || '',
  })
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    try {
      await actions.reassignWorkspace(workspace.id, form)
      notify('Workspace reassigned')
      onDone()
    } catch (err) { notify(err.message) } finally { setSaving(false) }
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="w-56">
        <Field label={`Buyer (${workspace.buyer_org_id ? 'this workspace\'s buyer org' : 'no buyer org set'})`}>
          <SearchableSelect
            options={sortedBy(buyerMembers, memberLabel).map(m => ({ value: m.id, label: memberLabel(m) }))}
            value={form.buyer_member_id}
            onChange={(id) => setForm(f => ({ ...f, buyer_member_id: id }))}
            placeholder="—"
            disabled={!workspace.buyer_org_id}
          />
        </Field>
      </div>
      <div className="w-56">
        <Field label={`Supplier (${workspace.supplier_org_id ? 'this workspace\'s supplier org' : 'no supplier org set'})`}>
          <SearchableSelect
            options={sortedBy(supplierMembers, memberLabel).map(m => ({ value: m.id, label: memberLabel(m) }))}
            value={form.supplier_member_id}
            onChange={(id) => setForm(f => ({ ...f, supplier_member_id: id }))}
            placeholder="—"
            disabled={!workspace.supplier_org_id}
          />
        </Field>
      </div>
      <div className="w-56">
        <Field label="Merchant">
          <SearchableSelect
            options={sortedBy(merchantMembers, memberLabel).map(m => ({ value: m.id, label: memberLabel(m) }))}
            value={form.merchant_member_id}
            onChange={(id) => setForm(f => ({ ...f, merchant_member_id: id }))}
            placeholder="—"
          />
        </Field>
      </div>
      <button onClick={save} disabled={saving} className="px-4 py-2 text-sm font-medium bg-stone-900 text-white rounded-lg hover:bg-stone-700 transition-colors disabled:opacity-50">Save</button>
    </div>
  )
}

// ─── Shared bits ───
export function Field({ label, children }) {
  return (
    <label className="text-xs">
      <div className="text-stone-400 font-medium uppercase tracking-widest mb-1">{label}</div>
      {children}
    </label>
  )
}
export function Table({ headers, children }) {
  return (
    <div className="bg-white border border-stone-200 rounded-xl overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs font-medium text-stone-400 uppercase tracking-widest">
            {headers.map(h => <th key={h} className="px-4 py-3">{h}</th>)}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}
export function Td({ children, className = '' }) {
  return <td className={`px-4 py-3 text-stone-700 ${className}`}>{children}</td>
}
