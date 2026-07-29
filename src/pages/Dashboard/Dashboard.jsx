import { Outlet } from 'react-router-dom'
import Sidebar from '../../components/ui/Sidebar'
import Header from '../../components/ui/Header'
import { useDashboardData } from '../../hooks/useDashboardData'
import { useUiStore } from '../../stores/uiStore'
import { useOrgDepartment, useProfileHeader, useRole, useAllowedModules } from '../../stores/profileStore'
import { useAuth } from '../../hooks/useAuth'

export default function Dashboard() {
  const dept           = useOrgDepartment() ?? 'Merchandising'
  const role           = useRole() ?? 'Merchant'
  const profile        = useProfileHeader()
  const allowedModules = useAllowedModules()
  const { signOut } = useAuth()

  const sidebarCollapsed   = useUiStore((s) => s.sidebarCollapsed)
  const mobileOpen         = useUiStore((s) => s.mobileOpen)
  const setSidebarCollapsed = useUiStore((s) => s.setSidebarCollapsed)
  const setMobileOpen      = useUiStore((s) => s.setMobileOpen)

  // Keep alive so AnalyticsSection shares the same cached fetch
  const { reload, error } = useDashboardData()

  return (
    <div className="flex h-dvh overflow-hidden bg-[#f8f8f8]">
      <Sidebar
        role={role}
        allowedModules={allowedModules}
        collapsed={sidebarCollapsed}
        onCollapseChange={setSidebarCollapsed}
        mobileOpen={mobileOpen}
        onMobileOpen={() => setMobileOpen(true)}
        onMobileClose={() => setMobileOpen(false)}
      />

      <main className={`flex-1 flex flex-col min-w-0 min-h-0 bg-white transition-all ${sidebarCollapsed ? 'lg:ml-0' : ''}`}>
        <Header
          dept={dept}
          profile={profile}
          onLogout={signOut}
        />

        <section className="flex-1 min-h-0 overflow-y-auto">
          <div className="w-full h-full flex flex-col">
            {error && (
              <div className="mb-4 py-3 px-4 rounded-lg bg-red-50 text-red-700 text-sm">
                {error}
                <button type="button" onClick={reload} className="ml-2 underline font-medium">
                  Retry
                </button>
              </div>
            )}
            <Outlet />
          </div>
        </section>
      </main>
    </div>
  )
}
