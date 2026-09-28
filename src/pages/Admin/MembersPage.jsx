import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAdminCheck } from '../../hooks/useAdminCheck'
import { useAuth } from '../../hooks/useAuth'
import { canAccessMembersPage } from '../../utils/membersPageAccess'
import { useMembers } from '../../hooks/useMembers'
import { useOrganisations } from '../../hooks/useOrganisations'
import { useAdminProvisioning } from '../../hooks/useAdminProvisioning'
import { AdminShell } from '../../components/admin/AdminShell'
import { PageHeader, Badge, EmptyState, TableSkeleton, StatCard } from '../../components/admin/AdminUi'
import SearchableSelect from '../../components/ui/SearchableSelect'
import { supabase } from '../../lib/supabase'
import { MODULES, defaultModulesForDept } from '../../config/modules'

const ROLE_FILTERS = ['all', 'owner', 'admin', 'member']
const INPUT_CLS = 'border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-300 w-full'
const DEPARTMENTS = ['erp', 'it', 'tech', 'merchandising', 'logistics', 'qa']

function NewMemberModal({ onClose, onCreated }) {
  const { createUser } = useAdminProvisioning()
  const [orgType, setOrgType] = useState('')
  const [form, setForm] = useState({ email: '', full_name: '', organization_id: '', role: '', department: '', password: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  // Filtered server-side by type (and fetched with a limit high enough to cover the
  // whole table) — filtering client-side out of one capped, unfiltered page silently
  // dropped orgs once the org count grew past that cap.
  const { orgs: fetchedOrgs } = useOrganisations({ limit: 5000, type: orgType })
  // /org-customers/orgs/all orders by created_on, not name — sort ascending for the picker.
  const orgsForType = [...fetchedOrgs].sort((a, b) =>
    (a.display_name || a.name || '').localeCompare(b.display_name || b.name || '', undefined, { sensitivity: 'base' }))

  async function submit() {
    if (!form.email || !form.organization_id || !form.role) { setError('Email, organization, and role are required'); return }
    if (form.password && form.password.length < 4) { setError('Password must be at least 4 characters'); return }
    setSaving(true)
    setError(null)
    try {
      await createUser({ ...form, department: form.department || null, password: form.password || undefined })
      onCreated()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm px-4">
      <div className="bg-white rounded-2xl border border-stone-200 shadow-xl w-full max-w-md p-6">
        <h3 className="text-base font-medium text-stone-900 mb-1">New member</h3>
        <p className="text-sm text-stone-500 mb-4">Creates a login-capable account — onboarding is marked complete immediately, so they log in via the normal 4-digit OTP flow at /auth.</p>
        <div className="space-y-3">
          <input className={INPUT_CLS} placeholder="Email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          <input className={INPUT_CLS} placeholder="Full name" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} />
          <select className={INPUT_CLS} value={orgType} onChange={e => { setOrgType(e.target.value); setForm(f => ({ ...f, organization_id: '' })) }}>
            <option value="">Merchant, Buyer, or Supplier?</option>
            <option value="merchant">Merchant</option>
            <option value="buyer">Buyer</option>
            <option value="supplier">Supplier</option>
          </select>
          <SearchableSelect
            options={orgsForType.map(o => ({ value: o.id, label: o.display_name || o.name }))}
            value={form.organization_id}
            onChange={(id) => setForm(f => ({ ...f, organization_id: id }))}
            placeholder={orgType ? 'Select organisation…' : 'Pick a type first'}
            disabled={!orgType}
            triggerClassName={`${INPUT_CLS} ${!orgType ? 'opacity-60' : ''}`}
            dropdownClassName="rounded-lg border border-stone-200"
          />
          <div className="flex gap-3">
            <select className={INPUT_CLS} value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
              <option value="">Select role…</option>
              <option value="member">Member</option>
              <option value="admin">Admin</option>
              <option value="owner">Owner</option>
            </select>
            <select className={INPUT_CLS} value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))}>
              <option value="">No department</option>
              {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <input
            type="password"
            className={INPUT_CLS}
            placeholder="Password (optional — leave blank to generate one)"
            value={form.password}
            onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
          />
        </div>
        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
        <div className="flex gap-2 justify-end mt-5">
          <button onClick={onClose} disabled={saving} className="px-4 py-2 text-sm font-medium text-stone-600 bg-stone-100 rounded-lg hover:bg-stone-200 transition-colors">Cancel</button>
          <button onClick={submit} disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-stone-900 rounded-lg hover:bg-stone-700 transition-colors disabled:opacity-50">
            {saving ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function MembersPage() {
  const { checking } = useAdminCheck()
  const { user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  // Beyond the tech-admin gate in useAdminCheck, this page is limited to a fixed
  // email allowlist; everyone else is bounced to the dashboard.
  const emailAllowed = canAccessMembersPage(user?.email)
  useEffect(() => {
    if (!authLoading && !emailAllowed) navigate('/dashboard', { replace: true })
  }, [authLoading, emailAllowed, navigate])

  const { members, total, loading, error, refresh } = useMembers({ limit: 100 })
  const { updateMember } = useAdminProvisioning()
  const [showNewMember, setShowNewMember] = useState(false)

  const [roleFilter, setRoleFilter] = useState('all')
  const [search, setSearch] = useState('')

  const [selectedMember, setSelectedMember] = useState(null)
  const [drawerModules, setDrawerModules] = useState(null)
  const [drawerDepartment, setDrawerDepartment] = useState(undefined)
  const [drawerRegions, setDrawerRegions] = useState(null)
  const [availableCities, setAvailableCities] = useState([])
  const [citySearch, setCitySearch] = useState('')
  const [drawerLoading, setDrawerLoading] = useState(false)
  const [drawerSaving, setDrawerSaving] = useState(false)
  const [drawerError, setDrawerError] = useState(null)

  // Organisation/role/department — one combined save action, separate from module
  // access below (which has its own save button and its own RLS-permitted update path).
  const [drawerOrgType, setDrawerOrgType] = useState('')
  const [drawerOrgId, setDrawerOrgId] = useState('')
  const [drawerRole, setDrawerRole] = useState('')
  const [memberSaving, setMemberSaving] = useState(false)
  const [memberError, setMemberError] = useState(null)
  // Filtered server-side by type — see NewMemberModal above for why this can't be a
  // client-side filter over one capped, unfiltered page.
  const { orgs: orgsForDrawerType } = useOrganisations({ limit: 5000, type: drawerOrgType })

  // Organization Access (member_organization_access) — a separate axis from
  // allowed_modules/role above: which buyer orgs' data this member can pull
  // via resolveMerchantMemberLinkIds (dashboard_summary, MIS, etc.),
  // independent of which UI modules/tabs they can see. The "add" dropdown
  // only offers buyers for now; allOrgsForAccess stays unfiltered (not just
  // buyers) purely to resolve display names for any pre-existing grant of a
  // different type, so an older non-buyer row still shows a real name
  // instead of "Unknown organization".
  const [drawerAccess, setDrawerAccess] = useState([])
  const [newAccessOrgId, setNewAccessOrgId] = useState('')
  const [accessSaving, setAccessSaving] = useState(false)
  const [accessError, setAccessError] = useState(null)
  const { orgs: allOrgsForAccess } = useOrganisations({ limit: 5000 })
  const { orgs: buyerOrgsForAccess } = useOrganisations({ limit: 5000, type: 'buyer' })
  const orgsById = Object.fromEntries(allOrgsForAccess.map(o => [o.id, o]))

  if (checking || authLoading || !emailAllowed) return null

  const filtered = members.filter(m => {
    const matchRole = roleFilter === 'all' || m.role === roleFilter
    const matchSearch = !search ||
      m.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      m.email?.toLowerCase().includes(search.toLowerCase()) ||
      (m.organizations?.display_name || m.organizations?.name || '').toLowerCase().includes(search.toLowerCase())
    return matchRole && matchSearch
  })

  const counts = {
    owners: members.filter(m => m.role === 'owner').length,
    admins: members.filter(m => m.role === 'admin').length,
    members: members.filter(m => m.role === 'member').length,
  }

  async function openDrawer(member) {
    setSelectedMember(member)
    setDrawerError(null)
    setDrawerLoading(true)
    setAccessError(null)
    const [memberRes, citiesRes, accessRes] = await Promise.all([
      supabase
        .from('organization_members')
        .select('allowed_modules, department, assigned_regions')
        .eq('id', member.id)
        .single(),
      supabase
        .from('organizations')
        .select('city')
        .eq('type', 'supplier')
        .not('city', 'is', null),
      supabase
        .from('member_organization_access')
        .select('id, organization_id, buyer_supplier_link_id, access_role')
        .eq('member_id', member.id),
    ])
    setDrawerLoading(false)
    if (memberRes.error) { setDrawerError(memberRes.error.message); return }
    setDrawerModules(memberRes.data.allowed_modules ?? null)
    setDrawerDepartment(memberRes.data.department ?? null)
    setDrawerRegions(memberRes.data.assigned_regions ?? null)
    const cities = [...new Set((citiesRes.data || []).map(c => c.city).filter(Boolean))].sort()
    setAvailableCities(cities)
    setDrawerOrgType(member.organizations?.type || '')
    setDrawerOrgId(member.organizations?.id || '')
    setDrawerRole(member.role || '')
    setMemberError(null)
    if (accessRes.error) { setAccessError(accessRes.error.message); setDrawerAccess([]) }
    else setDrawerAccess(accessRes.data || [])
  }

  function closeDrawer() {
    setSelectedMember(null)
    setDrawerModules(null)
    setDrawerDepartment(undefined)
    setDrawerRegions(null)
    setAvailableCities([])
    setCitySearch('')
    setDrawerError(null)
    setDrawerOrgType('')
    setDrawerOrgId('')
    setDrawerRole('')
    setDrawerAccess([])
    setNewAccessOrgId('')
    setAccessError(null)
    setMemberError(null)
  }

  async function saveMemberDetails() {
    if (!drawerOrgId || !drawerRole) { setMemberError('Organisation and role are required'); return }
    const updates = {}
    if (drawerOrgId !== selectedMember.organizations?.id) updates.organization_id = drawerOrgId
    if (drawerRole !== selectedMember.role) updates.role = drawerRole
    if (drawerDepartment !== (selectedMember.department ?? null)) updates.department = drawerDepartment
    if (!Object.keys(updates).length) { setMemberError('Nothing changed'); return }

    setMemberSaving(true)
    setMemberError(null)
    try {
      // Routed through the backend, not a direct Supabase update — RLS scopes
      // organization_members UPDATEs to rows within the admin's own org, which blocks
      // changing organization_id itself (see routes/onBoardCustomers.js for detail).
      await updateMember(selectedMember.id, updates)
      closeDrawer()
      refresh()
    } catch (err) {
      setMemberError(err.message)
    } finally {
      setMemberSaving(false)
    }
  }

  async function addOrgAccess() {
    if (!newAccessOrgId || drawerAccess.some(r => r.organization_id === newAccessOrgId)) return
    setAccessSaving(true)
    setAccessError(null)
    const { data, error: insErr } = await supabase
      .from('member_organization_access')
      .insert({ member_id: selectedMember.id, organization_id: newAccessOrgId, access_role: 'manager' })
      .select('id, organization_id, buyer_supplier_link_id, access_role')
    setAccessSaving(false)
    if (insErr) { setAccessError(insErr.message); return }
    setDrawerAccess(prev => [...prev, ...(data || [])])
    setNewAccessOrgId('')
  }

  async function removeOrgAccess(id) {
    setAccessSaving(true)
    setAccessError(null)
    const { data, error: delErr } = await supabase
      .from('member_organization_access')
      .delete()
      .eq('id', id)
      .select('id')
    setAccessSaving(false)
    if (delErr) { setAccessError(delErr.message); return }
    if (!data?.length) { setAccessError('No row removed — your Supabase RLS policy is likely blocking this. Add a DELETE policy for admins on member_organization_access.'); return }
    setDrawerAccess(prev => prev.filter(r => r.id !== id))
  }

  function toggleFullAccess() {
    setDrawerModules(prev =>
      prev === null ? defaultModulesForDept(drawerDepartment) : null
    )
  }

  function toggleModule(key) {
    setDrawerModules(prev => {
      const next = { ...prev }
      if (key in next) {
        delete next[key]
      } else {
        next[key] = null
      }
      return next
    })
  }

  function toggleAllTabs(moduleKey) {
    setDrawerModules(prev => {
      const mod = MODULES.find(m => m.key === moduleKey)
      const current = prev[moduleKey]
      return {
        ...prev,
        [moduleKey]: current === null
          ? mod.tabs.map(t => t.key)
          : null,
      }
    })
  }

  function toggleTab(moduleKey, tabKey) {
    setDrawerModules(prev => {
      const current = prev[moduleKey]
      let next
      if (current === null) {
        const mod = MODULES.find(m => m.key === moduleKey)
        next = mod.tabs.map(t => t.key).filter(k => k !== tabKey)
      } else {
        next = current.includes(tabKey)
          ? current.filter(k => k !== tabKey)
          : [...current, tabKey]
      }
      return { ...prev, [moduleKey]: next }
    })
  }

  function toggleRegion(city) {
    setDrawerRegions(prev =>
      prev === null
        ? availableCities.filter(c => c !== city)
        : prev.includes(city) ? prev.filter(c => c !== city) : [...prev, city]
    )
  }

  async function saveModules() {
    setDrawerSaving(true)
    setDrawerError(null)
    const updates = { allowed_modules: drawerModules }
    if (drawerDepartment === 'qa') updates.assigned_regions = drawerRegions
    const { data, error: saveErr } = await supabase
      .from('organization_members')
      .update(updates)
      .eq('id', selectedMember.id)
      .select('id')
    setDrawerSaving(false)
    if (saveErr) { setDrawerError(saveErr.message); return }
    if (!data?.length) {
      setDrawerError('No rows updated — your Supabase RLS policy is likely blocking this. Add an UPDATE policy for admins on organization_members.')
      return
    }
    closeDrawer()
  }

  const isMerchantMember = selectedMember?.organizations?.type === 'merchant'
  // owners and null-department admins (portal super-admins) always have full access
  // drawerDepartment is fetched from Supabase directly — more reliable than the API response
  const isUnrestricted = drawerLoading
    ? true
    : selectedMember?.role === 'owner' ||
      (selectedMember?.role === 'admin' && drawerDepartment === null)

  return (
    <AdminShell>
      <div className="px-8 py-8 max-w-6xl">
        <PageHeader
          title="Members"
          subtitle={`${total} total portal users`}
          action={
            <button onClick={() => setShowNewMember(true)} className="px-4 py-2 text-sm font-medium bg-stone-900 text-white rounded-lg hover:bg-stone-700 transition-colors">
              New member
            </button>
          }
        />

        {showNewMember && (
          <NewMemberModal
            onClose={() => setShowNewMember(false)}
            onCreated={() => { setShowNewMember(false); refresh() }}
          />
        )}

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <StatCard label="Total" value={total} />
          <StatCard label="Owners" value={counts.owners} />
          <StatCard label="Admins" value={counts.admins} />
          <StatCard label="Members" value={counts.members} />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <input
            type="text"
            placeholder="Search by name, email or org…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-300 w-64"
          />
          <div className="flex items-center gap-1">
            {ROLE_FILTERS.map(r => (
              <button
                key={r}
                onClick={() => setRoleFilter(r)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors capitalize
                  ${roleFilter === r ? 'bg-stone-900 text-white' : 'text-stone-500 hover:bg-stone-100'}`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <TableSkeleton rows={8} />
        ) : error ? (
          <div className="text-sm text-red-600">{error}</div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<svg width="20" height="20" viewBox="0 0 16 16" fill="none"><path d="M10.5 13.25v-1a2.75 2.75 0 0 0-2.75-2.75h-3A2.75 2.75 0 0 0 2 12.25v1" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" /><circle cx="6.25" cy="5.25" r="2.5" stroke="currentColor" strokeWidth="1.25" /></svg>}
            title="No members found"
            subtitle="Try adjusting your search or filter."
          />
        ) : (
          <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-stone-100">
                  {['Member', 'Organisation', 'Org type', 'Role', 'Joined'].map(h => (
                    <th key={h} className="py-2.5 px-4 text-left text-xs font-medium text-stone-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(m => (
                  <tr
                    key={m.id}
                    onClick={() => openDrawer(m)}
                    className="border-b border-stone-100 hover:bg-stone-50 transition-colors cursor-pointer"
                  >
                    <td className="py-3 px-4">
                      <div className="text-sm font-medium text-stone-900">{m.full_name}</div>
                      <div className="text-xs text-stone-400 mt-0.5">{m.email}</div>
                    </td>
                    <td className="py-3 px-4 text-sm text-stone-600">
                      {m.organizations?.display_name || m.organizations?.name || '—'}
                    </td>
                    <td className="py-3 px-4"><Badge label={m.organizations?.type} /></td>
                    <td className="py-3 px-4"><Badge label={m.role} /></td>
                    <td className="py-3 px-4 text-xs text-stone-400">
                      {m.created_on
                        ? new Date(m.created_on).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 py-3 border-t border-stone-100 text-xs text-stone-400">
              Showing {filtered.length} of {total}
            </div>
          </div>
        )}
      </div>

      {/* Edit drawer */}
      {selectedMember && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={closeDrawer} />
          <div className="fixed right-0 top-0 h-full w-96 bg-white z-50 shadow-2xl flex flex-col">

            {/* Header */}
            <div className="px-6 py-5 border-b border-stone-200 flex items-start justify-between">
              <div>
                <div className="font-semibold text-stone-900">{selectedMember.full_name || 'Unnamed member'}</div>
                <div className="text-xs text-stone-400 mt-0.5">{selectedMember.email}</div>
              </div>
              <button type="button" onClick={closeDrawer} className="text-stone-400 hover:text-stone-700 transition-colors mt-0.5">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M3 3l12 12M15 3L3 15" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <div className="flex flex-wrap gap-2 mb-6">
                <Badge label={selectedMember.role} />
                {selectedMember.department && <Badge label={selectedMember.department} />}
                {selectedMember.organizations?.display_name && (
                  <Badge label={selectedMember.organizations.display_name} />
                )}
              </div>

              {/* Organisation, role, department — one combined save */}
              <div className="mb-6 pb-6 border-b border-stone-200">
                <div className="text-xs font-medium text-stone-400 uppercase tracking-wider mb-3">
                  Organisation
                </div>
                <div className="space-y-2">
                  <select
                    className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-300"
                    value={drawerOrgType}
                    onChange={e => { setDrawerOrgType(e.target.value); setDrawerOrgId('') }}
                  >
                    <option value="">Select type…</option>
                    <option value="merchant">Merchant</option>
                    <option value="buyer">Buyer</option>
                    <option value="supplier">Supplier</option>
                  </select>
                  <SearchableSelect
                    options={orgsForDrawerType.map(o => ({ value: o.id, label: o.display_name || o.name }))}
                    value={drawerOrgId}
                    onChange={setDrawerOrgId}
                    placeholder={drawerOrgType ? 'Select organisation…' : 'Pick a type first'}
                    disabled={!drawerOrgType}
                    triggerClassName={`w-full border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-300 ${!drawerOrgType ? 'opacity-60' : ''}`}
                    dropdownClassName="rounded-lg border border-stone-200"
                  />

                  <div className="flex gap-2 pt-1">
                    <select
                      className="w-1/2 border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-300"
                      value={drawerRole}
                      onChange={e => setDrawerRole(e.target.value)}
                    >
                      <option value="">Select role…</option>
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                      <option value="owner">Owner</option>
                    </select>
                    <select
                      className="w-1/2 border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-300"
                      value={drawerDepartment ?? ''}
                      disabled={drawerLoading}
                      onChange={e => setDrawerDepartment(e.target.value || null)}
                    >
                      <option value="">No department</option>
                      {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>

                  {memberError && <p className="text-xs text-red-600">{memberError}</p>}
                  <button
                    onClick={saveMemberDetails}
                    disabled={memberSaving || drawerLoading || !drawerOrgId || !drawerRole}
                    className="w-full px-3 py-2 text-sm font-medium bg-stone-900 text-white rounded-lg hover:bg-stone-700 transition-colors disabled:opacity-50"
                  >
                    {memberSaving ? 'Saving…' : 'Save changes'}
                  </button>
                </div>
              </div>

              {/* Organization Access (member_organization_access) — separate from
                  allowed_modules above: which buyer/supplier orgs' data this member
                  can pull (dashboard_summary, MIS, etc. via resolveMerchantMemberLinkIds),
                  not which UI modules/tabs they see. Applies instantly — no save button,
                  each add/remove writes straight to the table. */}
              <div className="mb-6 pb-6 border-b border-stone-200">
                <div className="text-xs font-medium text-stone-400 uppercase tracking-wider mb-3">
                  Organization Access
                </div>

                {drawerLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <div className="w-5 h-5 border-2 border-stone-300 border-t-stone-700 rounded-full animate-spin" />
                  </div>
                ) : (
                  <>
                    <div className="space-y-1.5 mb-3">
                      {drawerAccess.length === 0 && (
                        <p className="text-xs text-stone-400">No organization access granted.</p>
                      )}
                      {drawerAccess.map(row => {
                        const org = row.organization_id ? orgsById[row.organization_id] : null
                        const label = row.organization_id
                          ? (org?.display_name || org?.name || 'Unknown organization')
                          : 'Specific buyer↔supplier link'
                        const sub = row.organization_id
                          ? `Whole organization${org?.type ? ` · ${org.type}` : ''} · ${row.access_role || 'manager'}`
                          : `Link-scoped · ${row.access_role || 'manager'}`
                        return (
                          <div key={row.id} className="flex items-center justify-between gap-2 px-3 py-2 border border-stone-200 rounded-lg">
                            <div className="min-w-0">
                              <div className="text-sm text-stone-800 truncate">{label}</div>
                              <div className="text-[11px] text-stone-400">{sub}</div>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeOrgAccess(row.id)}
                              disabled={accessSaving}
                              className="text-xs font-medium text-red-600 hover:text-red-700 transition-colors flex-shrink-0 disabled:opacity-50"
                            >
                              Remove
                            </button>
                          </div>
                        )
                      })}
                    </div>

                    <div className="flex gap-2">
                      <div className="flex-1 min-w-0">
                        <SearchableSelect
                          options={buyerOrgsForAccess
                            .filter(o => !drawerAccess.some(r => r.organization_id === o.id))
                            .map(o => ({ value: o.id, label: o.display_name || o.name }))}
                          value={newAccessOrgId}
                          onChange={setNewAccessOrgId}
                          placeholder="Add buyer access…"
                          triggerClassName="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-300"
                          dropdownClassName="rounded-lg border border-stone-200"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={addOrgAccess}
                        disabled={!newAccessOrgId || accessSaving}
                        className="px-3 py-2 text-sm font-medium bg-stone-900 text-white rounded-lg hover:bg-stone-700 transition-colors disabled:opacity-50 flex-shrink-0"
                      >
                        {accessSaving ? '…' : 'Add'}
                      </button>
                    </div>
                    {accessError && <p className="text-xs text-red-600 mt-2">{accessError}</p>}
                  </>
                )}
              </div>

              {drawerLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-5 h-5 border-2 border-stone-300 border-t-stone-700 rounded-full animate-spin" />
                </div>
              ) : !isMerchantMember ? (
                <p className="text-sm text-stone-500">
                  Module access control only applies to merchant team members.
                </p>
              ) : isUnrestricted ? (
                <p className="text-sm text-stone-500">
                  {selectedMember?.role === 'owner' ? 'Owners' : 'Admins without a department'} always have full module and tab access.
                </p>
              ) : (
                <>
                  <div className="text-xs font-medium text-stone-400 uppercase tracking-wider mb-3">
                    Module access
                  </div>

                  {/* Full access toggle */}
                  <label className="flex items-start gap-3 mb-5 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={drawerModules === null}
                      onChange={toggleFullAccess}
                      className="mt-0.5 accent-stone-900"
                    />
                    <div>
                      <div className="text-sm font-medium text-stone-800 group-hover:text-stone-900">Full access</div>
                      <div className="text-xs text-stone-400 mt-0.5">Member can see all modules and tabs</div>
                    </div>
                  </label>

                  {drawerModules !== null && (
                    <div className="space-y-1.5">
                      {MODULES.map(mod => {
                        const isIncluded  = mod.key in drawerModules
                        const tabsValue   = drawerModules[mod.key]
                        const allTabs     = tabsValue === null
                        const hasTabs     = mod.tabs.length > 0

                        return (
                          <div key={mod.key} className="border border-stone-200 rounded-lg overflow-hidden">
                            {/* Module row */}
                            <label className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-stone-50 transition-colors">
                              <input
                                type="checkbox"
                                checked={isIncluded}
                                onChange={() => toggleModule(mod.key)}
                                className="accent-stone-900"
                              />
                              <span className={`text-sm ${isIncluded ? 'font-medium text-stone-800' : 'text-stone-400'}`}>
                                {mod.label}
                              </span>
                            </label>

                            {/* Tab controls */}
                            {isIncluded && hasTabs && (
                              <div className="border-t border-stone-100 bg-stone-50 px-4 pt-2.5 pb-3">
                                <label className="flex items-center gap-2 cursor-pointer mb-2">
                                  <input
                                    type="checkbox"
                                    checked={allTabs}
                                    onChange={() => toggleAllTabs(mod.key)}
                                    className="accent-stone-900"
                                  />
                                  <span className="text-xs font-medium text-stone-500">All tabs</span>
                                </label>
                                {!allTabs && (
                                  <div className="ml-5 space-y-1.5">
                                    {mod.tabs.map(tab => (
                                      <label key={tab.key} className="flex items-center gap-2 cursor-pointer">
                                        <input
                                          type="checkbox"
                                          checked={tabsValue?.includes(tab.key) ?? false}
                                          onChange={() => toggleTab(mod.key, tab.key)}
                                          className="accent-stone-900"
                                        />
                                        <span className="text-xs text-stone-600">{tab.label}</span>
                                      </label>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {drawerDepartment === 'qa' && (
                    <div className="mt-6 pt-5 border-t border-stone-100">
                      <div className="text-xs font-medium text-stone-400 uppercase tracking-wider mb-3">
                        Region assignment
                      </div>

                      <label className="flex items-start gap-3 mb-4 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={drawerRegions === null}
                          onChange={() => setDrawerRegions(prev => prev === null ? [] : null)}
                          className="mt-0.5 accent-stone-900"
                        />
                        <div>
                          <div className="text-sm font-medium text-stone-800 group-hover:text-stone-900">All cities</div>
                          <div className="text-xs text-stone-400 mt-0.5">Member sees POs from all supplier locations</div>
                        </div>
                      </label>

                      {drawerRegions !== null && (
                        <>
                          <input
                            type="text"
                            placeholder="Search cities…"
                            value={citySearch}
                            onChange={e => setCitySearch(e.target.value)}
                            className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-stone-300"
                          />
                          <div className="space-y-1.5 max-h-48 overflow-y-auto border border-stone-100 rounded-lg p-2">
                            {availableCities
                              .filter(c => !citySearch || c.toLowerCase().includes(citySearch.toLowerCase()))
                              .map(city => (
                                <label key={city} className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={drawerRegions.includes(city)}
                                    onChange={() => toggleRegion(city)}
                                    className="accent-stone-900"
                                  />
                                  <span className="text-sm text-stone-700">{city}</span>
                                </label>
                              ))}
                            {availableCities.length === 0 && (
                              <p className="text-xs text-stone-400 py-1 px-1">No supplier cities found in database.</p>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {drawerError && <div className="mt-4 text-sm text-red-600">{drawerError}</div>}
                </>
              )}
            </div>

            {/* Footer */}
            {isMerchantMember && !isUnrestricted && !drawerLoading && (
              <div className="px-6 py-4 border-t border-stone-200 flex justify-end gap-2">
                <button type="button" onClick={closeDrawer} className="px-4 py-2 text-sm text-stone-600 hover:text-stone-900 transition-colors">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveModules}
                  disabled={drawerSaving}
                  className="px-4 py-2 text-sm font-medium bg-stone-900 text-white rounded-lg hover:bg-stone-700 transition-colors disabled:opacity-50"
                >
                  {drawerSaving ? 'Saving…' : 'Save'}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </AdminShell>
  )
}
