import { useNavigate } from 'react-router-dom'
import { useIsAdmin, useRole } from '../../stores/profileStore'
import { useAlertsTrigger } from '../../hooks/useAlerts'
import AlertsDrawer from './AlertsDrawer'

export default function Header({ dept, profile, onLogout }) {
  const isAdmin = useIsAdmin()
  const role    = useRole()
  const { unreadCount, openDrawer } = useAlertsTrigger()
  const navigate = useNavigate()

  const name         = profile?.name ?? '--'
  const businessName = profile?.businessName ?? ''
  const businessLogo = profile?.businessLogo
  const initials     = profile?.initials
    ?? (businessName ? businessName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) : '--')

  const displayRole = dept && businessName
    ? `${dept} | ${businessName}`
    : businessName || dept || ''

  async function handleLogout() {
    if (typeof onLogout === 'function') await onLogout()
    navigate('/auth', { replace: true })
  }

  const avatar = (sizeClass) => (
    <div className={`${sizeClass} rounded-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center overflow-hidden shadow border-2 border-white flex-shrink-0`}>
      {businessLogo
        ? <img src={businessLogo} alt={name} className="w-full h-full object-contain" />
        : <span className="font-semibold text-gray-600 text-sm lg:text-xl">{initials}</span>
      }
    </div>
  )

  return (
    <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-[90]">

      {/* ── Mobile layout (below lg) ─────────────────────────────────────────── */}
      <div className="lg:hidden">

        {/* Row 1: action buttons — right-aligned, pl-14 clears the hamburger */}
        <div className="flex items-center justify-end gap-1.5 pl-12 pr-3 pt-2 pb-1.5">
          {isAdmin && (
            <button
              type="button"
              onClick={() => navigate('/admin/approvals')}
              className="inline-flex items-center gap-1 h-9 px-2.5 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-[#1100ff] hover:bg-[#1100ff] hover:text-white transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Admin
            </button>
          )}

          {role === 'Merchant' && (
            <>
              <button
                type="button"
                onClick={openDrawer}
                className="relative flex items-center justify-center w-9 h-9 rounded-lg border border-gray-200 bg-white text-red-600 hover:bg-gray-50 transition-colors"
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 text-[9px] font-bold text-white px-0.5">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>
              <AlertsDrawer />
            </>
          )}

          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center justify-center w-9 h-9 rounded-lg border border-gray-900 bg-gray-900 text-white hover:bg-gray-800 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>

        {/* Row 2: profile identity */}
        <div className="flex items-center gap-3 px-4 pb-3">
          {avatar('w-10 h-10')}
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-gray-900 truncate leading-tight">{name}</h1>
            <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide truncate mt-0.5">{displayRole}</p>
          </div>
        </div>

      </div>

      {/* ── Desktop layout (lg+) ─────────────────────────────────────────────── */}
      <div className="hidden lg:block px-8 py-4">
        <div className="flex items-center justify-between gap-4">

          {/* Profile */}
          <div className="flex items-center gap-4">
            {avatar('w-14 h-14')}
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">{name}</h1>
              <p className="mt-1 text-[10px] font-medium text-gray-500 uppercase tracking-wide">{displayRole}</p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {isAdmin && (
              <button
                type="button"
                onClick={() => navigate('/admin/approvals')}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-[#1100ff] shadow-sm hover:bg-[#1100ff] hover:text-white transition-colors"
              >
                ← Admin
              </button>
            )}

            <button
              type="button"
              onClick={() => navigate('/user-manual')}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-black shadow-sm hover:bg-black hover:text-white transition-colors"
            >
              User Manual
            </button>

            {(dept === 'Merchandising' || dept === '') && (
              <a
                href="https://mail.google.com/mail/u/0/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
              >
                Mail
              </a>
            )}

            {role === 'Merchant' && (
              <>
                <button
                  type="button"
                  onClick={openDrawer}
                  className="relative inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-red-600 shadow-sm hover:bg-gray-50"
                >
                  Alerts
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 text-[9px] font-bold text-white px-0.5">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </button>
                <AlertsDrawer />
              </>
            )}

            <button
              type="button"
              onClick={() => { window.location.href = 'https://www.jnitin.com/' }}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-orange-500 shadow-sm hover:bg-orange-500 hover:text-white transition-colors"
            >
              Home
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-900 bg-gray-900 text-xs font-semibold text-white shadow-sm hover:bg-gray-800"
            >
              Log Out
            </button>
          </div>

        </div>
      </div>

    </header>
  )
}
