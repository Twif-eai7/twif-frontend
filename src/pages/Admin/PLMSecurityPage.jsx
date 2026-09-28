import { useState } from 'react'
import { Link } from 'react-router-dom'
import { usePlmSecurityGuard } from '../../hooks/usePlmAdmin'
import { usePlmMasterKeyStore } from '../../stores/plmMasterKeyStore'
import { AdminShell } from '../../components/admin/AdminShell'
import { PageHeader } from '../../components/admin/AdminUi'
import { RelationshipsTab, PermissionsTab, AdminsTab, ModerationTab } from '../../components/plm/PlmSecurityTabs'

const TABS_SUPER_ADMIN = ['relationships', 'permissions', 'admins', 'moderation']
const TABS_ADMIN       = ['relationships', 'permissions']

// Toggle switch for the Master Key bypass (act as buyer/supplier/merchant on any
// workspace) — Super Admin (tech-dept) only; Admin-tier members never get this.
function MasterKeySwitch() {
  const active = usePlmMasterKeyStore(s => s.active)
  const toggle = usePlmMasterKeyStore(s => s.toggle)
  return (
    <button
      type="button"
      onClick={toggle}
      title={active ? 'Full PLM override is ON — click to return to normal tech access' : 'Turn on full PLM override (act as buyer/supplier/merchant on any workspace)'}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer flex-shrink-0
        ${active ? 'bg-[#b91c1c] text-white' : 'bg-stone-100 text-stone-500 hover:bg-stone-200'}`}
    >
      <span className={`w-7 h-4 rounded-full relative transition-colors flex-shrink-0 ${active ? 'bg-white/30' : 'bg-stone-300'}`}>
        <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${active ? 'left-3.5' : 'left-0.5'}`} />
      </span>
      {active ? 'Override: ON' : 'Override: OFF'}
    </button>
  )
}

// Standalone admin-panel entry point for both tiers — Super Admin (tech-dept) and
// Admin-tier members alike navigate here from PLMTopBar's "Super Admin Mode" link.
export default function PLMSecurityPage() {
  const { tier, checking } = usePlmSecurityGuard()
  const [tab, setTab] = useState('relationships')
  const [toast, setToast] = useState(null)
  const notify = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3500) }

  if (checking || !tier) return null

  const tabs = tier === 'super_admin' ? TABS_SUPER_ADMIN : TABS_ADMIN

  return (
    <AdminShell>
      <div className="px-8 py-8 max-w-6xl">
        <div className="flex items-start justify-between gap-4">
          <PageHeader
            title="Accessibility and Roles"
            subtitle={tier === 'super_admin'
              ? 'Full oversight — relationships, permissions, admins, and moderation. New orgs/users are created from the Organisations/Members admin pages.'
              : 'Scoped to the buyer/supplier orgs assigned to you.'}
          />
          <div className="flex items-center gap-2 flex-shrink-0">
            {tier === 'super_admin' && <MasterKeySwitch />}
            <Link
              to="/plm"
              className="px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            >
              Back to PLM
            </Link>
          </div>
        </div>

        {toast && (
          <div className="mb-4 px-4 py-2.5 bg-stone-900 text-white text-sm rounded-lg">{toast}</div>
        )}

        <div className="flex gap-1 border-b border-stone-200 mb-6">
          {tabs.map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium capitalize border-b-2 -mb-px transition-colors ${
                tab === t ? 'border-stone-900 text-stone-900' : 'border-transparent text-stone-400 hover:text-stone-700'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Every tab mounts once (on first visit) and stays mounted — switching tabs
            just toggles visibility instead of unmount/remount, so flipping back and
            forth doesn't re-fire each tab's data fetch. Each tab gets its own manual
            Refresh action instead, since there's no realtime subscription on this data. */}
        <div className={tab === 'relationships' ? '' : 'hidden'}>
          <RelationshipsTab tier={tier} notify={notify} />
        </div>
        <div className={tab === 'permissions' ? '' : 'hidden'}>
          <PermissionsTab tier={tier} notify={notify} />
        </div>
        {tier === 'super_admin' && (
          <>
            <div className={tab === 'admins' ? '' : 'hidden'}>
              <AdminsTab notify={notify} />
            </div>
            <div className={tab === 'moderation' ? '' : 'hidden'}>
              <ModerationTab notify={notify} />
            </div>
          </>
        )}
      </div>
    </AdminShell>
  )
}
