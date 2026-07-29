import { useState } from 'react'
import { useAdminCheck } from '../../hooks/useAdminCheck'
import { useApprovals } from '../../hooks/useApprovals'
import { useAuth } from '../../hooks/useAuth'
import { AdminShell } from '../../components/admin/AdminShell'
import {
  PageHeader, Badge, EmptyState, TableSkeleton,
  ApproveButton, RejectButton, RejectModal
} from '../../components/admin/AdminUi'
import { NdaPreviewModal } from '../../components/admin/NdaPreviewModal'
import { NdaSignModal } from '../../components/admin/NdaSignModal'
import { Spinner } from '../../components/ui/Spinner'

// ─── Tab button ───────────────────────────────────────────────
function Tab({ active, onClick, children, count }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors
        ${active ? 'bg-stone-900 text-white' : 'text-stone-500 hover:text-stone-800 hover:bg-stone-100'}`}
    >
      {children}
      {count > 0 && (
        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium
          ${active ? 'bg-white/20 text-white' : 'bg-stone-200 text-stone-600'}`}>
          {count}
        </span>
      )}
    </button>
  )
}

// ─── Request row ──────────────────────────────────────────────
function RequestRow({ req, onApprove, onReject, acting }) {
  const isApproving = acting?.id === req.id && acting?.action === 'approve'
  const isRejecting = acting?.id === req.id && acting?.action === 'reject'
  const isBusy = isApproving || isRejecting
  return (
    <tr className="border-b border-stone-100 hover:bg-stone-50 transition-colors">
      <td className="py-3 px-4">
        <div className="text-sm font-medium text-stone-900">{req.full_name}</div>
        <div className="text-xs text-stone-400 mt-0.5">{req.email}</div>
      </td>
      <td className="py-3 px-4">
        <div className="text-sm text-stone-700">{req.organizations?.display_name || req.organizations?.name}</div>
        <div className="text-xs text-stone-400 mt-0.5">{req.organizations?.country}</div>
      </td>
      <td className="py-3 px-4">
        <Badge label={req.organizations?.type} />
      </td>
      <td className="py-3 px-4">
        <Badge label={req.type === 'claim' ? 'claim' : 'member'} />
      </td>
      <td className="py-3 px-4 text-xs text-stone-400">
        {new Date(req.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
      </td>
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          <ApproveButton onClick={() => onApprove(req.id)} loading={isApproving} disabled={isBusy} />
          <RejectButton onClick={() => onReject(req)} loading={isRejecting} disabled={isBusy} />
        </div>
      </td>
    </tr>
  )
}

// ─── Verify / Sign / Approve step button ───────────────────────
function StepButton({ label, doneLabel, done, disabled, loading, onClick }) {
  if (done) {
    return (
      <span className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg">
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="m2 6 2.5 2.5 5.5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        {doneLabel}
      </span>
    )
  }
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-stone-600 bg-stone-100 border border-stone-200 rounded-lg hover:bg-stone-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-stone-100"
    >
      {loading && <Spinner size="w-3 h-3" light={false} />}
      {label}
    </button>
  )
}

// ─── Pending org row ──────────────────────────────────────────
function OrgRow({ org, onApprove, onReject, onOpenPreview, onOpenSign, acting }) {
  const [expanded, setExpanded] = useState(false)
  const owner = org.organization_members?.find(m => m.role === 'owner')
  const supplier = Array.isArray(org.supplier_details) ? org.supplier_details[0] : org.supplier_details
  const isApproving = acting?.id === org.id && acting?.action === 'approve'
  const isRejecting = acting?.id === org.id && acting?.action === 'reject'
  const isVerifying = acting?.id === org.id && acting?.action === 'verify'
  const isBusy = isApproving || isRejecting
  const isSupplier = org.type === 'supplier'
  const isVerified = !!org.nda_verified_at
  const isSigned = !!org.jng_signed_at

  return (
    <>
      <tr className="border-b border-stone-100 hover:bg-stone-50 transition-colors">
        <td className="py-3 px-4">
          <div className="flex items-center gap-2">
            {isSupplier && (
              <button
                type="button"
                onClick={() => setExpanded(e => !e)}
                className="text-stone-400 hover:text-stone-700 transition-colors"
                aria-label="Toggle details"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
                  style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 150ms' }}>
                  <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
            <div>
              <div className="text-sm font-medium text-stone-900">{org.display_name || org.name}</div>
              <div className="text-xs text-stone-400 mt-0.5">{org.domain || '—'}</div>
            </div>
          </div>
        </td>
        <td className="py-3 px-4">
          {owner ? (
            <>
              <div className="text-sm text-stone-700">{owner.full_name}</div>
              <div className="text-xs text-stone-400 mt-0.5">{owner.email}</div>
            </>
          ) : <span className="text-xs text-stone-400">—</span>}
        </td>
        <td className="py-3 px-4"><Badge label={org.type} /></td>
        <td className="py-3 px-4 text-sm text-stone-600">{org.country || '—'}</td>
        <td className="py-3 px-4 text-xs text-stone-400">
          {new Date(org.created_on).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
        </td>
        <td className="py-3 px-4">
          {isSupplier ? (
            <div className="flex items-center gap-1.5 flex-wrap">
              <StepButton
                label="Verify" doneLabel="Verified" done={isVerified}
                loading={isVerifying} disabled={isBusy}
                onClick={() => onOpenPreview(org)}
              />
              <StepButton
                label="Sign" doneLabel="Signed" done={isSigned}
                disabled={isBusy || !isVerified}
                onClick={() => onOpenSign(org)}
              />
              <ApproveButton onClick={() => onApprove(org.id)} loading={isApproving} disabled={isBusy || !isSigned} />
              <RejectButton onClick={() => onReject(org)} loading={isRejecting} disabled={isBusy} />
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <ApproveButton onClick={() => onApprove(org.id)} loading={isApproving} disabled={isBusy} />
              <RejectButton onClick={() => onReject(org)} loading={isRejecting} disabled={isBusy} />
            </div>
          )}
        </td>
      </tr>
      {isSupplier && expanded && (
        <tr className="border-b border-stone-100 bg-stone-50">
          <td colSpan={6} className="py-4 px-4">
            <div className="grid grid-cols-3 gap-x-6 gap-y-3 text-xs">
              <DetailField label="GST No." value={supplier?.gst_number} />
              <DetailField label="CIN No." value={supplier?.cin_no} />
              <DetailField label="Udyam No." value={supplier?.udyam_no} />
              <DetailField label="MSME No." value={supplier?.msme_no} />
              <DetailField label="ISI code" value={supplier?.isi_code} />
              <DetailField label="Business type" value={supplier?.supplier_type} />
              <DetailField label="Bank account number" value={supplier?.bank_account_number} />
              <DetailField label="IFSC code" value={supplier?.bank_ifsc_code} />
              <DetailField label="Address" value={org.address} />
              <DetailField label="Owner / Director name" value={org.owner_name} />
              <DetailField label="Owner / Director email" value={org.owner_email} />
              <DetailField label="Owner / Director phone" value={org.owner_phone} />
              <DetailField label="Reason for contact" value={org.reason_for_contact} />
              <DetailField label="Vendor logo" value={org.logo_url} isLink />
              <div>
                <div className="text-stone-400 uppercase tracking-wider mb-0.5">NDA</div>
                {org.nda_accepted ? (
                  <>
                    <Badge label="signed" />
                    <div className="text-stone-500 mt-1">
                      {(org.nda_signature_type === 'drawn' || org.nda_signature_type === 'uploaded') && org.nda_signature_image ? (
                        <img src={org.nda_signature_image} alt="Vendor signature" className="h-8 mt-1 border border-stone-200 rounded bg-white px-1" />
                      ) : (
                        org.nda_signature_name
                      )}
                      {org.nda_accepted_at && ` · ${new Date(org.nda_accepted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                    </div>
                  </>
                ) : (
                  <Badge label="not signed" />
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function DetailField({ label, value, isLink }) {
  return (
    <div>
      <div className="text-stone-400 uppercase tracking-wider mb-0.5">{label}</div>
      {value ? (
        isLink ? (
          <a href={value} target="_blank" rel="noreferrer" className="text-stone-700 underline break-all">{value}</a>
        ) : (
          <div className="text-stone-700 break-words">{value}</div>
        )
      ) : (
        <div className="text-stone-300">—</div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────
export default function ApprovalsPage() {
  const { checking } = useAdminCheck()
  const { session } = useAuth()
  const {
    requests, pendingOrgs, loading, error, acting,
    approveRequest, rejectRequest, approveOrg, rejectOrg,
    previewOrgPdf, verifyOrg, signOrg,
  } = useApprovals()

  const [tab, setTab] = useState('requests') // 'requests' | 'orgs'
  const [rejectTarget, setRejectTarget] = useState(null) // { id, type: 'request'|'org', name }
  const [previewTarget, setPreviewTarget] = useState(null) // { id, name }
  const [signTarget, setSignTarget] = useState(null) // { id, name }
  const [signError, setSignError] = useState('')
  const [actionError, setActionError] = useState('')

  if (checking) return null

  const memberRequests = requests.filter(r => r.type === 'member')
  const claimRequests = requests.filter(r => r.type === 'claim')

  async function handleApproveRequest(id) {
    setActionError('')
    const result = await approveRequest(id)
    if (!result.success) setActionError(result.error)
  }

  async function handleApproveOrg(id) {
    setActionError('')
    const result = await approveOrg(id)
    if (!result.success) setActionError(result.error)
  }

  async function handleRejectConfirm(reason) {
    setActionError('')
    const { id, type } = rejectTarget
    const result = type === 'org'
      ? await rejectOrg(id, reason)
      : await rejectRequest(id, reason)
    if (!result.success) setActionError(result.error)
    else setRejectTarget(null)
  }

  async function handleConfirmVerify() {
    setActionError('')
    const result = await verifyOrg(previewTarget.id)
    if (!result.success) setActionError(result.error)
    setPreviewTarget(null)
  }

  async function handleSubmitSign(payload) {
    setSignError('')
    const result = await signOrg(signTarget.id, payload)
    if (!result.success) setSignError(result.error)
    else setSignTarget(null)
  }

  return (
    <AdminShell>
      <div className="px-8 py-8 max-w-6xl">
        <PageHeader
          title="Approvals"
          subtitle="Review and action pending requests."
        />

        {/* Tabs */}
        <div className="flex items-center gap-1 mb-6">
          <Tab active={tab === 'requests'} onClick={() => setTab('requests')}
            count={requests.length}>
            Join &amp; Claim requests
          </Tab>
          <Tab active={tab === 'orgs'} onClick={() => setTab('orgs')}
            count={pendingOrgs.length}>
            New organisations
          </Tab>
        </div>

        {actionError && (
          <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            {actionError}
          </div>
        )}

        {loading ? (
          <TableSkeleton rows={6} />
        ) : error ? (
          <div className="text-sm text-red-600">{error}</div>
        ) : tab === 'requests' ? (
          requests.length === 0 ? (
            <EmptyState
              icon={<svg width="20" height="20" viewBox="0 0 16 16" fill="none"><path d="m5.75 8 2 2 4.5-5.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" /></svg>}
              title="No pending requests"
              subtitle="All join and claim requests have been actioned."
            />
          ) : (
            <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
              {/* Section: claims first (higher priority) */}
              {claimRequests.length > 0 && (
                <>
                  <div className="px-4 py-2.5 bg-violet-50 border-b border-violet-100">
                    <span className="text-xs font-semibold text-violet-700 uppercase tracking-widest">
                      Ownership claims — requires your approval
                    </span>
                  </div>
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-stone-100">
                        {['Claimant', 'Organisation', 'Type', 'Request', 'Submitted', 'Actions'].map(h => (
                          <th key={h} className="py-2.5 px-4 text-left text-xs font-medium text-stone-400 uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {claimRequests.map(req => (
                        <RequestRow key={req.id} req={req} acting={acting}
                          onApprove={handleApproveRequest}
                          onReject={r => setRejectTarget({ id: r.id, type: 'request', name: r.organizations?.display_name || r.organizations?.name })}
                        />
                      ))}
                    </tbody>
                  </table>
                </>
              )}

              {/* Section: member join requests */}
              {memberRequests.length > 0 && (
                <>
                  <div className="px-4 py-2.5 bg-sky-50 border-b border-sky-100">
                    <span className="text-xs font-semibold text-sky-700 uppercase tracking-widest">
                      Member join requests — approved by org admins, visible here for oversight
                    </span>
                  </div>
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-stone-100">
                        {['Requestor', 'Organisation', 'Type', 'Request', 'Submitted', 'Actions'].map(h => (
                          <th key={h} className="py-2.5 px-4 text-left text-xs font-medium text-stone-400 uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {memberRequests.map(req => (
                        <RequestRow key={req.id} req={req} acting={acting}
                          onApprove={handleApproveRequest}
                          onReject={r => setRejectTarget({ id: r.id, type: 'request', name: r.organizations?.display_name || r.organizations?.name })}
                        />
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          )
        ) : (
          // Pending orgs tab
          pendingOrgs.length === 0 ? (
            <EmptyState
              icon={<svg width="20" height="20" viewBox="0 0 16 16" fill="none"><path d="M2.75 13.25V5.75a2 2 0 0 1 2-2h6.5a2 2 0 0 1 2 2v7.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" /></svg>}
              title="No pending organisations"
              subtitle="All new organisation applications have been actioned."
            />
          ) : (
            <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-stone-100">
                    {['Organisation', 'Owner', 'Type', 'Country', 'Submitted', 'Actions'].map(h => (
                      <th key={h} className="py-2.5 px-4 text-left text-xs font-medium text-stone-400 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pendingOrgs.map(org => (
                    <OrgRow key={org.id} org={org} acting={acting}
                      onApprove={handleApproveOrg}
                      onReject={o => setRejectTarget({ id: o.id, type: 'org', name: o.display_name || o.name })}
                      onOpenPreview={o => setPreviewTarget({ id: o.id, name: o.display_name || o.name })}
                      onOpenSign={o => { setSignError(''); setSignTarget({ id: o.id, name: o.display_name || o.name }) }}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      {/* Reject modal */}
      {rejectTarget && (
        <RejectModal
          title={`Reject ${rejectTarget.type === 'org' ? 'organisation' : 'request'} — ${rejectTarget.name}`}
          onConfirm={handleRejectConfirm}
          onCancel={() => setRejectTarget(null)}
          loading={acting?.id === rejectTarget.id && acting?.action === 'reject'}
        />
      )}

      {/* Step 1: Verify — review the exact PDF before it can be signed */}
      {previewTarget && (
        <NdaPreviewModal
          orgName={previewTarget.name}
          fetchPreview={() => previewOrgPdf(previewTarget.id)}
          onConfirm={handleConfirmVerify}
          onCancel={() => setPreviewTarget(null)}
          confirming={acting?.id === previewTarget.id && acting?.action === 'verify'}
        />
      )}

      {/* Step 2: Sign — countersignature captured fresh for this approval */}
      {signTarget && (
        <NdaSignModal
          orgName={signTarget.name}
          session={session}
          onSubmit={handleSubmitSign}
          onCancel={() => setSignTarget(null)}
          submitting={acting?.id === signTarget.id && acting?.action === 'sign'}
          error={signError}
        />
      )}
    </AdminShell>
  )
}