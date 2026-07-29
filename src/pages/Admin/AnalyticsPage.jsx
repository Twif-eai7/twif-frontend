import { useAdminCheck } from '../../hooks/useAdminCheck'
import { useOrganisations } from '../../hooks/useOrganisations'
import { useMembers } from '../../hooks/useMembers'
import { useApprovals } from '../../hooks/useApprovals'
import { AdminShell } from '../../components/admin/AdminShell'
import { PageHeader, StatCard, TableSkeleton } from '../../components/admin/AdminUi'

export default function AnalyticsPage() {
  const { checking } = useAdminCheck()
  const { orgs, total: totalOrgs, loading: orgsLoading } = useOrganisations({ limit: 500 })
  const { members, total: totalMembers, loading: membersLoading } = useMembers({ limit: 500 })
  const { requests, pendingOrgs } = useApprovals()

  if (checking) return null

  const loading = orgsLoading || membersLoading

  // Computed stats
  const activeOrgs = orgs.filter(o => o.status === 'active' || !o.status).length
  const pendingOrgsCount = orgs.filter(o => o.status === 'pending').length
  const buyerOrgs = orgs.filter(o => o.type === 'buyer').length
  const supplierOrgs = orgs.filter(o => o.type === 'supplier').length
  const claimRequests = requests.filter(r => r.type === 'claim').length
  const memberRequests = requests.filter(r => r.type === 'member').length
  const owners = members.filter(m => m.role === 'owner').length
  const admins = members.filter(m => m.role === 'admin').length

  // Orgs joined in last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const recentOrgs = orgs.filter(o => o.created_at && new Date(o.created_at) > thirtyDaysAgo).length
  const recentMembers = members.filter(m => m.created_on && new Date(m.created_on) > thirtyDaysAgo).length

  // Top countries
  const countryCounts = orgs.reduce((acc, o) => {
    if (o.country) acc[o.country] = (acc[o.country] || 0) + 1
    return acc
  }, {})
  const topCountries = Object.entries(countryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)

  return (
    <AdminShell>
      <div className="px-8 py-8 max-w-5xl">
        <PageHeader title="Analytics" subtitle="Platform overview at a glance." />

        {loading ? <TableSkeleton rows={4} /> : (
          <div className="space-y-8">

            {/* Organisations */}
            <div>
              <h2 className="text-xs font-semibold text-stone-400 uppercase tracking-widest mb-4">
                Organisations
              </h2>
              <div className="grid grid-cols-4 gap-4">
                <StatCard label="Total" value={totalOrgs} />
                <StatCard label="Active" value={activeOrgs} />
                <StatCard label="Buyers" value={buyerOrgs} />
                <StatCard label="Suppliers" value={supplierOrgs} />
              </div>
              <div className="grid grid-cols-3 gap-4 mt-4">
                <StatCard label="Pending approval" value={pendingOrgsCount} />
                <StatCard label="New this month" value={recentOrgs} />
                <StatCard label="Avg members/org"
                  value={totalOrgs ? (totalMembers / totalOrgs).toFixed(1) : '—'} />
              </div>
            </div>

            {/* Members */}
            <div>
              <h2 className="text-xs font-semibold text-stone-400 uppercase tracking-widest mb-4">
                Members
              </h2>
              <div className="grid grid-cols-4 gap-4">
                <StatCard label="Total" value={totalMembers} />
                <StatCard label="Owners" value={owners} />
                <StatCard label="Admins" value={admins} />
                <StatCard label="New this month" value={recentMembers} />
              </div>
            </div>

            {/* Pending actions */}
            <div>
              <h2 className="text-xs font-semibold text-stone-400 uppercase tracking-widest mb-4">
                Pending actions
              </h2>
              <div className="grid grid-cols-3 gap-4">
                <StatCard label="New org approvals" value={pendingOrgs.length}
                  sub={pendingOrgs.length > 0 ? 'Needs your review' : 'All clear'} />
                <StatCard label="Ownership claims" value={claimRequests}
                  sub={claimRequests > 0 ? 'Needs your review' : 'All clear'} />
                <StatCard label="Join requests" value={memberRequests}
                  sub="Actioned by org admins" />
              </div>
            </div>

            {/* Top countries */}
            {topCountries.length > 0 && (
              <div>
                <h2 className="text-xs font-semibold text-stone-400 uppercase tracking-widest mb-4">
                  Top countries
                </h2>
                <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-stone-100">
                        <th className="py-2.5 px-4 text-left text-xs font-medium text-stone-400 uppercase tracking-wider">Country</th>
                        <th className="py-2.5 px-4 text-left text-xs font-medium text-stone-400 uppercase tracking-wider">Organisations</th>
                        <th className="py-2.5 px-4 text-left text-xs font-medium text-stone-400 uppercase tracking-wider">Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topCountries.map(([country, count]) => (
                        <tr key={country} className="border-b border-stone-100">
                          <td className="py-3 px-4 text-sm text-stone-900">{country}</td>
                          <td className="py-3 px-4 text-sm text-stone-600">{count}</td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 bg-stone-100 rounded-full max-w-32">
                                <div
                                  className="h-1.5 bg-stone-400 rounded-full"
                                  style={{ width: `${(count / totalOrgs) * 100}%` }}
                                />
                              </div>
                              <span className="text-xs text-stone-400">
                                {((count / totalOrgs) * 100).toFixed(0)}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </AdminShell>
  )
}