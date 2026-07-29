import { usePlmStore } from '../../stores/plmStore'

export default function SelectionBar({ role, onEditSelected, onDeleteSelected, onCreateSamplePO, canCreateSamplePO, samplePODisabledReason, onCreateWorkspaces, onHold, canHold, onResume, canResume, onReject, canReject }) {
  const selectedIds    = usePlmStore(s => s.selectedIds)
  const clearSelection = usePlmStore(s => s.clearSelection)
  const count = selectedIds.size

  if (count === 0) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-[#1A1A18] text-[#F5F3EF] px-6 py-3.5 flex items-center gap-4 z-[500]">
      <div className="text-[12px] font-bold uppercase tracking-[.06em]">
        {count} SKU{count === 1 ? '' : 's'} selected
      </div>
      <div className="ml-auto flex gap-6 items-center">
        {role === 'merchant' && <>
          <button type="button" onClick={onCreateWorkspaces}
            className="border-none bg-none text-[#86efac] text-[11px] font-bold uppercase tracking-[.08em] cursor-pointer opacity-90 hover:opacity-50 transition-opacity">
            Create Workspaces
          </button>
          <button type="button" onClick={onEditSelected}
            className="border-none bg-none text-[#F5F3EF] text-[11px] font-bold uppercase tracking-[.08em] cursor-pointer opacity-90 hover:opacity-50 transition-opacity">
            Edit Attributes
          </button>
          <button type="button" onClick={onDeleteSelected}
            className="border-none bg-none text-[#ff8080] text-[11px] font-bold uppercase tracking-[.08em] cursor-pointer opacity-90 hover:opacity-50 transition-opacity">
            Delete
          </button>
          <div className="relative group/po">
            <button type="button" onClick={onCreateSamplePO} disabled={!canCreateSamplePO}
              className="border-none bg-none text-[#86efac] text-[11px] font-bold uppercase tracking-[.08em] cursor-pointer opacity-90 hover:opacity-50 transition-opacity disabled:opacity-30 disabled:cursor-default">
              Create Sample PO
            </button>
            {samplePODisabledReason && (
              <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2.5 hidden group-hover/po:block z-10">
                <div className="bg-[#1A1A18] text-[#F5F3EF] text-[9px] font-semibold uppercase tracking-[.06em] px-2.5 py-1.5 whitespace-nowrap">
                  {samplePODisabledReason}
                </div>
                <div className="w-2 h-2 bg-[#1A1A18] rotate-45 absolute -bottom-1 left-1/2 -translate-x-1/2" />
              </div>
            )}
          </div>
        </>}
        {role === 'buyer' && (
          <>
            {canHold && (
              <button type="button" onClick={onHold}
                className="border-none bg-none text-[#fcd34d] text-[11px] font-bold uppercase tracking-[.08em] cursor-pointer opacity-90 hover:opacity-50 transition-opacity">
                On Hold
              </button>
            )}
            {canResume && (
              <button type="button" onClick={onResume}
                className="border-none bg-none text-[#86efac] text-[11px] font-bold uppercase tracking-[.08em] cursor-pointer opacity-90 hover:opacity-50 transition-opacity">
                Continue
              </button>
            )}
            {canReject && (
              <button type="button" onClick={onReject}
                className="border-none bg-none text-[#ff8080] text-[11px] font-bold uppercase tracking-[.08em] cursor-pointer opacity-90 hover:opacity-50 transition-opacity">
                Reject
              </button>
            )}
          </>
        )}
        <button type="button" onClick={clearSelection}
          className="border-none bg-none text-[rgba(245,243,239,.5)] text-[11px] font-bold uppercase tracking-[.08em] cursor-pointer">
          Cancel
        </button>
      </div>
    </div>
  )
}
