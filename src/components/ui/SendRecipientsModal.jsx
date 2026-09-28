import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSendMailStore } from '../../stores/sendMailStore'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const blankRow = (id) => ({ id, name: '', email: '', adding: false, error: null })

// Human-readable text for each `skipped` code a preview endpoint can
// return (see the various /preview routes in shopify-backend's
// inspectionSchedule.js) - keyed here, not in the store, so the store
// stays data-only and new codes/wording can be added without touching it.
// `http_*` covers anything the store couldn't map to a real code (a non-
// 2xx response with no recognizable `skipped` field, e.g. the route itself
// doesn't exist yet) - a deploy/connectivity problem, not "nothing to
// send", so it gets its own distinct message rather than being lumped in
// with a legitimate empty-recipients case.
const SKIP_MESSAGES = {
  no_recipients:     'No recipients were found to notify for this.',
  report_not_found:  'This report could no longer be found.',
  entry_not_found:   'This schedule entry could no longer be found.',
  callout_not_found: 'This callout could no longer be found.',
}
function skipMessage(code) {
  if (SKIP_MESSAGES[code]) return SKIP_MESSAGES[code]
  if (code?.startsWith('http_')) return "Couldn't reach the server to resolve recipients. Please try again in a moment."
  return 'Nothing to send.'
}

// A growable list of "Add contact" rows (name/email/in-flight/error each) -
// used twice below (vendor-side and buyer-side), each independent so
// filling in one doesn't affect the other. Starts with one row; "+ Add
// Contact" appends another so several people can be entered without saving
// one, waiting for its fields to clear, then starting the next.
function useContactRows(addFn, onAdded) {
  const nextId = useRef(1)
  const [rows, setRows] = useState(() => [blankRow(0)])

  const reset = () => { nextId.current = 1; setRows([blankRow(0)]) }
  const addRow = () => setRows(prev => [...prev, blankRow(nextId.current++)])
  // Never drop the last row - an empty section with no fields at all would
  // have no way to add a first contact again without a fresh dialog open.
  const removeRow = (id) => setRows(prev => (prev.length > 1 ? prev.filter(r => r.id !== id) : prev))
  const updateRow = (id, patch) => setRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)))

  const submitRow = async (id, existingEmails) => {
    const row = rows.find(r => r.id === id)
    if (!row) return
    const trimmed = row.email.trim()
    if (!trimmed) return
    if (!EMAIL_RE.test(trimmed)) { updateRow(id, { error: 'Enter a valid email address.' }); return }
    if (existingEmails.some(e => e.toLowerCase() === trimmed.toLowerCase())) {
      updateRow(id, { error: 'Already on the list.' }); return
    }
    updateRow(id, { error: null, adding: true })
    try {
      const contact = await addFn(row.name.trim(), trimmed)
      onAdded(contact)
      // Cleared back to blank rather than removed - keeps this row's slot
      // in place instead of the list jumping, and it's immediately ready
      // for another entry.
      updateRow(id, { name: '', email: '', adding: false, error: null })
    } catch (err) {
      updateRow(id, { adding: false, error: err.message || 'Failed to save contact.' })
    }
  }

  return { rows, addRow, removeRow, submitRow, updateRow, reset }
}

// One "Add contact" section - used twice (vendor-side, buyer-side) with a
// different `title`/`orgName`/`contactRows`. The org selector gets its own
// full-width row - a long display name (e.g. "JS INTERNATIONAL") sized
// against Name+Email+Add sharing one row was overflowing the modal's fixed
// width, pushing Add outside the box entirely.
function AddContactSection({ title, orgName, contactRows, existingEmails, showOrgLabel = true }) {
  const { rows, addRow, removeRow, submitRow, updateRow } = contactRows
  return (
    <div className="px-5 py-3 border-t border-gray-100">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">{title}</p>
      {showOrgLabel && (
        <select
          disabled
          value={orgName || ''}
          title="Saved contacts apply on every future PO for this customer + vendor"
          className="w-full mb-1.5 px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-500 bg-gray-50 disabled:opacity-100 truncate"
        >
          <option>{orgName || '-'}</option>
        </select>
      )}
      {rows.map(row => (
        <div key={row.id} className="mb-1.5">
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={row.name}
              onChange={e => updateRow(row.id, { name: e.target.value, error: null })}
              placeholder="Name"
              autoComplete="off"
              className="w-1/3 min-w-0 px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-900 focus:outline-none focus:border-gray-900 transition-colors placeholder:text-gray-400"
            />
            <input
              type="email"
              value={row.email}
              onChange={e => updateRow(row.id, { email: e.target.value, error: null })}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submitRow(row.id, existingEmails) } }}
              placeholder="Email"
              autoComplete="off"
              className="flex-1 min-w-0 px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-900 focus:outline-none focus:border-gray-900 transition-colors placeholder:text-gray-400"
            />
            <button
              type="button"
              onClick={() => submitRow(row.id, existingEmails)}
              disabled={row.adding}
              className="flex-shrink-0 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              {row.adding ? 'Adding…' : 'Add'}
            </button>
            {rows.length > 1 && (
              <button
                type="button"
                onClick={() => removeRow(row.id)}
                title="Remove this row"
                className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            )}
          </div>
          {row.error && <p className="text-xs text-red-600 mt-1">{row.error}</p>}
        </div>
      ))}
      <button
        type="button"
        onClick={addRow}
        className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-gray-900 transition-colors"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
        Add Contact
      </button>
    </div>
  )
}

// Recipient-confirmation dialog shown before an inspection notification
// email actually sends - one instance mounted at the app-shell layer
// (Dashboard.jsx) so it survives regardless of which page/modal requested
// it (see sendMailStore.js for why). Every resolved recipient starts
// checked; when the trigger has vendor/buyer context (see `vendor`/`buyer`
// in the store), matching "Add vendor contact"/"Add buyer contact" sections
// let a new name+email be saved for that PO's vendor or buyer - persisted
// (vendor_contacts/buyer_contacts tables) so it shows up pre-checked
// automatically on every future PO tied to the same vendor/buyer, not just
// this one send. A third "Add other contact" section always shows
// regardless of vendor/buyer context - for anyone else (our own org,
// someone with no vendor/buyer tie to this PO) - this one is one-off and
// this-send-only, no persistence, so it's always available with nothing to
// gate it on.
export default function SendRecipientsModal() {
  const queue = useSendMailStore(s => s.queue)
  const loading = useSendMailStore(s => s.loading)
  const recipients = useSendMailStore(s => s.recipients)
  const vendor = useSendMailStore(s => s.vendor)
  const buyer = useSendMailStore(s => s.buyer)
  const sending = useSendMailStore(s => s.sending)
  const error = useSendMailStore(s => s.error)
  const skipped = useSendMailStore(s => s.skipped)
  const confirm = useSendMailStore(s => s.confirm)
  const cancel = useSendMailStore(s => s.cancel)
  const addVendorContact = useSendMailStore(s => s.addVendorContact)
  const addBuyerContact = useSendMailStore(s => s.addBuyerContact)
  const addLinkContact = useSendMailStore(s => s.addLinkContact)
  const canSaveOther = useSendMailStore(s => !!s.queue[0]?.buildLinkContactRequest)

  const [checked, setChecked] = useState(() => new Set())
  const [adHoc, setAdHoc] = useState([])       // [{ email, name, department }]

  const addContact = (contact, department) => {
    setAdHoc(prev => [...prev, { email: contact.email, name: contact.name || contact.email, department }])
    setChecked(prev => new Set(prev).add(contact.email))
  }
  // Vendor and Buyer contacts are saved for this Customer + Vendor pair (backend
  // link contacts). If saving fails (e.g. the table is not set up yet) the person still
  // gets THIS email; they just are not remembered for future POs.
  const [pairNotSaved, setPairNotSaved] = useState(false)
  const savePairContact = (fn) => async (name, email) => {
    try {
      setPairNotSaved(false)
      return { ...(await fn(name, email)), saved: true }
    } catch {
      setPairNotSaved(true)
      return { name, email, saved: false }
    }
  }
  const vendorRows = useContactRows(savePairContact(addVendorContact), c => addContact(c, c.saved ? 'vendor' : null))
  const buyerRows = useContactRows(savePairContact(addBuyerContact), c => addContact(c, c.saved ? 'buyer' : null))
  // Anyone from our own org, not just vendor/buyer-side - a one-off add for
  // this send only (no vendor_contacts/buyer_contacts-style persistence, no
  // org tied to it), so the "add" here is just folding the row straight
  // into this send's ad-hoc list rather than a real API call.
  // With a Customer + Vendor context (Send Mail from PO Inspection) the contact
  // is saved for that pair and comes back pre-checked on their future POs; with
  // no such context it stays one-off, as before.
  const [otherNotSaved, setOtherNotSaved] = useState(false)
  const orgRows = useContactRows(
    async (name, email) => {
      if (!canSaveOther) return { name, email }
      try {
        setOtherNotSaved(false)
        return { ...(await addLinkContact(name, email)), saved: true }
      } catch {
        // Saving failed (e.g. the table is not set up yet): the person still
        // gets THIS email, they just are not remembered for future POs.
        setOtherNotSaved(true)
        return { name, email, saved: false }
      }
    },
    c => addContact(c, c.saved ? 'other' : null)
  )

  // A queue head with `auto: true` (InspectionScheduleForm.jsx's own
  // notify) never shows this dialog - sendMailStore.js's own _startHead
  // auto-confirms it straight through, so `open` staying false for it isn't
  // just skipping a render, it genuinely never has anything to show.
  const open = queue.length > 0 && !queue[0]?.auto

  // Reset local per-dialog state whenever a fresh recipient list lands -
  // otherwise the previous request's unchecks/ad-hoc adds would bleed into
  // the next queued one. Adjusted during render (React's documented
  // pattern, same convention InspectionReportEntry.jsx uses for its own
  // prevPoId reset) rather than in an effect, so the checkbox list never
  // paints a frame carrying the previous request's selections.
  const [lastRecipients, setLastRecipients] = useState(null)
  if (recipients && recipients !== lastRecipients) {
    setLastRecipients(recipients)
    setChecked(new Set(recipients.map(r => r.email)))
    setAdHoc([])
    vendorRows.reset()
    buyerRows.reset()
    orgRows.reset()
    setOtherNotSaved(false)
    setPairNotSaved(false)
  }

  if (!open) return null

  // "Nothing to send" - the preview request came back but there's truly
  // nothing to confirm (no recipients, or a route/deploy problem). A
  // compact notice instead of the full recipient-picker layout, matching
  // InspectionReportEntry.jsx's own "Nothing to send" dialog for a missing
  // report - same shape, just generic enough to cover every trigger this
  // shared store serves, not just that one.
  if (skipped) {
    return createPortal(
      <>
        <div className="fixed inset-0 z-[200] bg-black/40" onClick={cancel} />
        <div className="fixed inset-0 z-[210] flex items-center justify-center p-4 pointer-events-none">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm flex flex-col pointer-events-auto">
            <div className="px-5 pt-5 pb-4">
              <h3 className="text-sm font-bold text-gray-900">Nothing to send</h3>
              <p className="text-xs text-gray-500 mt-1.5">{skipMessage(skipped)}</p>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 pb-5">
              <button type="button" onClick={cancel}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-gray-900 hover:bg-gray-700 transition-colors">
                OK
              </button>
            </div>
          </div>
        </div>
      </>,
      document.body
    )
  }

  const allRows = [...(recipients || []), ...adHoc]
  const allEmails = allRows.map(r => r.email)

  const toggle = (email) => setChecked(prev => {
    const next = new Set(prev)
    if (next.has(email)) next.delete(email)
    else next.add(email)
    return next
  })

  const allChecked = allEmails.length > 0 && allEmails.every(e => checked.has(e))
  const toggleAll = () => setChecked(allChecked ? new Set() : new Set(allEmails))

  const handleSend = () => {
    confirm(allRows.filter(r => checked.has(r.email)).map(r => r.email))
  }

  return createPortal(
    <>
      <div className="fixed inset-0 z-[200] bg-black/40" onClick={!sending ? cancel : undefined} />
      <div className="fixed inset-0 z-[210] flex items-center justify-center p-4 pointer-events-none">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col pointer-events-auto max-h-[85vh]">

          <div className="px-5 pt-5 pb-3 border-b border-gray-100">
            <h3 className="text-sm font-bold text-gray-900">Send notification email</h3>
            <p className="text-xs text-gray-500 mt-1">Review who this goes to before it sends.</p>
          </div>

          {/* One shared scroll region for the recipient list AND every "Add
              contact" section below it - previously each Add section sat
              outside the list's own overflow-y-auto as a plain flex sibling
              with no scroll behavior of its own, so on a short viewport
              (tablet landscape, a small laptop window) where header + list +
              three Add sections + footer add up to more than the card's
              max-h-[85vh], those later sections (and the Cancel/Send Mail
              footer) had nowhere to go - clipped by the viewport or
              overlapping whatever sat behind the modal, since nothing made
              them scrollable. Header and footer stay outside this div (fixed
              in place, always visible); everything in between now scrolls
              together as one unit within the card's own height cap. */}
          <div className="px-5 py-3 overflow-y-auto flex-1 min-h-0">
            {loading && (
              <div className="flex items-center gap-2 text-xs text-gray-500 py-4">
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                Resolving recipients…
              </div>
            )}
            {error && <p className="text-xs text-red-600 py-2">{error}</p>}
            {!loading && !error && allRows.length === 0 && (
              <p className="text-xs text-gray-500 py-4">No recipients found for this notification.</p>
            )}
            {!loading && allRows.length > 1 && (
              <div className="flex items-center justify-between pb-1.5 mb-1 border-b border-gray-100">
                <span className="text-[11px] text-gray-400">{allEmails.filter(e => checked.has(e)).length} of {allEmails.length} selected</span>
                <button type="button" onClick={toggleAll} disabled={sending}
                  className="text-xs font-semibold text-gray-700 hover:text-gray-900 disabled:opacity-50 transition-colors">
                  {allChecked ? 'Deselect all' : 'Select all'}
                </button>
              </div>
            )}
            {!loading && allRows.map(r => (
              <label key={r.email} className="flex items-center gap-2.5 py-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checked.has(r.email)}
                  onChange={() => toggle(r.email)}
                  className="w-3.5 h-3.5 rounded border-gray-300 text-gray-900 focus:ring-gray-400"
                />
                <span className="text-xs text-gray-900 font-medium">{r.name || r.email}</span>
                {r.department && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 bg-gray-100 rounded px-1.5 py-0.5 flex-shrink-0">
                    {r.department}
                  </span>
                )}
                <span className="text-xs text-gray-400 truncate">{r.email}</span>
              </label>
            ))}

            {!loading && vendor && (
              <AddContactSection title="Add vendor contact (saved for this customer + vendor)" orgName={vendor.name} contactRows={vendorRows} existingEmails={allEmails} />
            )}
            {!loading && buyer && (
              <AddContactSection title="Add buyer contact (saved for this customer + vendor)" orgName={buyer.name} contactRows={buyerRows} existingEmails={allEmails} showOrgLabel={false} />
            )}
            {!loading && (
              <>
                <AddContactSection
                  title={canSaveOther && vendor && buyer ? 'Add other contact (saved for this customer + vendor)' : 'Add other contact'}
                  contactRows={orgRows}
                  existingEmails={allEmails}
                  showOrgLabel={false}
                />
                {(otherNotSaved || pairNotSaved) && (
                  <p className="px-5 pb-2 text-[11px] text-amber-600">Added to this email only. It could not be saved for future POs.</p>
                )}
              </>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 px-5 pb-5 pt-2 border-t border-gray-100 flex-shrink-0">
            <button type="button" onClick={cancel} disabled={sending}
              className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSend}
              disabled={loading || sending || checked.size === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-gray-900 hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              {sending && (
                <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
              )}
              {sending ? 'Sending…' : 'Send Mail'}
            </button>
          </div>

        </div>
      </div>
    </>,
    document.body
  )
}
