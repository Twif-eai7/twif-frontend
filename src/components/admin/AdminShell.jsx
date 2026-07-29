import { NavLink, useNavigate } from 'react-router-dom'
import  LogoMark  from '../ui/LogoMark'
import { useAuth } from '../../hooks/useAuth'

const NAV = [
  {
    to: '/admin/approvals',
    label: 'Approvals',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M13.25 8.5v4.75a.5.5 0 0 1-.5.5H3.25a.5.5 0 0 1-.5-.5V3.25a.5.5 0 0 1 .5-.5H8" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
        <path d="m5.75 8 2 2 4.5-5.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    to: '/admin/organisations',
    label: 'Manage Organisations',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M2.75 13.25V5.75a2 2 0 0 1 2-2h6.5a2 2 0 0 1 2 2v7.5M1.75 13.25h12.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
        <path d="M6.25 13.25V10.5a1.75 1.75 0 0 1 3.5 0v2.75" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
        <path d="M5.75 6.75h.5m3.5 0h.5M5.75 9h.5m3.5 0h.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    to: '/admin/members',
    label: 'Manage Members',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M10.5 13.25v-1a2.75 2.75 0 0 0-2.75-2.75h-3A2.75 2.75 0 0 0 2 12.25v1" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
        <circle cx="6.25" cy="5.25" r="2.5" stroke="currentColor" strokeWidth="1.25" />
        <path d="M13.25 13.25v-1a2.75 2.75 0 0 0-2-2.646M11.25 2.854a2.75 2.75 0 0 1 0 4.792" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    to: '/admin/analytics',
    label: 'Analytics',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M2.75 13.25h10.5M5.25 13.25V7.75m2.75 5.5V5.25m2.75 8V9.25" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    to: '/admin/signature',
    label: 'Signature Settings',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M2.75 11.75c1.5-2 2.5-2 3.5 0s2-2.5 3.5-1 2.75-3 3.5-1.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M2.75 13.25h10.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      </svg>
    ),
  },
]

export function AdminShell({ children }) {
  const { signOut, user } = useAuth()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/auth', { replace: true })
  }

  return (
    <div className="flex min-h-screen bg-stone-50" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>

      {/* ── Sidebar ─────────────────────────────── */}
      <aside className="fixed inset-y-0 left-0 w-56 bg-white border-r border-stone-200 flex flex-col z-30">

        {/* Logo */}
        <div className="px-5 py-4 border-b border-stone-100 flex items-center gap-2.5">
          <LogoMark size={26} />
          <div>
            <div
              className="text-stone-900 text-base"
              style={{ fontFamily: "serif" }}
            >
              JNG Portal
            </div>
            <div className="text-[10px] font-medium text-stone-400 uppercase tracking-widest mt-0.5">
              Admin
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {NAV.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors
                ${isActive
                  ? 'bg-stone-100 text-stone-900'
                  : 'text-stone-500 hover:text-stone-800 hover:bg-stone-50'
                }`
              }
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Merchant dashboard link */}
        <div className="px-3 pb-2">
          <NavLink
            to="/merchant-dashboard"
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors
              ${isActive
                ? 'bg-stone-100 text-stone-900'
                : 'text-stone-500 hover:text-stone-800 hover:bg-stone-50'
              }`
            }
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="2.75" y="2.75" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.25" />
              <rect x="8.75" y="2.75" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.25" />
              <rect x="2.75" y="8.75" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.25" />
              <rect x="8.75" y="8.75" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.25" />
            </svg>
            Merchant Dashboard
          </NavLink>
          <NavLink
            to="/dashboard/analytics-demo"
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors
              ${isActive
                ? 'bg-stone-100 text-stone-900'
                : 'text-stone-500 hover:text-stone-800 hover:bg-stone-50'
              }`
            }
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2.75 13.25h10.5M5.25 13.25V7.75m2.75 5.5V5.25m2.75 8V9.25" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
            </svg>
            Dashboard Demo
          </NavLink>
        </div>

        {/* User + sign out */}
        <div className="px-4 py-4 border-t border-stone-100">
          <div className="text-xs text-stone-400 truncate mb-3">{user?.email}</div>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 text-sm text-stone-500 hover:text-stone-800 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M6.25 2.75H3.75a1 1 0 0 0-1 1v8.5a1 1 0 0 0 1 1h2.5M10.25 11.25 13.5 8l-3.25-3.25M13.5 8H6.25" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main ────────────────────────────────── */}
      <main className="ml-56 flex-1 min-h-screen">
        {children}
      </main>
    </div>
  )
}