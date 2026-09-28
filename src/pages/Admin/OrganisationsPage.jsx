import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAdminCheck } from '../../hooks/useAdminCheck'
import { useOrganisations } from '../../hooks/useOrganisations'
import { useAdminProvisioning } from '../../hooks/useAdminProvisioning'
import { useAuth } from '../../hooks/useAuth'
import { AdminShell } from '../../components/admin/AdminShell'
import { PageHeader, Badge, EmptyState, TableSkeleton, StatCard } from '../../components/admin/AdminUi'
import { NdaDocModal } from '../../components/admin/NdaDocModal'
import { formatDateTime } from '../../utils/formatters'

const STATUS_FILTERS = ['all', 'active', 'pending', 'suspended']
const TYPE_FILTERS = ['all', 'buyer', 'supplier', 'merchant']
const INPUT_CLS = 'border border-stone-200 rounded-lg px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-300 w-full'

function NewOrganisationModal({ onClose, onCreated }) {
  const { createOrganization } = useAdminProvisioning()
  const [form, setForm] = useState({ type: 'buyer', name: '', display_name: '', domain: '', country: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function submit() {
    if (!form.name || !form.display_name) { setError('Name and display name are required'); return }
    setSaving(true)
    setError(null)
    try {
      await createOrganization(form)
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
        <h3 className="text-base font-medium text-stone-900 mb-4">New organisation</h3>
        <div className="space-y-3">
          {/* Merchant excluded — this page only manages buyer/supplier orgs (see TYPE_FILTERS above). */}
          <select className={INPUT_CLS} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
            <option value="buyer">Buyer</option>
            <option value="supplier">Supplier</option>
          </select>
          <input className={INPUT_CLS} placeholder="Slug name (e.g. acme-co)" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          <input className={INPUT_CLS} placeholder="Display name" value={form.display_name} onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))} />
          <input className={INPUT_CLS} placeholder="Domain (optional)" value={form.domain} onChange={e => setForm(f => ({ ...f, domain: e.target.value }))} />
          <input className={INPUT_CLS} placeholder="Country (optional)" value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))} />
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

export default function OrganisationsPage() {
  const { checking } = useAdminCheck()
  const { session } = useAuth()
  const navigate = useNavigate()
  const [showNewOrg, setShowNewOrg] = useState(false)
  const [ndaOrg, setNdaOrg] = useState(null) // { id, name } for the NDA preview modal

  const goToApprovals = () => navigate('/admin/approvals?tab=orgs')

  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const PAGE_SIZE = 100
  const [page, setPage] = useState(0)

  // Debounce so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  // A filter/search change can leave `page` pointing past the new (smaller) result set —
  // e.g. on page 3 of "All", then switching to "Merchant" (1 result) — snap back to page 0.
  useEffect(() => { setPage(0) }, [statusFilter, typeFilter, debouncedSearch])

  // Filtering happens server-side (see useOrganisations/routes/onBoardCustomers.js) —
  // `orgs` is already the filtered page, `total` is already the filtered total count.
  // Filtering client-side over just this one page previously undercounted anything past
  // the first `limit` rows (e.g. "Buyer" filter showing 75 when the table had 103).
  const { orgs, total, counts, loading, error, refresh } = useOrganisations({
    limit: PAGE_SIZE, offset: page * PAGE_SIZE, status: statusFilter, type: typeFilter, search: debouncedSearch,
  })
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  if (checking) return null

  return (
    <AdminShell>
      <div className="px-8 py-8 max-w-6xl">
        <PageHeader
          title="Organisations"
          subtitle={`${counts.grandTotal} total organisations`}
          action={
            <button onClick={() => setShowNewOrg(true)} className="px-4 py-2 text-sm font-medium bg-stone-900 text-white rounded-lg hover:bg-stone-700 transition-colors">
              New organisation
            </button>
          }
        />

        {showNewOrg && (
          <NewOrganisationModal
            onClose={() => setShowNewOrg(false)}
            onCreated={() => { setShowNewOrg(false); refresh() }}
          />
        )}

        {ndaOrg && (
          <NdaDocModal
            orgId={ndaOrg.id}
            orgName={ndaOrg.name}
            accessToken={session?.access_token}
            onClose={() => setNdaOrg(null)}
          />
        )}

        {/* Stats */}
        <div className="grid grid-cols-6 gap-4 mb-8">
          <StatCard label="Total" value={counts.grandTotal} />
          <StatCard label="Active" value={counts.active} />
          <StatCard label="Pending" value={counts.pending} onClick={goToApprovals} />
          <StatCard label="Buyers" value={counts.buyers} />
          <StatCard label="Suppliers" value={counts.suppliers} />
          <StatCard label="Merchant" value={counts.merchants} />
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
        ) : orgs.length === 0 ? (
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
                  {['Organisation', 'Domain', 'Type', 'Status', 'Members', 'Country', 'Agreement', 'Created'].map(h => (
                    <th key={h} className="py-2.5 px-4 text-left text-xs font-medium text-stone-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orgs.map(org => {
                  const isPending = (org.status || 'active') === 'pending'
                  return (
                  <tr
                    key={org.id}
                    onClick={isPending ? goToApprovals : undefined}
                    className={`border-b border-stone-100 hover:bg-stone-50 transition-colors ${isPending ? 'cursor-pointer' : ''}`}
                  >
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
                    <td className="py-3 px-4">
                      {org.type === 'supplier' ? (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setNdaOrg({ id: org.id, name: org.display_name || org.name }) }}
                          title="Preview NDA"
                          aria-label="Preview NDA"
                          className="text-stone-500 hover:text-stone-900 transition-colors"
                        >
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M8 2v8M4.5 7 8 10.5 11.5 7M3 13h10" />
                          </svg>
                        </button>
                      ) : (
                        <span className="text-xs text-stone-300">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-xs text-stone-400">
                      {formatDateTime(org.created_on)}
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
            <div className="px-4 py-3 border-t border-stone-100 flex items-center justify-between">
              <span className="text-xs text-stone-400">
                Showing {page * PAGE_SIZE + 1}–{page * PAGE_SIZE + orgs.length} of {total}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="px-2.5 py-1 text-xs font-medium text-stone-500 rounded-lg hover:bg-stone-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  ← Prev
                </button>
                <span className="text-xs text-stone-400">Page {page + 1} of {totalPages}</span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="px-2.5 py-1 text-xs font-medium text-stone-500 rounded-lg hover:bg-stone-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  Next →
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  )
}