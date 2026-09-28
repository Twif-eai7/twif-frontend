import { useState } from 'react'
import { usePLMMyGrants } from '../../hooks/usePLMMyGrants'
import { usePlmStore } from '../../stores/plmStore'

const CAPABILITY_LABEL = { view: 'View only', comment: 'Can comment', edit: 'Can edit' }

// Entry point for someone who's been granted access to a SKU workspace they otherwise
// have no role on — a permission grant alone doesn't put it anywhere in their normal
// catalog/dashboard, so this is their only way to find and open it without a direct link.
export function SharedWithMeTrigger() {
  const [open, setOpen] = useState(false)
  const { grants } = usePLMMyGrants()

  if (!grants.length) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative flex items-center gap-1 text-[9px] md:text-[11px] font-bold uppercase tracking-[.04em] md:tracking-[.08em] text-[#1A1A18] hover:opacity-45 transition-opacity whitespace-nowrap"
      >
        <span className="md:hidden">Shared</span>
        <span className="hidden md:inline">Shared With Me</span>
        <span className="inline-flex items-center justify-center min-w-[13px] h-[13px] md:min-w-[15px] md:h-[15px] px-1 bg-[#1A1A18] text-[#F5F3EF] text-[8px] md:text-[9px] font-bold rounded-full leading-none">
          {grants.length > 99 ? '99+' : grants.length}
        </span>
      </button>
      {open && <SharedWithMeDrawer onClose={() => setOpen(false)} />}
    </>
  )
}

function SharedWithMeDrawer({ onClose }) {
  const { grants, loading } = usePLMMyGrants()
  const openWorkspace = usePlmStore(s => s.openWorkspace)

  function openGrant(g) {
    if (!g.workspace_id) return
    openWorkspace(g.workspace_id)
    onClose()
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-[400]" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-80 md:w-96 bg-[#fbf9f5] z-[401] shadow-2xl flex flex-col border-l-2 border-[#1A1A18]">
        <div className="flex items-center justify-between px-5 py-4 border-b-2 border-[#1A1A18] flex-shrink-0">
          <span className="text-sm font-black uppercase tracking-tight text-[#1A1A18]">Shared With Me</span>
          <button onClick={onClose} className="text-stone-400 hover:text-[#1A1A18] transition-colors">
            <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M3 3l12 12M15 3L3 15" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-5 h-5 border-2 border-stone-300 border-t-stone-700 rounded-full animate-spin" />
            </div>
          ) : !grants.length ? (
            <div className="px-5 py-8 text-sm text-stone-400 text-center">Nothing shared with you yet.</div>
          ) : (
            grants.map(g => (
              <button
                key={g.id}
                onClick={() => openGrant(g)}
                className="w-full text-left px-5 py-3.5 border-b border-black/10 hover:bg-black/[.03] transition-colors flex items-center gap-3"
              >
                {g.workspace?.npd2_catalog_skus?.image_url ? (
                  <img src={g.workspace.npd2_catalog_skus.image_url} alt="" className="w-10 h-10 rounded object-cover border border-black/10 flex-shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded bg-stone-100 flex-shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-[#1A1A18] truncate">
                    {g.workspace?.npd2_catalog_skus?.auto_code || 'Unknown SKU'}
                  </div>
                  <div className="text-xs text-stone-500 truncate">
                    {CAPABILITY_LABEL[g.capability] || g.capability}
                    {g.granted_by_name ? ` · shared by ${g.granted_by_name}` : ''}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </>
  )
}
