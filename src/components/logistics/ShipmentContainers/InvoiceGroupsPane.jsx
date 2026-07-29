import { useState, useMemo } from 'react'
import NewInvoiceRow from './NewInvoiceRow'
import { useInvoiceDetailsForm } from '../../../hooks/useInvoiceDetailsForm'

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )
}

const STATUS_BADGE = {
  group:  { text: 'Not Raised',      cls: 'bg-amber-100 text-amber-800' },
  raised: { text: 'Raised · unbooked', cls: 'bg-blue-100 text-blue-800' },
  booked: { text: 'Booked',          cls: 'bg-emerald-100 text-emerald-800' },
}

// Same bar as isComplete in useInvoiceDetailsForm.js — only meaningful for
// still-bare groups (status 'group'); raised/booked ones are guaranteed
// complete already, since Raise Invoice can't fire without it.
function isGroupComplete(group) {
  return !!group.invoice_number?.trim() && !!group.invoice_date && !!group.invoice_value
}

function groupTitle(group) {
  if (group.invoice_number) return group.invoice_number
  if (!group.po_numbers.length) return 'Empty group'
  return `${group.po_numbers.length} PO${group.po_numbers.length > 1 ? 's' : ''} grouped`
}

function actionLabel(status) {
  if (status === 'group') return 'Raise Invoice'
  if (status === 'raised') return 'Edit Invoice'
  return 'View'
}

// Detail pane for a selected group/invoice — same accordion invoice-card
// design originally used in NewContainerForm (NewInvoiceRow's non-flat
// mode), reused here inline instead of inside a modal.
//
// This stage is raise/view only — PO composition, CBM, and the primary
// vendor are set by the merchant when they create/edit the group (Order
// Management → My Planned Shipments), so the multiselect here is always
// locked. Booked invoices go further and lock everything, with no save
// action at all — they're managed from the Containers stage instead.
function GroupDetailsForm({ buyerOrgId, group, readOnly, onSaved, onGoToContainer }) {
  const [formOpen, setFormOpen] = useState(true)
  const {
    isRaising, isComplete, submitting, submittingAction, error,
    invoice, setInvoice, invoiceFile, setInvoiceFile, packingListFile, setPackingListFile,
    existingInvoiceFileUrl, existingPackingListFileUrl,
    rates, handleSave, handleRaise,
  } = useInvoiceDetailsForm({ active: true, buyerOrgId, invoiceGroup: group, onSaved })

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {readOnly && (
        <div className="flex-shrink-0 flex items-center justify-between gap-2 px-4 pt-4">
          <p className="text-[11px] text-gray-400">Read-only — manage this invoice from the Containers stage.</p>
          <button type="button" onClick={() => onGoToContainer?.(group.container_id)}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 transition-colors flex-shrink-0">
            Go to Container
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
            </svg>
          </button>
        </div>
      )}
      {!readOnly && group.status === 'group' && (
        <div className="flex-shrink-0 px-4 pt-4">
          <p className="text-[11px] text-gray-400">
            PO composition, CBM, and vendor were set by the merchant when grouping — fill in the remaining invoice details below to raise it,
            or use Save to note down tracking info (e.g. invoice number "To be announced") before everything is final.
          </p>
        </div>
      )}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <NewInvoiceRow
          invoice={invoice}
          onChange={setInvoice}
          onRemove={() => {}}
          canRemove={false}
          group={group}
          file={invoiceFile}
          onFile={setInvoiceFile}
          invoiceFileUrl={existingInvoiceFileUrl}
          packingListFile={packingListFile}
          onPackingListFile={setPackingListFile}
          packingListFileUrl={existingPackingListFileUrl}
          rates={rates}
          readOnly={readOnly}
          isComplete={isComplete}
          isOpen={formOpen}
          onToggle={() => setFormOpen(o => !o)}
        />
        {error && (
          <div className="flex items-center gap-2 mt-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
            {error}
          </div>
        )}
      </div>
      {!readOnly && (
        <div className="flex-shrink-0 flex items-center justify-end gap-3 px-4 py-3 border-t border-gray-200 bg-white">
          {isRaising && (
            <button type="button" onClick={handleSave} disabled={submitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors">
              {submittingAction === 'save' ? 'Saving…' : 'Save'}
            </button>
          )}
          {/* Once raised, Save Changes is gated by isComplete too — an
              already-raised invoice can't be edited back into an incomplete
              state, since completeness is what let it get raised in the
              first place. Only the still-bare Save above stays unrestricted. */}
          <button type="button" onClick={isRaising ? handleRaise : handleSave} disabled={submitting || !isComplete}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gray-900 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 transition-colors">
            {isRaising
              ? (submittingAction === 'raise' ? 'Raising…' : 'Raise Invoice')
              : (submittingAction === 'save' ? 'Saving…' : 'Save Changes')}
          </button>
        </div>
      )}
    </div>
  )
}

// Stage 2 of the pipeline: shipment_invoices rows spanning all three
// lifecycle states for this buyer. Layout mirrors ContainerList +
// ContainerDetail — a narrow left list and a right-hand detail pane for
// whichever group is selected.
export default function InvoiceGroupsPane({ buyerOrgId, groups, loading, onUpdated, onGoToContainer }) {
  const [search, setSearch] = useState('')
  const [selectedGroupId, setSelectedGroupId] = useState(null)

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return groups
    return groups.filter(g =>
      g.invoice_number?.toLowerCase().includes(term) ||
      g.po_numbers.some(n => n.toLowerCase().includes(term))
    )
  }, [groups, search])

  const selected = groups.find(g => g.id === selectedGroupId) || null

  return (
    <>
      {/* Left: narrow list — same width/structure as ContainerList */}
      <div className="flex flex-col bg-white border-gray-200 w-full md:w-72 md:border-r md:flex-shrink-0">
        <div className="px-3 pt-3 pb-3 border-b border-gray-200 flex-shrink-0 space-y-2">
          <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Invoice groups</span>
          <div className="relative">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none"
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search invoice # or PO #…"
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-gray-900"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && <div className="flex items-center justify-center py-10"><Spinner /></div>}
          {!loading && filtered.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-10">
              <p className="text-xs text-gray-400 text-center px-3">
                {groups.length === 0 ? 'No groups yet — merchants group planned POs from Order Management' : 'No groups match your search'}
              </p>
            </div>
          )}
          {!loading && filtered.map(group => {
            const badge = STATUS_BADGE[group.status]
            return (
              <div
                key={group.id}
                onClick={() => setSelectedGroupId(group.id)}
                className={`px-3 py-3.5 border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors
                  ${selectedGroupId === group.id ? 'bg-gray-100 border-l-2 border-l-gray-900' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm font-bold text-gray-900 truncate">{groupTitle(group)}</div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {group.status === 'group' && (() => {
                      const complete = isGroupComplete(group)
                      return (
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${complete ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                          {complete ? 'Complete' : 'Incomplete'}
                        </span>
                      )
                    })()}
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap ${badge.cls}`}>
                      {badge.text}
                    </span>
                  </div>
                </div>
                {group.pos.length === 0 ? (
                  <div className="text-xs text-gray-600 mt-0.5">—</div>
                ) : (
                  <div className="mt-1 space-y-0.5">
                    {group.pos.map(po => (
                      <div key={po.id} className="flex items-center justify-between gap-2">
                        <span className="text-xs text-gray-700 truncate">{po.po_number}</span>
                        <span className="text-[11px] text-gray-400 truncate">{po.actual_vendor_name || '—'}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-center justify-between gap-2 mt-1.5">
                  {group.cbm != null ? <span className="text-[11px] text-gray-500">CBM: {group.cbm}</span> : <span />}
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); setSelectedGroupId(group.id) }}
                    className={`text-[11px] font-semibold transition-colors
                      ${group.status === 'group' ? 'text-indigo-600 hover:text-indigo-800' : 'text-gray-600 hover:text-gray-900'}`}
                  >
                    {actionLabel(group.status)}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Right: detail pane for the selected group */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-gray-50 w-full">
        {!selected ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="1.5">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
            </svg>
            <p className="text-sm text-gray-400">Select a group to view its details</p>
          </div>
        ) : (
          <GroupDetailsForm
            key={selected.id}
            buyerOrgId={buyerOrgId}
            group={selected}
            readOnly={selected.status === 'booked'}
            onSaved={() => onUpdated?.()}
            onGoToContainer={onGoToContainer}
          />
        )}
      </div>
    </>
  )
}
