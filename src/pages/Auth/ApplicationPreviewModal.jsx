import { useEffect } from 'react'
import { Button, Alert } from '../../components/ui'
import NdaAgreementText from '../../components/shared/NdaAgreementText'
import { buildApplicationSections, downloadApplicationPdf } from '../../utils/applicationPdf'

/**
 * Confirm-before-send preview of the vendor application.
 * `data` = { form, categoryNames, isVendorEntrance, email, role }.
 */
export default function ApplicationPreviewModal({ open, data, submitting, error, onClose, onConfirm }) {
  useEffect(() => {
    if (!open) return
    function onKey(e) { if (e.key === 'Escape' && !submitting) onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, submitting, onClose])

  if (!open) return null

  const sections = buildApplicationSections(data)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-4"
      onMouseDown={e => { if (e.target === e.currentTarget && !submitting) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="px-6 pt-5 pb-3 border-b border-stone-100">
          <h2
            className="text-stone-900"
            style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 20, fontWeight: 400 }}
          >
            Review your application
          </h2>
          <p className="text-sm text-stone-500 mt-1">
            This is what will be sent to our team for review. You can download a copy or go back to edit.
          </p>
        </div>

        <div className="px-6 py-4 overflow-y-auto flex-1">
          {sections.map(section => (
            <div key={section.title} className="mb-5 last:mb-0">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500 mb-2">
                {section.title}
              </h3>
              <dl className="divide-y divide-stone-100 border border-stone-200 rounded-xl overflow-hidden">
                {section.rows.map(([label, value]) => (
                  <div key={label} className="flex gap-3 px-3.5 py-2 text-sm">
                    <dt className="w-40 shrink-0 text-stone-500">{label}</dt>
                    <dd className="text-stone-900 break-words min-w-0">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}

          {data.form.ndaSignatureImage &&
            (data.form.signatureMode === 'draw' || data.form.signatureMode === 'upload') && (
            <div className="mb-5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500 mb-2">
                Signature
              </h3>
              <img
                src={data.form.ndaSignatureImage}
                alt="Signature"
                className="h-20 border border-stone-200 rounded-xl bg-white p-2 object-contain"
              />
            </div>
          )}

          {data.role === 'supplier' && (
            <div className="mb-1">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500 mb-2">
                Full agreement
              </h3>
              <NdaAgreementText
                businessName={data.form.businessName}
                address={data.form.address}
                className="max-h-[50vh] overflow-y-auto text-xs text-stone-600 leading-relaxed border border-stone-200 rounded-xl p-4 bg-white"
              />
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-stone-100">
          {error && <Alert type="error">{error}</Alert>}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              className="py-2.5 px-4 shrink-0 whitespace-nowrap"
              disabled={submitting}
              onClick={onClose}
            >
              Back to edit
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="py-2.5 px-4 shrink-0 whitespace-nowrap"
              disabled={submitting}
              onClick={() => downloadApplicationPdf(data)}
            >
              Download PDF
            </Button>
            <Button
              type="button"
              variant="primary"
              className="py-2.5 flex-1 whitespace-nowrap"
              loading={submitting}
              onClick={onConfirm}
            >
              Confirm &amp; submit
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
