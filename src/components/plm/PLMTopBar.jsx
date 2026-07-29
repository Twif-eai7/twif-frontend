import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useRole, useProfileHeader } from '../../stores/profileStore'
import { useAuthStore } from '../../stores/authStore'

function UserMenu({ header, onLogout }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 cursor-pointer hover:opacity-70 transition-opacity"
      >
        <div className="w-7 h-7 rounded-full bg-[#1A1A18] flex items-center justify-center flex-shrink-0">
          <span className="text-[10px] font-black text-[#fbf9f5] tracking-wide leading-none">
            {header?.initials || '--'}
          </span>
        </div>
        <span className="text-[11px] font-bold uppercase tracking-[.08em] text-[#1A1A18]">
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
  const navigate      = useNavigate()
  const signOut       = useAuthStore(s => s.signOut)
  const isBuyerOrSupplier = role === 'Buyer' || role === 'Supplier'

  const handleLogout = async () => {
    await signOut?.()
    navigate('/auth', { replace: true })
  }

  return (
    <div className="flex items-center justify-between px-4 py-2 border-b-2 border-[#1A1A18] bg-[#fbf9f5] sticky top-0 z-[100] flex-shrink-0">
      <span className="text-[32px] font-black uppercase tracking-tight leading-none text-[#1A1A18]">
        Pd-PLM
      </span>
      <div className="flex items-center gap-4">
        {!isBuyerOrSupplier && (
          <Link
            to="/dashboard"
            className="text-[11px] font-bold uppercase tracking-[.08em] text-[#1A1A18] hover:opacity-45 transition-opacity"
          >
            Dashboard
          </Link>
        )}
        {isBuyerOrSupplier && (
          <UserMenu header={header} onLogout={handleLogout} />
        )}
      </div>
    </div>
  )
}
