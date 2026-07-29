import { useNavigate } from 'react-router-dom'
import { usePlmStore } from '../../stores/plmStore'

/**
 * Shown in the workspace chat when another participant starts or invites to a video call.
 */
export default function IncomingCallBanner({ workspaceId, memberId }) {
  const navigate = useNavigate()
  const incomingVideoCall = usePlmStore(s => s.incomingVideoCall)
  const activeVideoCall   = usePlmStore(s => s.activeVideoCall)
  const dismissIncomingCall = usePlmStore(s => s.dismissIncomingCall)
  const videoCallConnecting = usePlmStore(s => s.videoCallConnecting)

  if (!incomingVideoCall || incomingVideoCall.workspaceId !== workspaceId) return null
  if (activeVideoCall?.workspaceId === workspaceId) return null

  const joining = videoCallConnecting === workspaceId
  const label = incomingVideoCall.isInvite
    ? `${incomingVideoCall.startedByName} invited you to join the video call`
    : `${incomingVideoCall.startedByName} started a video call`

  const handleJoin = () => {
    navigate(`/plm/vedeeo?workspace=${workspaceId}`)
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
          onClick={dismissIncomingCall}
          className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.05em] text-black/45 hover:text-black/70 border border-black/15 bg-white rounded cursor-pointer"
        >
          Dismiss
        </button>
        <button
          type="button"
          onClick={handleJoin}
          disabled={joining}
          className="px-3 py-1 text-[10px] font-bold uppercase tracking-[.05em] text-white bg-[#7c3aed] hover:bg-[#6d28d9] border-none rounded cursor-pointer disabled:opacity-60"
        >
          {joining ? 'Joining…' : 'Join call'}
        </button>
      </div>
    </div>
  )
}
