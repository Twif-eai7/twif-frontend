import { useState } from 'react'
import { useAdminCheck } from '../../hooks/useAdminCheck'
import { useOrganisations } from '../../hooks/useOrganisations'
import { AdminShell } from '../../components/admin/AdminShell'
import { PageHeader, Badge, EmptyState, TableSkeleton, StatCard } from '../../components/admin/AdminUi'

const STATUS_FILTERS = ['all', 'active', 'pending', 'suspended']
const TYPE_FILTERS = ['all', 'buyer', 'supplier']

export default function OrganisationsPage() {
  const { checking } = useAdminCheck()
  const { orgs, total, loading, error } = useOrganisations({ limit: 100 })

  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [search, setSearch] = useState('')

  if (checking) return null

  const filtered = orgs.filter(o => {
    const matchStatus = statusFilter === 'all' || o.status === statusFilter || (statusFilter === 'active' && !o.status)
    const matchType = typeFilter === 'all' || o.type === typeFilter
    const matchSearch = !search ||
      (o.display_name || o.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (o.domain || '').toLowerCase().includes(search.toLowerCase())
    return matchStatus && matchType && matchSearch
  })

  const counts = {
    active: orgs.filter(o => o.status === 'active' || !o.status).length,
    pending: orgs.filter(o => o.status === 'pending').length,
    suspended: orgs.filter(o => o.status === 'suspended').length,
    buyers: orgs.filter(o => o.type === 'buyer').length,
    suppliers: orgs.filter(o => o.type === 'supplier').length,
  }

  return (
    <AdminShell>
      <div className="px-8 py-8 max-w-6xl">
        <PageHeader title="Organisations" subtitle={`${total} total organisations`} />

        {/* Stats */}
        <div className="grid grid-cols-5 gap-4 mb-8">
          <StatCard label="Total" value={total} />
          <StatCard label="Active" value={counts.active} />
          <StatCard label="Pending" value={counts.pending} />
          <StatCard label="Buyers" value={counts.buyers} />
          <StatCard label="Suppliers" value={counts.suppliers} />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <input
            type="text"
            placeholder="Search by name or domain…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-300 w-64"
          />
          <div className="flex items-center gap-1">
            {STATUS_FILTERS.map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors capitalize
                  ${statusFilter === s ? 'bg-stone-900 text-white' : 'text-stone-500 hover:bg-stone-100'}`}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            {TYPE_FILTERS.map(t => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors capitalize
                  ${typeFilter === t ? 'bg-stone-900 text-white' : 'text-stone-500 hover:bg-stone-100'}`}
              >
                {t}
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
            icon={<svg width="20" height="20" viewBox="0 0 16 16" fill="none"><path d="M2.75 13.25V5.75a2 2 0 0 1 2-2h6.5a2 2 0 0 1 2 2v7.5M1.75 13.25h12.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" /></svg>}
            title="No organisations found"
            subtitle="Try adjusting your filters."
          />
        ) : (
          <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-stone-100">
                  {['Organisation', 'Domain', 'Type', 'Status', 'Members', 'Country', 'Created'].map(h => (
                    <th key={h} className="py-2.5 px-4 text-left text-xs font-medium text-stone-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(org => (
                  <tr key={org.id} className="border-b border-stone-100 hover:bg-stone-50 transition-colors">
                    <td className="py-3 px-4">
                      <div className="text-sm font-medium text-stone-900">{org.display_name || org.name}</div>
                    </td>
                    <td className="py-3 px-4 text-sm text-stone-500">{org.domain || '—'}</td>
                    <td className="py-3 px-4"><Badge label={org.type} /></td>
                    <td className="py-3 px-4">
                      <Badge label={org.status || 'active'} />
                    </td>
                    <td className="py-3 px-4 text-sm text-stone-600">{org.no_of_members ?? 0}</td>
                    <td className="py-3 px-4 text-sm text-stone-500">{org.country || '—'}</td>
                    <td className="py-3 px-4 text-xs text-stone-400">
                      {org.created_at
                        ? new Date(org.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
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
    </AdminShell>
  )
}