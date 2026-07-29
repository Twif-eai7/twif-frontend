const STEPS = [
  {
    title: 'Upload Purchase Order (PO)',
    body: 'Start by uploading your Purchase Order document received from your buyer.',
    bullets: [
      'Click the "Upload PO" button in the header',
      'Fill in the buyer, supplier, date, quantity, and amount',
      'Attach the PO document (PDF, DOC, XLS, or image)',
      'Submit the form',
    ],
    tip: { type: 'info', text: 'Make sure all fields match your buyer\'s PO exactly to avoid duplicates.' },
  },
  {
    title: 'View & Manage POs in the Table',
    body: 'After uploading, your PO appears in the table. Click any row to open the detail drawer.',
    bullets: [
      'Click a row to see documents (PO, PI) and dates',
      'Use the ⋮ menu to manage the PO — Upload PI, Edit, Explain PI Delay, Revise, or Delete',
      'Status shows Pending PI until the PI is uploaded',
    ],
  },
  {
    title: 'Upload Proforma Invoice (PI)',
    body: 'Once you receive the PI from your supplier, upload it to the corresponding PO.',
    bullets: [
      'Find the PO row in the table',
      'Click ⋮ → Upload PI',
      'Enter PI date, ex-factory date, and attach the PI document',
      'Submit — status changes to PI Confirmed',
    ],
    tip: { type: 'success', text: 'Once uploaded, the PI status turns green and the PO is locked for revision only.' },
  },
  {
    title: 'Explain a PI Delay',
    body: 'If you cannot confirm the PI on time, log a reason directly from the ⋮ menu.',
    bullets: [
      'Find the pending PO row',
      'Click ⋮ → Explain PI Delay',
      'Enter your reason and submit',
    ],
    tip: { type: 'info', text: 'This keeps a full history of delay reasons visible to the admin team.' },
  },
  {
    title: 'Revise a Confirmed PO',
    body: 'After PI is confirmed, you can revise PO details if anything changes.',
    bullets: [
      'Find the PI Confirmed PO',
      'Click ⋮ → Revise PO',
      'Update fields — quantity, amount, dates, or files — and submit',
    ],
    tip: { type: 'info', text: 'Revise PO only appears for confirmed orders. Use Update PO for unconfirmed ones.' },
  },
  {
    title: 'Report an OTIF Exception',
    body: 'If a confirmed PO cannot be delivered on time, raise an OTIF exception to propose a new ex-factory date.',
    bullets: [
      'Find the PI Confirmed PO',
      'Click ⋮ → Report OTIF Exception',
      'Select the reason, enter the proposed new ex-factory date, attach proof, and add a comment',
      'Submit — the request goes to a senior for approval',
    ],
    tip: { type: 'warning', text: 'You can track the status of your exception under the OTIF Exception tab in the sidebar.' },
  },
]

const TIP_STYLES = {
  info:    { bg: 'bg-blue-50 border-blue-100 text-blue-700',    icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="flex-shrink-0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg> },
  success: { bg: 'bg-emerald-50 border-emerald-100 text-emerald-700', icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="flex-shrink-0"><polyline points="20 6 9 17 4 12"/></svg> },
  warning: { bg: 'bg-amber-50 border-amber-100 text-amber-700',  icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="flex-shrink-0"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> },
}

export default function PoInstructionsModal({ open, onClose }) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gray-900 flex items-center justify-center flex-shrink-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
              </svg>
            </div>
            <div>
              <div className="text-sm font-bold text-gray-900">How to use the PO Dashboard</div>
              <div className="text-xs text-gray-500">Step-by-step guide</div>
            </div>
          </div>
          <button type="button" onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors cursor-pointer">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-5 py-4 flex flex-col gap-3">
          {STEPS.map((step, i) => (
            <div key={i}>
              {/* Step card */}
              <div className="flex gap-3">
                {/* Number + connector */}
                <div className="flex flex-col items-center flex-shrink-0">
                  <div className="w-7 h-7 rounded-full bg-gray-900 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                    {i + 1}
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className="w-px flex-1 bg-gray-200 mt-1.5 mb-0" style={{ minHeight: 16 }} />
                  )}
                </div>

                {/* Content */}
                <div className="flex flex-col gap-1.5 pb-3 flex-1 min-w-0">
                  <div className="text-xs font-bold text-gray-900">{step.title}</div>
                  <p className="text-xs text-gray-500 leading-relaxed">{step.body}</p>
                  <ul className="flex flex-col gap-1 mt-0.5">
                    {step.bullets.map((b, j) => (
                      <li key={j} className="flex items-start gap-1.5 text-xs text-gray-600">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2.5" className="flex-shrink-0 mt-0.5">
                          <polyline points="9 18 15 12 9 6"/>
                        </svg>
                        {b}
                      </li>
                    ))}
                  </ul>
                  {step.tip && (() => {
                    const s = TIP_STYLES[step.tip.type]
                    return (
                      <div className={`flex items-start gap-2 px-3 py-2 rounded-lg border text-xs mt-1 ${s.bg}`}>
                        {s.icon}
                        <span>{step.tip.text}</span>
                      </div>
                    )
                  })()}
                </div>
              </div>
            </div>
          ))}

          {/* Quick tips */}
          <div className="border-t border-gray-100 pt-3 mt-1">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Quick Tips</div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>, text: 'Accepted: PDF, DOC, DOCX, XLS, XLSX, JPG, PNG' },
                { icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>, text: 'Max file size: 10 MB per document' },
                { icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>, text: 'Click any row to open the detail drawer' },
                { icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>, text: 'Upload PI as soon as you receive it from your supplier' },
              ].map((t, i) => (
                <div key={i} className="flex items-start gap-2 px-3 py-2.5 bg-gray-50 border border-gray-100 rounded-lg">
                  <span className="text-gray-500 flex-shrink-0 mt-0.5">{t.icon}</span>
                  <span className="text-xs text-gray-600">{t.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-5 py-3 border-t border-gray-100 flex-shrink-0">
          <button type="button" onClick={onClose}
            className="px-5 py-1.5 rounded-lg bg-gray-900 text-xs font-semibold text-white hover:bg-gray-700 transition-colors cursor-pointer">
            Got it!
          </button>
        </div>

      </div>
    </div>
  )
}
