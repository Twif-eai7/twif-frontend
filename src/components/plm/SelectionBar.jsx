import { usePlmStore } from '../../stores/plmStore'

export default function SelectionBar({ role, onEditSelected, onDeleteSelected, onCreateSamplePO, canCreateSamplePO, samplePODisabledReason, onCreateWorkspaces, onHold, canHold, onResume, canResume, onReject, canReject }) {
  const selectedIds    = usePlmStore(s => s.selectedIds)
  const clearSelection = usePlmStore(s => s.clearSelection)
  const count = selectedIds.size

  if (count === 0) return null

  // Built as a flat array (rather than nesting the actions in their own wrapper div) so every
  // item ends up a genuine direct child of the grid below — a `display: contents` wrapper was
  // tried first to get the same effect while keeping the JSX grouped, but that CSS value has
  // real cross-browser inconsistencies (particularly on mobile), which is exactly what showed
  // up as misaligned rows. Direct children is the only way that's reliably just... a grid.
  const actions = []
  if (role === 'merchant') {
    actions.push(
      <button key="workspaces" type="button" onClick={onCreateWorkspaces}
        className="flex-shrink-0 whitespace-nowrap border-none bg-none text-[#86efac] text-[11px] font-bold uppercase tracking-[.08em] cursor-pointer opacity-90 hover:opacity-50 transition-opacity">
        Create Workspaces
      </button>,
      <button key="edit" type="button" onClick={onEditSelected}
        className="flex-shrink-0 whitespace-nowrap border-none bg-none text-[#F5F3EF] text-[11px] font-bold uppercase tracking-[.08em] cursor-pointer opacity-90 hover:opacity-50 transition-opacity">
        Edit Attributes
      </button>,
      <button key="delete" type="button" onClick={onDeleteSelected}
        className="flex-shrink-0 whitespace-nowrap border-none bg-none text-[#ff8080] text-[11px] font-bold uppercase tracking-[.08em] cursor-pointer opacity-90 hover:opacity-50 transition-opacity">
        Delete
      </button>,
      <div key="samplepo" className="relative group/po flex-shrink-0">
        <button type="button" onClick={onCreateSamplePO} disabled={!canCreateSamplePO}
          className="flex-shrink-0 whitespace-nowrap border-none bg-none text-[#86efac] text-[11px] font-bold uppercase tracking-[.08em] cursor-pointer opacity-90 hover:opacity-50 transition-opacity disabled:opacity-30 disabled:cursor-default">
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
    )
  }
  if (role === 'buyer') {
    if (canHold) actions.push(
      <button key="hold" type="button" onClick={onHold}
        className="flex-shrink-0 whitespace-nowrap border-none bg-none text-[#fcd34d] text-[11px] font-bold uppercase tracking-[.08em] cursor-pointer opacity-90 hover:opacity-50 transition-opacity">
        On Hold
      </button>
    )
    if (canResume) actions.push(
      <button key="resume" type="button" onClick={onResume}
        className="flex-shrink-0 whitespace-nowrap border-none bg-none text-[#86efac] text-[11px] font-bold uppercase tracking-[.08em] cursor-pointer opacity-90 hover:opacity-50 transition-opacity">
        Continue
      </button>
    )
    if (canReject) actions.push(
      <button key="reject" type="button" onClick={onReject}
        className="flex-shrink-0 whitespace-nowrap border-none bg-none text-[#ff8080] text-[11px] font-bold uppercase tracking-[.08em] cursor-pointer opacity-90 hover:opacity-50 transition-opacity">
        Drop SKU{count === 1 ? '' : 's'}
      </button>
    )
  }
  actions.push(
    <button key="cancel" type="button" onClick={clearSelection}
      className="flex-shrink-0 whitespace-nowrap border-none bg-none text-[rgba(245,243,239,.5)] text-[11px] font-bold uppercase tracking-[.08em] cursor-pointer">
      Cancel
    </button>
  )

  return (
    // Mobile: the "N selected" label and every action are direct children of one 2-column
    // grid, so each row pairs left/right in the order they're listed — "N selected | Create
    // Workspaces", "Edit Attributes | Delete", "Create Sample PO | Cancel". justify-items-start
    // is deliberate, not decorative: without it, grid items default to stretching to fill their
    // column, and a <button>'s own browser-default text-align: center then centers its label
    // inside that stretched box — while the plain <div> label next to it doesn't stretch/center
    // the same way, so items ended up inconsistently left/center per row instead of all flush
    // left. sm: and up reverts to the original single-row layout (count left, actions pushed
    // right via sm:mr-auto on the count itself, everything else following in one flex line).
    <div className="fixed bottom-0 left-0 right-0 bg-[#1A1A18] text-[#F5F3EF] px-6 py-3 grid grid-cols-2 justify-items-start gap-x-6 gap-y-2 items-center sm:flex sm:items-center sm:gap-6 z-[500]">
      <div className="text-[12px] font-bold uppercase tracking-[.06em] flex-shrink-0 sm:mr-auto">
        {count} SKU{count === 1 ? '' : 's'} selected
      </div>
      {actions}
    </div>
  )
}
