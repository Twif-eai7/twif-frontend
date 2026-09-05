import { useNavigate } from 'react-router-dom'
import { usePlmStore } from '../../stores/plmStore'

/**
 * Shown in the workspace chat when another participant starts or invites to a video call.
 */
export default function IncomingCallBanner({ workspaceId, memberId }) {
  const navigate = useNavigate()
  const incomingVideoCall = usePlmStore(s => s.incomingVideoCall)
  const activeVideoCall   = usePlmStore(s => s.activeVideoCall)
  const declineVideoCall   = usePlmStore(s => s.declineVideoCall)
  const videoCallConnecting = usePlmStore(s => s.videoCallConnecting)

  if (!incomingVideoCall || incomingVideoCall.workspaceId !== workspaceId) return null
  if (activeVideoCall?.workspaceId === workspaceId) return null

  const joining = videoCallConnecting === workspaceId
  const label = incomingVideoCall.isInvite
    ? `${incomingVideoCall.startedByName} invited you to a video call`
    : `${incomingVideoCall.startedByName} is calling you`

  const handleAccept = () => {
    const invite = incomingVideoCall.inviteId
    const q = invite
      ? `workspace=${workspaceId}&invite=${encodeURIComponent(invite)}`
      : `workspace=${workspaceId}`
    navigate(`/plm/vedeeo?${q}`)
  }

  const handleDecline = async () => {
    try {
      await declineVideoCall(workspaceId, memberId, incomingVideoCall.inviteId)
    } catch {
      // banner is cleared inside declineVideoCall; ignore network errors
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-[#f5f0ff] border-b border-[#c4b5fd] flex-shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <span className="relative flex h-2 w-2 flex-shrink-0">
          <span className="absolute inline-flex h-full w-full rounded-full bg-[#7c3aed] opacity-60 animate-ping" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-[#7c3aed]" />
        </span>
        <span className="text-[11px] font-semibold text-[#5b21b6] truncate">{label}</span>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          type="button"
          onClick={handleDecline}
          disabled={joining}
          className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.05em] text-black/45 hover:text-black/70 border border-black/15 bg-white rounded cursor-pointer disabled:opacity-60"
        >
          Decline
        </button>
        <button
          type="button"
          onClick={handleAccept}
          disabled={joining}
          className="px-3 py-1 text-[10px] font-bold uppercase tracking-[.05em] text-white bg-[#7c3aed] hover:bg-[#6d28d9] border-none rounded cursor-pointer disabled:opacity-60"
        >
          {joining ? 'Joining…' : 'Accept'}
        </button>
      </div>
    </div>
  )
}
