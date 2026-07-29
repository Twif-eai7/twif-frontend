import { useState } from 'react'
import { useAdminCheck } from '../../hooks/useAdminCheck'
import { useMembers } from '../../hooks/useMembers'
import { AdminShell } from '../../components/admin/AdminShell'
import { PageHeader, Badge, EmptyState, TableSkeleton, StatCard } from '../../components/admin/AdminUi'
import { supabase } from '../../lib/supabase'
import { MODULES, defaultModulesForDept } from '../../config/modules'

const ROLE_FILTERS = ['all', 'owner', 'admin', 'member']

export default function MembersPage() {
  const { checking } = useAdminCheck()
  const { members, total, loading, error } = useMembers({ limit: 100 })

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

  if (checking) return null

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
    const [memberRes, citiesRes] = await Promise.all([
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
    ])
    setDrawerLoading(false)
    if (memberRes.error) { setDrawerError(memberRes.error.message); return }
    setDrawerModules(memberRes.data.allowed_modules ?? null)
    setDrawerDepartment(memberRes.data.department ?? null)
    setDrawerRegions(memberRes.data.assigned_regions ?? null)
    const cities = [...new Set((citiesRes.data || []).map(c => c.city).filter(Boolean))].sort()
    setAvailableCities(cities)
  }

  function closeDrawer() {
    setSelectedMember(null)
    setDrawerModules(null)
    setDrawerDepartment(undefined)
    setDrawerRegions(null)
    setAvailableCities([])
    setCitySearch('')
    setDrawerError(null)
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
        <PageHeader title="Members" subtitle={`${total} total portal users`} />

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
