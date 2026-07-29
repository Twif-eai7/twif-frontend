import { useState, useEffect } from 'react'
import { usePlmStore } from '../../../stores/plmStore'
import { useMemberId } from '../../../stores/profileStore'
import { useBuyerOrgs, useSupplierOrgs } from '../../../stores/orgsStore'

// copyText requires document focus, which is lost after async awaits.
// Fallback: write to a temporary textarea and use execCommand.
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    const el = document.createElement('textarea')
    el.value = text
    el.style.cssText = 'position:fixed;opacity:0;pointer-events:none'
    document.body.appendChild(el)
    el.focus()
    el.select()
    document.execCommand('copy')
    document.body.removeChild(el)
  }
}

export default function BulkWorkspaceModal({ skus, onClose, onDone }) {
  const createWorkspacesBulk    = usePlmStore(s => s.createWorkspacesBulk)
  const addWorkspaceInvitesBulk = usePlmStore(s => s.addWorkspaceInvitesBulk)
  const getWorkspaceInviteToken = usePlmStore(s => s.getWorkspaceInviteToken)
  const fetchOrgMembers         = usePlmStore(s => s.fetchOrgMembers)
  const refreshCatalog          = usePlmStore(s => s.refreshCatalog)
  const toast      = usePlmStore(s => s.toast)
  const memberId   = useMemberId()
  const buyerOrgs  = useBuyerOrgs()
  const supplierOrgs = useSupplierOrgs()

  // Split: need new workspace vs already have one
  const skusNew      = skus.filter(s => !s.workspace_id)
  const skusExisting = skus.filter(s =>  s.workspace_id)
  // If every selected SKU already has a workspace, buyer is optional
  const buyerAlreadyActive = skusNew.length === 0 && skusExisting.length > 0

  const uniqueBuyerOrgIds    = [...new Set(skus.map(s => s.upload_buyer_org_id).filter(Boolean))]
  const uniqueSupplierOrgIds = [...new Set(skus.map(s => s.supplier_org_id).filter(Boolean))]
  // Only a true clash when buyer orgs differ — different vendor orgs just disables vendor invite
  const mixedOrgs       = uniqueBuyerOrgIds.length > 1
  const mixedVendorOrgs = uniqueSupplierOrgIds.length > 1

  const lockedBuyerOrgId    = uniqueBuyerOrgIds.length    === 1 ? uniqueBuyerOrgIds[0]    : null
  const lockedSupplierOrgId = uniqueSupplierOrgIds.length === 1 ? uniqueSupplierOrgIds[0] : null

  const buyerOrg       = buyerOrgs.find(o => o.id === lockedBuyerOrgId)
  const supplierOrg    = supplierOrgs.find(o => o.id === lockedSupplierOrgId)
  const buyerOrgName   = buyerOrg?.name   || skus[0]?.upload_buyer_org_name || null
  const supplierOrgName = supplierOrg?.name || skus[0]?.supplier || null

  // Pre-fill buyer from existing workspace if all share the same buyer email
  const uniqueExistingBuyerEmails = [...new Set(skusExisting.map(s => s.buyer_email).filter(Boolean))]
  const existingBuyerEmail = uniqueExistingBuyerEmails.length === 1 ? uniqueExistingBuyerEmails[0] : null

  const MAX_INVITES = 4

  // Members are fetched per org — invites can only be sent to people already
  // registered as a member of that buyer/vendor organization (no free-text email entry).
  const [buyerMembers,    setBuyerMembers]    = useState([])
  const [supplierMembers, setSupplierMembers] = useState([])
  const [loadingBuyers,   setLoadingBuyers]   = useState(false)
  const [loadingSuppliers, setLoadingSuppliers] = useState(false)

  useEffect(() => {
    if (!lockedBuyerOrgId) return
    setLoadingBuyers(true)
    fetchOrgMembers(lockedBuyerOrgId).then(setBuyerMembers).finally(() => setLoadingBuyers(false))
  }, [lockedBuyerOrgId, fetchOrgMembers])

  useEffect(() => {
    if (!lockedSupplierOrgId) return
    setLoadingSuppliers(true)
    fetchOrgMembers(lockedSupplierOrgId).then(setSupplierMembers).finally(() => setLoadingSuppliers(false))
  }, [lockedSupplierOrgId, fetchOrgMembers])

  const findMemberEmail = (members, email) =>
    members.find(m => (m.email || '').toLowerCase() === (email || '').toLowerCase())?.email || ''

  const [buyerSelected,    setBuyerSelectedState] = useState(() => [existingBuyerEmail || ''])
  const [buyerErrors,      setBuyerErrors]      = useState([false])
  const [addSupplier,      setAddSupplier]      = useState(buyerAlreadyActive)
  const [supplierSelected, setSupplierSelected] = useState([''])
  const [saving,         setSaving]         = useState(false)
  const [copyingLink,    setCopyingLink]    = useState(false)
  const [done,           setDone]           = useState(false)
  const [copiedLinks,    setCopiedLinks]    = useState(null) // { buyers: [{ email, url }], suppliers: [{ email, url }] }
  const [error,          setError]          = useState(null)

  // Resolve each stored selection to the exact registered casing so it always matches a real
  // <option> value, even before the members list finishes loading (falls back to raw value).
  const buyerSelectedResolved = buyerSelected.map(v => v ? (findMemberEmail(buyerMembers, v) || v) : '')

  const buyerFilled = buyerSelected[0].trim().length > 0
  const supplierFilledAny = supplierSelected.some(v => v.trim().length > 0)

  // ── buyer row helpers ──
  const setBuyerSelected = (idx, val) => {
    setBuyerSelectedState(prev => prev.map((v, i) => i === idx ? val : v))
    setBuyerErrors(prev => prev.map((v, i) => i === idx ? false : v))
  }
  const addBuyerRow    = () => { if (buyerSelected.length < MAX_INVITES) { setBuyerSelectedState(p => [...p, '']); setBuyerErrors(p => [...p, false]) } }
  const removeBuyerRow = (idx) => { setBuyerSelectedState(p => p.filter((_, i) => i !== idx)); setBuyerErrors(p => p.filter((_, i) => i !== idx)) }

  // ── supplier row helpers ──
  const setSupplierSelectedAt = (idx, val) => setSupplierSelected(prev => prev.map((v, i) => i === idx ? val : v))
  const addSupplierRow    = () => { if (supplierSelected.length < MAX_INVITES) setSupplierSelected(p => [...p, '']) }
  const removeSupplierRow = (idx) => setSupplierSelected(p => p.filter((_, i) => i !== idx))

  // ── Shared: validate inputs + run invite API calls ──
  // Returns { allWsIds, validBuyerEmails, validSupplierEmails } on success, null on validation failure.
  // skipEmail: true → create invite records but suppress the email notification (used by copy-link flow)
  const executeInvites = async ({ skipEmail = false } = {}) => {
    if (mixedOrgs) return null

    if (!buyerAlreadyActive && !buyerFilled) {
      setBuyerErrors(p => p.map((_, i) => i === 0 ? true : false))
      setError('Select a registered buyer')
      return null
    }
    if (buyerAlreadyActive && !buyerFilled && !(addSupplier && supplierFilledAny)) {
      setError('Select at least one person to invite')
      return null
    }

    setError(null)

    const validBuyerEmails    = buyerSelected.filter(Boolean)
    const validSupplierEmails = addSupplier ? supplierSelected.filter(Boolean) : []

    let newWorkspaceIds = []
    const existingWsIds = skusExisting.map(s => s.workspace_id)
    const mixedState = skusNew.length > 0 && existingWsIds.length > 0

    if (skusNew.length > 0) {
      const result = await createWorkspacesBulk(skusNew.map(s => s.id), memberId, {
        buyerEmail:    validBuyerEmails[0],
        buyerOrgId:    lockedBuyerOrgId || undefined,
        supplierEmail: (!mixedState && !skipEmail) ? (validSupplierEmails[0] || undefined) : undefined,
        supplierOrgId: (!mixedState && !skipEmail) && validSupplierEmails[0] && lockedSupplierOrgId ? lockedSupplierOrgId : undefined,
        skipInvites:   mixedState || skipEmail || undefined,
      })
      newWorkspaceIds = (result?.workspaces || []).map(w => w.id).filter(Boolean)
    }

    const allWsIds  = [...newWorkspaceIds, ...existingWsIds]
    const bulkInvites = []

    if (mixedState || skipEmail) {
      // Mixed state or copy-link: route ALL workspace invites through addWorkspaceInvitesBulk
      // so they share one token and (when skipEmail) no email is sent
      for (const email of validBuyerEmails)
        bulkInvites.push(addWorkspaceInvitesBulk(allWsIds, email, 'buyer', lockedBuyerOrgId || undefined, skipEmail || undefined))
      for (const email of validSupplierEmails)
        bulkInvites.push(addWorkspaceInvitesBulk(allWsIds, email, 'supplier', lockedSupplierOrgId || undefined, skipEmail || undefined))
    } else {
      for (const email of validBuyerEmails.slice(1))
        if (newWorkspaceIds.length)
          bulkInvites.push(addWorkspaceInvitesBulk(newWorkspaceIds, email, 'buyer', lockedBuyerOrgId || undefined))
      for (const email of validBuyerEmails)
        if (existingWsIds.length)
          bulkInvites.push(addWorkspaceInvitesBulk(existingWsIds, email, 'buyer', lockedBuyerOrgId || undefined))
      for (const email of validSupplierEmails.slice(1))
        if (newWorkspaceIds.length)
          bulkInvites.push(addWorkspaceInvitesBulk(newWorkspaceIds, email, 'supplier', lockedSupplierOrgId || undefined))
      for (const email of validSupplierEmails)
        if (existingWsIds.length)
          bulkInvites.push(addWorkspaceInvitesBulk(existingWsIds, email, 'supplier', lockedSupplierOrgId || undefined))
    }

    await Promise.all(bulkInvites)

    return { allWsIds, validBuyerEmails, validSupplierEmails }
  }

  // ── Send invites via email (existing flow) ──
  const handleSubmit = async () => {
    setSaving(true)
    try {
      const result = await executeInvites()
      if (!result) return
      setDone(true)
      const total = skusNew.length + skusExisting.length
      toast?.(`Invites sent for ${total} workspace${total === 1 ? '' : 's'}`)
      await refreshCatalog()
      setTimeout(onDone, 1500)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Copy invite link(s) to clipboard ──
  // Runs the same invite creation flow, then fetches tokens for ALL buyers/suppliers
  // and copies all accept URLs. Useful when email delivery is delayed or rate-limited.
  const handleCopyLink = async () => {
    setCopyingLink(true)
    try {
      const result = await executeInvites({ skipEmail: true })
      if (!result) return

      const { allWsIds, validBuyerEmails, validSupplierEmails } = result
      const origin = window.location.origin

      const buyerLinks = []
      for (const email of validBuyerEmails) {
        const token = await getWorkspaceInviteToken(allWsIds, email, 'buyer')
        if (token) buyerLinks.push({ email, url: `${origin}/plm/accept?token=${token}` })
      }

      const supplierLinks = []
      for (const email of validSupplierEmails) {
        const token = await getWorkspaceInviteToken(allWsIds, email, 'supplier')
        if (token) supplierLinks.push({ email, url: `${origin}/plm/accept?token=${token}` })
      }

      if (!buyerLinks.length && !supplierLinks.length) {
        setError('Could not retrieve invite link — try sending via email instead')
        return
      }

      const allUrls = [...buyerLinks, ...supplierLinks].map(l => l.url).join('\n')
      await copyText(allUrls)
      setCopiedLinks({ buyers: buyerLinks, suppliers: supplierLinks })
      toast?.('Invite link copied to clipboard!')
      await refreshCatalog()
    } catch (err) {
      setError(err.message)
    } finally {
      setCopyingLink(false)
    }
  }

  const memberLabel = (m) => m.full_name ? `${m.full_name} — ${m.email}` : m.email

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40">
      <div className="bg-white w-full max-w-md mx-4 flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-black/10">
          <div>
            <span className="text-[13px] font-bold uppercase tracking-[.06em]">
              {buyerAlreadyActive ? 'Add Invites' : 'Create Workspaces'}
            </span>
            <span className="ml-2 text-[10px] font-semibold text-black/40 uppercase tracking-[.05em]">
              {skus.length} SKU{skus.length === 1 ? '' : 's'}
            </span>
          </div>
          <button onClick={onClose} className="text-black/40 hover:text-black text-lg leading-none cursor-pointer border-none bg-none">×</button>
        </div>

        {/* SKU chips */}
        <div className="px-5 py-3 border-b border-black/[.07] flex gap-1.5 flex-wrap max-h-20 overflow-y-auto">
          {skus.map(s => (
            <span key={s.id} className="text-[9px] font-bold uppercase tracking-[.05em] bg-black/[.06] px-1.5 py-0.5">
              {s.auto_code}
            </span>
          ))}
        </div>

        {mixedOrgs ? (
          <div className="p-5">
            <div className="border-l-[3px] border-red-400 bg-red-50 px-4 py-3">
              <div className="text-[10px] font-extrabold uppercase tracking-[.08em] text-red-600 mb-1">Mixed buyer organisations</div>
              <div className="text-[12px] text-red-700 leading-relaxed">
                The selected SKUs belong to different buyer organisations. You can only invite one buyer at a time across the same buyer group.
              </div>
              <div className="text-[10px] text-red-500 mt-2 font-semibold">Deselect SKUs until all belong to one buyer organisation.</div>
            </div>
          </div>
        ) : (
          <div className="p-5 flex flex-col gap-4">

            {/* Mixed note — some have workspaces, some don't */}
            {!buyerAlreadyActive && skusExisting.length > 0 && (
              <div className="text-[10px] text-black/40 bg-black/[.03] px-3 py-2 border-l-2 border-black/15">
                {skusExisting.length} SKU{skusExisting.length === 1 ? '' : 's'} already have a workspace — they'll receive the same invite without creating a new one.
              </div>
            )}

            {/* ── Buyer picker ── */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className={`text-[11px] font-bold uppercase tracking-[.06em] ${buyerErrors[0] ? 'text-red-500' : 'text-black/80'}`}>
                  Buyer{!buyerAlreadyActive && ' *'}
                </span>
                <div className="flex items-center gap-2">
                  {buyerOrgName && (
                    <span className="text-[10px] font-semibold text-black/40 uppercase tracking-[.04em]">{buyerOrgName}</span>
                  )}
                  {buyerSelected.length < MAX_INVITES && buyerMembers.length > 0 && (
                    <button
                      type="button"
                      onClick={addBuyerRow}
                      title="Add another buyer"
                      className="text-[10px] font-bold text-black/40 hover:text-black/70 cursor-pointer border-none bg-none leading-none"
                    >+ Add</button>
                  )}
                </div>
              </div>
              {buyerAlreadyActive && (
                <span className="text-[10px] text-black/35 -mt-0.5">
                  Active buyer already in workspace — leave blank to skip, or add another
                </span>
              )}
              {!lockedBuyerOrgId ? (
                <span className="text-[10px] text-black/40 bg-black/[.03] px-3 py-2 border-l-2 border-black/15">
                  No buyer organisation resolved for these SKUs.
                </span>
              ) : loadingBuyers ? (
                <span className="text-[10px] text-black/40">Loading registered buyers…</span>
              ) : buyerMembers.length === 0 ? (
                <span className="text-[10px] text-red-500 bg-red-50 px-3 py-2 border-l-2 border-red-300">
                  No registered members found for {buyerOrgName || 'this organisation'}. They must join the portal before you can invite them here.
                </span>
              ) : (
                <div className="flex flex-col gap-1">
                  {buyerSelectedResolved.map((val, idx) => (
                    <div key={idx} className={`flex items-center gap-1 border-b bg-[#e9e9e93d] ${buyerErrors[idx] ? 'border-red-400 bg-red-50' : 'border-black/20'}`}>
                      <select
                        className={`px-2 py-1.5 text-[12px] bg-transparent outline-none flex-1 ${buyerErrors[idx] ? 'text-red-600' : ''}`}
                        value={val}
                        onChange={e => setBuyerSelected(idx, e.target.value)}
                      >
                        <option value="">Select buyer…</option>
                        {buyerMembers
                          .filter(m => m.email === val || !buyerSelectedResolved.includes(m.email))
                          .map(m => (
                            <option key={m.id} value={m.email}>{memberLabel(m)}</option>
                          ))}
                      </select>
                      {buyerSelected.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeBuyerRow(idx)}
                          className="px-2 text-black/30 hover:text-black/60 cursor-pointer border-none bg-none text-[14px] leading-none"
                        >×</button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {buyerErrors[0] && (
                <span className="text-[9px] font-semibold text-red-500 uppercase tracking-[.04em]">Select a registered buyer</span>
              )}
            </div>

            {/* ── Vendor picker ── */}
            <div className="flex flex-col gap-2">
              {mixedVendorOrgs ? (
                <div className="text-[10px] text-black/40 bg-black/[.03] px-3 py-2 border-l-2 border-black/15">
                  SKUs belong to different vendor organisations — vendor invite not available for mixed vendor selection.
                </div>
              ) : (
                <>
                  {buyerAlreadyActive ? (
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-[.06em] text-black/80">Vendor</span>
                      {supplierSelected.length < MAX_INVITES && supplierMembers.length > 0 && (
                        <button
                          type="button"
                          onClick={addSupplierRow}
                          title="Add another vendor"
                          className="text-[10px] font-bold text-black/40 hover:text-black/70 cursor-pointer border-none bg-none"
                        >+ Add</button>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => setAddSupplier(v => !v)}
                        className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.06em] text-black/40 hover:text-black/70 transition-colors cursor-pointer border-none bg-none w-fit"
                      >
                        <span className={`w-3.5 h-3.5 border flex items-center justify-center flex-shrink-0 ${addSupplier ? 'bg-[#1A1A18] border-transparent' : 'border-black/30'}`}>
                          {addSupplier && (
                            <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                              <polyline points="1.5 5 4 7.5 8.5 2.5" stroke="#F5F3EF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </span>
                        Also invite vendor
                      </button>
                      {addSupplier && supplierSelected.length < MAX_INVITES && supplierMembers.length > 0 && (
                        <button
                          type="button"
                          onClick={addSupplierRow}
                          className="text-[10px] font-bold text-black/40 hover:text-black/70 cursor-pointer border-none bg-none"
                        >+ Add</button>
                      )}
                    </div>
                  )}

                  {(addSupplier || buyerAlreadyActive) && (
                    <div className={`flex flex-col gap-1 ${!buyerAlreadyActive ? 'pl-5' : ''}`}>
                      {supplierOrgName && (
                        <span className="text-[10px] font-semibold text-black/40 uppercase tracking-[.04em]">{supplierOrgName}</span>
                      )}
                      {!lockedSupplierOrgId ? (
                        <span className="text-[10px] text-black/40 bg-black/[.03] px-3 py-2 border-l-2 border-black/15">
                          No vendor organisation resolved for these SKUs.
                        </span>
                      ) : loadingSuppliers ? (
                        <span className="text-[10px] text-black/40">Loading registered vendors…</span>
                      ) : supplierMembers.length === 0 ? (
                        <span className="text-[10px] text-red-500 bg-red-50 px-3 py-2 border-l-2 border-red-300">
                          No registered members found for {supplierOrgName || 'this organisation'}. They must join the portal before you can invite them here.
                        </span>
                      ) : (
                        supplierSelected.map((val, idx) => (
                          <div key={idx} className="flex items-center gap-1 border-b border-black/20 bg-[#e9e9e93d]">
                            <select
                              className="px-2 py-1.5 text-[12px] bg-transparent outline-none flex-1"
                              value={val}
                              onChange={e => { setSupplierSelectedAt(idx, e.target.value); setError(null) }}
                            >
                              <option value="">Select vendor…</option>
                              {supplierMembers
                                .filter(m => m.email === val || !supplierSelected.includes(m.email))
                                .map(m => (
                                  <option key={m.id} value={m.email}>{memberLabel(m)}</option>
                                ))}
                            </select>
                            {supplierSelected.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeSupplierRow(idx)}
                                className="px-2 text-black/30 hover:text-black/60 cursor-pointer border-none bg-none text-[14px] leading-none"
                              >×</button>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

          </div>
        )}

        {/* Footer */}
        <div className="flex flex-col gap-2 px-5 py-3 border-t border-black/10">
          {/* Copied links display */}
          {copiedLinks && (
            <div className="flex flex-col gap-1.5 mb-1">
              <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-[.06em]">✓ Copied to clipboard</div>
              {copiedLinks.buyers.map(({ email, url }) => (
                <div key={email} className="flex flex-col gap-0.5">
                  <span className="text-[9px] font-bold uppercase tracking-[.04em] text-black/40">Buyer — {email}</span>
                  <div
                    className="text-[9px] text-black/50 font-mono bg-black/[.04] px-2 py-1 rounded break-all cursor-pointer hover:bg-black/[.07] transition-colors"
                    onClick={() => copyText(url)}
                    title="Click to copy"
                  >
                    {url}
                  </div>
                </div>
              ))}
              {copiedLinks.suppliers.map(({ email, url }) => (
                <div key={email} className="flex flex-col gap-0.5">
                  <span className="text-[9px] font-bold uppercase tracking-[.04em] text-black/40">Vendor — {email}</span>
                  <div
                    className="text-[9px] text-black/50 font-mono bg-black/[.04] px-2 py-1 rounded break-all cursor-pointer hover:bg-black/[.07] transition-colors"
                    onClick={() => copyText(url)}
                    title="Click to copy"
                  >
                    {url}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-end gap-2">
            {error && (
              <span className="text-[10px] font-semibold text-red-500 uppercase tracking-[.04em] mr-auto">{error}</span>
            )}
            {copiedLinks ? (
              <button
                onClick={onDone}
                className="px-4 py-2 text-[11px] font-bold uppercase tracking-[.06em] bg-[#1A1A18] text-[#F5F3EF] cursor-pointer hover:opacity-80"
              >
                Done
              </button>
            ) : done ? (
              <span className="text-[11px] font-bold uppercase tracking-[.06em] text-emerald-600">
                ✓ Invites sent
              </span>
            ) : (
              <>
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-[11px] font-bold uppercase tracking-[.06em] border border-black/20 bg-white cursor-pointer hover:bg-black/5"
                >
                  Cancel
                </button>
                {/* Copy link — creates invite records + copies the accept URL to clipboard */}
                <button
                  onClick={handleCopyLink}
                  disabled={copyingLink || saving || mixedOrgs}
                  className="px-4 py-2 text-[11px] font-bold uppercase tracking-[.06em] border border-black/25 bg-white text-black/70 cursor-pointer hover:bg-black/5 disabled:opacity-50 flex items-center gap-2"
                >
                  {copyingLink && <span className="w-3 h-3 border border-black/20 border-t-black/60 rounded-full animate-spin" />}
                  {copyingLink ? 'Getting link…' : 'Copy Link'}
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={saving || copyingLink || mixedOrgs}
                  className="px-4 py-2 text-[11px] font-bold uppercase tracking-[.06em] bg-[#1A1A18] text-[#F5F3EF] cursor-pointer hover:opacity-80 disabled:opacity-50 flex items-center gap-2"
                >
                  {saving && <span className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" />}
                  {saving
                    ? 'Sending…'
                    : buyerAlreadyActive
                      ? 'Send Invites'
                      : `Create ${skusNew.length} Workspace${skusNew.length === 1 ? '' : 's'}`}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
