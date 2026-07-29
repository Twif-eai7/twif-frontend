import { useEffect, useRef, useCallback, useState, useMemo } from 'react'
import DailyIframe from '@daily-co/daily-js'
import { usePlmStore } from '../../stores/plmStore'

/** Daily allows only one iframe instance globally — tear down any leftover instance. */
async function destroyExistingDailyInstance() {
  const existing = DailyIframe.getCallInstance()
  if (!existing) return
  try {
    await existing.destroy()
  } catch {
    // already destroyed or mid-teardown
  }
}

function workspaceParticipants(ws, myMemberId) {
  if (!ws) return []
  const list = []
  if (ws.merchant_member_id && ws.merchant_member_id !== myMemberId) {
    list.push({ id: ws.merchant_member_id, role: 'Merchant', email: ws.merchant_email || 'Merchant' })
  }
  if (ws.buyer_member_id && ws.buyer_member_id !== myMemberId) {
    list.push({ id: ws.buyer_member_id, role: 'Buyer', email: ws.buyer_email || 'Buyer' })
  }
  if (ws.supplier_member_id && ws.supplier_member_id !== myMemberId) {
    list.push({ id: ws.supplier_member_id, role: 'Supplier', email: ws.supplier_email || 'Supplier' })
  }
  return list
}

export default function VideoCallOverlay({ workspaceId, memberId, userName, roomUrl, token, onLeave, fullPage = false }) {
  const inviteToVideoCall = usePlmStore(s => s.inviteToVideoCall)
  const activeWorkspace   = usePlmStore(s => s.activeWorkspace)

  const containerRef = useRef(null)
  const callFrameRef = useRef(null)
  const invitePanelRef = useRef(null)
  const onLeaveRef = useRef(onLeave)
  const leavingRef = useRef(false)
  const [inviting, setInviting] = useState(false)
  const [inviteMsg, setInviteMsg] = useState(null)
  const [showInvitePanel, setShowInvitePanel] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [selectedIds, setSelectedIds] = useState([])

  const participants = useMemo(
    () => workspaceParticipants(activeWorkspace, memberId),
    [activeWorkspace, memberId]
  )

  useEffect(() => {
    setSelectedIds(participants.map(p => p.id))
  }, [participants])

  useEffect(() => {
    if (!showInvitePanel) return
    const onDocClick = (e) => {
      if (invitePanelRef.current && !invitePanelRef.current.contains(e.target)) {
        setShowInvitePanel(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [showInvitePanel])

  onLeaveRef.current = onLeave

  const destroyCallFrame = useCallback(async () => {
    const frame = callFrameRef.current ?? DailyIframe.getCallInstance()
    callFrameRef.current = null
    if (!frame) return
    try {
      await frame.destroy()
    } catch {
      // ignore
    }
  }, [])

  const handleLeave = useCallback(() => {
    if (leavingRef.current) return
    leavingRef.current = true
    destroyCallFrame().finally(() => {
      onLeaveRef.current?.()
    })
  }, [destroyCallFrame])

  const toggleParticipant = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const handleInvite = async () => {
    if (!workspaceId || !memberId || inviting) return
    const emails = inviteEmail.trim() ? [inviteEmail.trim()] : []
    if (!selectedIds.length && !emails.length) {
      setInviteMsg('Select a participant or enter an email')
      setTimeout(() => setInviteMsg(null), 2500)
      return
    }
    setInviting(true)
    setInviteMsg(null)
    try {
      const data = await inviteToVideoCall(workspaceId, memberId, userName, selectedIds, emails)
      const parts = []
      if (data.invited?.length) parts.push(`${data.invited.length} in-app`)
      if (data.emailed?.length) parts.push(`${data.emailed.length} email`)
      setInviteMsg(parts.length ? `Sent (${parts.join(', ')})` : 'Invite sent')
      setInviteEmail('')
      setShowInvitePanel(false)
      setTimeout(() => setInviteMsg(null), 3000)
    } catch (err) {
      setInviteMsg(err.message || 'Invite failed')
      setTimeout(() => setInviteMsg(null), 3000)
    } finally {
      setInviting(false)
    }
  }

  useEffect(() => {
    if (!containerRef.current || !roomUrl || !token) return

    let cancelled = false
    let callFrame = null

    const setup = async () => {
      await destroyExistingDailyInstance()
      if (cancelled || !containerRef.current) return

      callFrame = DailyIframe.createFrame(containerRef.current, {
        iframeStyle: {
          position: 'absolute',
          top:      '0',
          left:     '0',
          width:    '100%',
          height:   '100%',
          border:   'none',
        },
        showLeaveButton:      true,
        showFullscreenButton: true,
        showParticipantsBar:  'auto',
      })
      if (cancelled) {
        await callFrame.destroy().catch(() => {})
        return
      }

      callFrameRef.current = callFrame
      callFrame.join({ url: roomUrl, token })

      callFrame.on('left-meeting', handleLeave)
      callFrame.on('error', (e) => {
        console.error('Daily call error:', e)
        handleLeave()
      })
    }

    setup().catch((err) => {
      console.error('Failed to start Daily call frame:', err)
      handleLeave()
    })

    const onKey = (e) => {
      if (e.key === 'Escape') {
        callFrameRef.current?.leave().catch(() => {})
        handleLeave()
      }
    }
    window.addEventListener('keydown', onKey)

    return () => {
      cancelled = true
      window.removeEventListener('keydown', onKey)
      const frame = callFrame ?? callFrameRef.current
      callFrameRef.current = null
      if (frame) {
        frame.destroy().catch(() => {})
      }
    }
  }, [roomUrl, token, handleLeave])

  return (
    <div className={`${fullPage ? 'min-h-screen w-full' : 'fixed inset-0 z-[9999]'} flex flex-col bg-[#0a0a09]`}>
      <div className="flex items-center justify-between px-5 py-2.5 bg-[#1A1A18] border-b border-white/[.06] flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75 animate-ping" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
          </span>
          <span className="text-[11px] font-bold uppercase tracking-[.08em] text-white/70">
            Video Call
          </span>
        </div>
        <div className="flex items-center gap-3">
          {inviteMsg && (
            <span className="text-[10px] font-medium text-white/50">{inviteMsg}</span>
          )}
          <div className="relative" ref={invitePanelRef}>
            <button
              type="button"
              onClick={() => setShowInvitePanel(v => !v)}
              disabled={inviting}
              className="px-3 py-1.5 bg-[#7c3aed] hover:bg-[#6d28d9] disabled:opacity-50 text-[10px] font-bold uppercase tracking-[.08em] text-white border-none cursor-pointer transition-colors rounded-sm"
            >
              {inviting ? 'Inviting…' : 'Invite to join'}
            </button>

            {showInvitePanel && (
              <div className="absolute right-0 top-full mt-2 w-72 bg-[#1A1A18] border border-white/10 rounded-md shadow-xl z-10 p-3">
                <p className="text-[10px] font-bold uppercase tracking-[.08em] text-white/50 mb-2">
                  Notify in workspace
                </p>
                {participants.length === 0 ? (
                  <p className="text-[11px] text-white/40 mb-3">No other workspace members on file.</p>
                ) : (
                  <ul className="space-y-1.5 mb-3">
                    {participants.map(p => (
                      <li key={p.id}>
                        <label className="flex items-center gap-2 cursor-pointer group">
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(p.id)}
                            onChange={() => toggleParticipant(p.id)}
                            className="accent-[#7c3aed]"
                          />
                          <span className="text-[11px] text-white/80 group-hover:text-white">
                            <span className="font-semibold">{p.role}</span>
                            <span className="text-white/45 ml-1.5">{p.email}</span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}

                <p className="text-[10px] font-bold uppercase tracking-[.08em] text-white/50 mb-1.5">
                  Or invite by email
                </p>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleInvite()}
                  placeholder="name@company.com"
                  className="w-full px-2.5 py-1.5 text-[12px] bg-white/5 border border-white/15 rounded text-white placeholder:text-white/30 outline-none focus:border-[#7c3aed] mb-3"
                />

                <button
                  type="button"
                  onClick={handleInvite}
                  disabled={inviting}
                  className="w-full py-1.5 bg-[#7c3aed] hover:bg-[#6d28d9] disabled:opacity-50 text-[10px] font-bold uppercase tracking-[.08em] text-white border-none cursor-pointer rounded-sm"
                >
                  Send invite
                </button>
              </div>
            )}
          </div>
          <span className="text-[10px] font-medium tracking-[.04em] text-white/30 uppercase hidden sm:inline">
            Press Esc to leave
          </span>
          <button
            type="button"
            onClick={() => {
              callFrameRef.current?.leave().catch(() => {})
              handleLeave()
            }}
            className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-[10px] font-bold uppercase tracking-[.08em] text-white border-none cursor-pointer transition-colors rounded-sm"
          >
            Leave Call
          </button>
        </div>
      </div>

      <div ref={containerRef} className="flex-1 relative" />
    </div>
  )
}
