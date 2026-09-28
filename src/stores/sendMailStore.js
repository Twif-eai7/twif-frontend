import { create } from 'zustand'

// Backs the recipient-confirmation dialog shown before an inspection
// notification email sends - today that's only InspectionReportEntry.jsx's
// manual "Send Mail" button. InspectionScheduleForm.jsx's own Save also
// queues through here (it fires immediately after its own DB write
// completes, then closes right away, so nothing local can host/await the
// actual network call), but sets `auto: true` to skip the dialog entirely
// and send straight to every resolved recipient - scheduling a new
// inspection shouldn't need a human to review/confirm it each time, unlike
// a deliberate Send Mail click. Rendered once at the shared app-shell layer
// (Dashboard.jsx) so the dialog survives regardless of which page or modal
// triggered a (non-auto) request.
//
// Each queued request is:
//   {
//     previewRequest: { url, body },
//     buildSendRequests: (selectedEmails) => [{ url, body }, ...],
//     buildVendorContactRequest: (name, email) => ({ url, body }),  // optional
//     buildBuyerContactRequest: (name, email) => ({ url, body }),   // optional
//     auto: true,                                                  // optional - skips the confirm dialog, see _startHead below
//   }
// `previewRequest` is POSTed once to resolve who the email would go to (and,
// when present, `vendor`/`buyer` - the PO's vendor and buyer orgs, from the
// same response); `buildSendRequests` is called with the confirmed (checked
// + any ad-hoc added) email list to build the actual send call(s) - a
// plural array so one combined dialog can cover a whole batch (e.g. bulk-
// Accept on several SKUs at once) with a single confirmation.
// `buildVendorContactRequest`/`buildBuyerContactRequest`, when the trigger
// provides them, build the calls `addVendorContact`/`addBuyerContact` below
// fire to persist a new contact - omitted entirely for triggers that don't
// have a PO/vendor/buyer context (none do today, but keeps this generic).
export const useSendMailStore = create((set, get) => ({
  queue: [],
  loading: false,
  recipients: null,   // [{ email, name }] once resolved, null while loading/idle
  vendor: null,        // { organizationId, name } | null, from the same preview response
  buyer: null,          // { organizationId, name } | null, from the same preview response
  sending: false,
  error: null,
  // A code describing why nothing can be sent (see SKIP_MESSAGES in
  // SendRecipientsModal.jsx for the human-readable text) - null once
  // recipients resolve normally. Distinct from `error` (a genuine failure
  // to even reach the preview endpoint) - this is "the request succeeded
  // but there's truly nothing to send" (no recipients, or whatever the
  // preview was about no longer exists).
  skipped: null,

  requestSend: (request) => {
    const { queue } = get()
    set({ queue: [...queue, request] })
    if (queue.length === 0) get()._startHead()
  },

  _startHead: async () => {
    const head = get().queue[0]
    if (!head) return
    set({ loading: true, recipients: null, vendor: null, buyer: null, error: null, skipped: null })
    try {
      const res = await fetch(head.previewRequest.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(head.previewRequest.body),
      })
      const data = await res.json().catch(() => ({}))
      if (data?.skipped || !res.ok) {
        // auto (InspectionScheduleForm.jsx's own notify) has no dialog to
        // show this in - silently move on, same "must never block the
        // scheduling action" rule already applied to its catch block below.
        // Every other (manual) trigger keeps this queue entry in place
        // instead of clearing it immediately, so SendRecipientsModal.jsx
        // actually gets a render with something to show - previously this
        // called _advance() straight away, which cleared the queue (and so
        // the dialog's own `open` check) before the user ever saw why
        // nothing happened.
        if (head.auto) { get()._advance(); return }
        set({ loading: false, skipped: data?.skipped || `http_${res.status}` })
        return
      }
      const recipients = data.recipients || []
      set({ loading: false, recipients, vendor: data.vendor || null, buyer: data.buyer || null })
      // auto: true (InspectionScheduleForm.jsx's own notify only) skips the
      // confirmation dialog entirely (see SendRecipientsModal.jsx's own
      // `open` check) and sends straight to every resolved recipient - the
      // same fully-checked default the dialog would've shown a human to
      // review. Every other trigger (the manual Send Mail button) omits
      // this flag and keeps requiring a real confirm() click.
      if (head.auto) await get().confirm(recipients.map(r => r.email))
    } catch (err) {
      if (head.auto) {
        // No dialog exists for this head to show/dismiss the error in - log
        // it and move on rather than leaving the queue stuck, same "a flaky
        // network call must never block the scheduling action" rule this
        // call site was already built around.
        console.error('[sendMailStore] auto-send preview failed:', err.message)
        get()._advance()
        return
      }
      set({ loading: false, error: err.message || 'Failed to resolve recipients' })
    }
  },

  // Persists a new vendor contact (see vendor_contacts table) so it shows up
  // pre-checked on every future PO tied to the same vendor. Returns the
  // saved { id, name, email } on success, throws on failure - the modal
  // handles both.
  addVendorContact: async (name, email) => {
    const head = get().queue[0]
    if (!head?.buildVendorContactRequest) throw new Error('No vendor context for this send')
    const { url, body } = head.buildVendorContactRequest(name, email)
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data?.skipped || !data?.contact) throw new Error(data?.error || 'Failed to save vendor contact')
    return data.contact
  },

  // Buyer-side counterpart to addVendorContact above (see buyer_contacts
  // table) - persists a contact for the PO's buyer instead of its vendor.
  addBuyerContact: async (name, email) => {
    const head = get().queue[0]
    if (!head?.buildBuyerContactRequest) throw new Error('No buyer context for this send')
    const { url, body } = head.buildBuyerContactRequest(name, email)
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data?.skipped || !data?.contact) throw new Error(data?.error || 'Failed to save contact')
    return data.contact
  },

  // "Other" contact saved for this PO's Customer + Vendor pair (see
  // buyer_supplier_link_contacts). Only available when the trigger supplies
  // buildLinkContactRequest; the modal falls back to a one-off add otherwise.
  addLinkContact: async (name, email) => {
    const head = get().queue[0]
    if (!head?.buildLinkContactRequest) throw new Error('No customer/vendor context for this send')
    const { url, body } = head.buildLinkContactRequest(name, email)
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data?.skipped || !data?.contact) throw new Error(data?.error || 'Failed to save contact')
    return data.contact
  },

  confirm: async (selectedEmails) => {
    const head = get().queue[0]
    if (!head) return
    set({ sending: true })
    const requests = head.buildSendRequests(selectedEmails)
    await Promise.all(requests.map(({ url, body }) =>
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).catch(() => {})
    ))
    set({ sending: false })
    get()._advance()
  },

  cancel: () => get()._advance(),

  _advance: () => {
    const [, ...rest] = get().queue
    set({ queue: rest, loading: false, recipients: null, vendor: null, buyer: null, sending: false, error: null, skipped: null })
    if (rest.length) get()._startHead()
  },
}))
