import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useRole, useProfileHeader, useOrgDepartment } from '../../stores/profileStore'
import { useAuthStore } from '../../stores/authStore'
import { usePLMActivityTrigger } from '../../hooks/usePLMActivity'
import PLMActivityDrawer from './PLMActivityDrawer'
import { usePlmMasterKeyStore } from '../../stores/plmMasterKeyStore'
import { SharedWithMeTrigger } from './SharedWithMeDrawer'

// Navigates to the /admin/plm-security page (relationships/permissions/admins/
// moderation + the override toggle) instead of opening it as a modal.
function SuperAdminModeButton() {
  const active = usePlmMasterKeyStore(s => s.active)
  return (
    <Link
      to="/admin/plm-security"
      title={active ? 'Full PLM override is ON — click to open Super Admin Mode' : 'Open Super Admin Mode'}
      className={`flex items-center gap-1 text-[8px] md:text-[10px] font-bold uppercase tracking-[.04em] md:tracking-[.06em] rounded-full px-1.5 py-0.5 md:px-2.5 md:py-1 transition-colors whitespace-nowrap cursor-pointer
        ${active ? 'text-white bg-[#b91c1c] hover:opacity-80' : 'text-amber-700 bg-amber-100 hover:opacity-70'}`}
    >
      <svg width="9" height="9" className="md:w-[11px] md:h-[11px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="8" cy="15" r="4" /><path d="M10.5 12.5 20 3M17 6l3 3M14 9l2 2" />
      </svg>
      <span>{active ? 'Super Admin Mode: ON' : 'Super Admin Mode'}</span>
    </Link>
  )
}

function ActivityTrigger() {
  const { unreadTotal, openDrawer } = usePLMActivityTrigger()
  return (
    <button
      type="button"
      onClick={openDrawer}
      className="relative flex items-center gap-1 text-[9px] md:text-[11px] font-bold uppercase tracking-[.04em] md:tracking-[.08em] text-[#1A1A18] hover:opacity-45 transition-opacity whitespace-nowrap"
    >
      <span className="md:hidden">Activity</span>
      <span className="hidden md:inline">Activity Log</span>
      {unreadTotal > 0 && (
        <span className="inline-flex items-center justify-center min-w-[13px] h-[13px] md:min-w-[15px] md:h-[15px] px-1 bg-[#1A1A18] text-[#F5F3EF] text-[8px] md:text-[9px] font-bold rounded-full leading-none">
          {unreadTotal > 99 ? '99+' : unreadTotal}
        </span>
      )}
    </button>
  )
}

function UserMenu({ header, onLogout }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 cursor-pointer hover:opacity-70 transition-opacity"
      >
        <div className="w-6 h-6 md:w-7 md:h-7 rounded-full bg-[#1A1A18] flex items-center justify-center flex-shrink-0">
          <span className="text-[9px] md:text-[10px] font-black text-[#fbf9f5] tracking-wide leading-none">
            {header?.initials || '--'}
          </span>
        </div>
        <span className="hidden sm:inline text-[9px] md:text-[11px] font-bold uppercase tracking-[.04em] md:tracking-[.08em] text-[#1A1A18] whitespace-nowrap">
          {header?.name || ''}
        </span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[200]" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-[201] bg-[#fbf9f5] border border-black/10 rounded-xl shadow-lg px-3 py-2 min-w-[140px] flex flex-col gap-1">
            <button
              type="button"
              onClick={onLogout}
              className="text-[11px] font-bold uppercase tracking-[.08em] text-[#1A1A18] hover:opacity-45 transition-opacity text-left py-1 cursor-pointer"
            >
              Log Out
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export default function PLMTopBar() {
  const role          = useRole()
  const header        = useProfileHeader()
  const department    = useOrgDepartment()
  const navigate      = useNavigate()
  const signOut       = useAuthStore(s => s.signOut)
  const isBuyerOrSupplier = role === 'Buyer' || role === 'Supplier'

  const handleLogout = async () => {
    await signOut?.()
    navigate('/auth', { replace: true })
  }

  return (
    <div className="flex items-center justify-between px-2.5 md:px-4 py-2 border-b-2 border-[#1A1A18] bg-[#fbf9f5] sticky top-0 z-[100] flex-shrink-0 gap-2">
      <span className="text-[18px] md:text-[32px] font-black uppercase tracking-tight leading-none text-[#1A1A18] flex-shrink-0">
        Pd-PLM
      </span>
      <div className="flex items-center gap-2 md:gap-4 flex-wrap justify-end">
        {!isBuyerOrSupplier && department === 'tech' && <SuperAdminModeButton />}
        {!isBuyerOrSupplier && department === 'tech' && (
          <Link
            to="/plm/demo"
            title="Local sandbox SKU — tech only, nothing here touches real data"
            className="flex items-center gap-1 text-[8px] md:text-[10px] font-bold uppercase tracking-[.04em] md:tracking-[.06em] text-purple-700 bg-purple-100 rounded-full px-1.5 py-0.5 md:px-2.5 md:py-1 hover:opacity-70 transition-opacity whitespace-nowrap"
          >
            <svg width="9" height="9" className="md:w-[11px] md:h-[11px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
            </svg>
            <span className="md:hidden">Demo</span>
            <span className="hidden md:inline">Demo SKU</span>
          </Link>
        )}
        {!isBuyerOrSupplier && (
          <Link
            to="/dashboard"
            className="text-[9px] md:text-[11px] font-bold uppercase tracking-[.04em] md:tracking-[.08em] text-[#1A1A18] hover:opacity-45 transition-opacity whitespace-nowrap"
          >
            Dashboard
          </Link>
        )}
        {isBuyerOrSupplier && (
          <UserMenu header={header} onLogout={handleLogout} />
        )}
        <SharedWithMeTrigger />
        <ActivityTrigger />
      </div>
      <PLMActivityDrawer />
    </div>
  )
}
