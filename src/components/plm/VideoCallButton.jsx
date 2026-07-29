import { useNavigate } from 'react-router-dom'
import { usePlmStore } from '../../stores/plmStore'

/**
 * Opens the Vedeeo video-call page for this workspace.
 * Call UI lives at /plm/vedeeo — not inline on /plm.
 */
export default function VideoCallButton({ workspaceId, memberId, userName }) {
  const navigate = useNavigate()
  const activeVideoCall     = usePlmStore(s => s.activeVideoCall)
  const videoCallConnecting = usePlmStore(s => s.videoCallConnecting)
  const incomingVideoCall   = usePlmStore(s => s.incomingVideoCall)

  const isConnecting = videoCallConnecting === workspaceId
  const isActive = activeVideoCall?.workspaceId === workspaceId
  const hasIncoming = incomingVideoCall?.workspaceId === workspaceId && !isActive
  const disabled = (!workspaceId || !memberId) && !isActive && !hasIncoming

  const goToVedeeo = () => {
    if (!workspaceId || disabled) return
    navigate(`/plm/vedeeo?workspace=${workspaceId}`)
  }

  return (
    <button
      type="button"
      onClick={goToVedeeo}
      disabled={disabled && !isConnecting}
      title={
        isActive ? 'Return to video call'
          : hasIncoming ? 'Join video call'
            : 'Start video call'
      }
      aria-label="Video call"
      className={`relative flex items-center gap-1.5 px-3.5 py-2 rounded-lg font-bold uppercase tracking-[.05em] text-[10px] transition-all border-none text-white shadow-sm
        ${isConnecting
          ? 'bg-gradient-to-r from-[#4dabff]/70 to-[#2D8CFF]/70 cursor-wait'
          : isActive
            ? 'bg-gradient-to-r from-[#1a6fd4] to-[#0e5ec4] cursor-pointer shadow-md ring-2 ring-[#2D8CFF]/40'
            : hasIncoming
              ? 'bg-gradient-to-r from-[#4dabff] to-[#2D8CFF] cursor-pointer shadow-md animate-pulse ring-2 ring-[#2D8CFF]/50 hover:from-[#3da0ff] hover:to-[#2681eb]'
              : disabled
                ? 'bg-gradient-to-r from-[#4dabff]/40 to-[#2D8CFF]/40 text-white/70 cursor-not-allowed'
                : 'bg-gradient-to-r from-[#4dabff] to-[#2D8CFF] hover:from-[#3da0ff] hover:to-[#2681eb] cursor-pointer hover:shadow-md'}
        ${(!workspaceId || !memberId) && !isActive ? 'opacity-50' : ''}`}
    >
      {isConnecting ? (
        <svg className="w-4 h-4 animate-spin flex-shrink-0" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5"
            strokeDasharray="31.4 31.4" strokeLinecap="round" />
        </svg>
      ) : (
        <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="23 7 16 12 23 17 23 7" />
          <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
        </svg>
      )}
      <span className="whitespace-nowrap">
        {isConnecting ? 'Connecting…' : isActive ? 'In call' : hasIncoming ? 'Join call' : 'Video call'}
      </span>
      {hasIncoming && (
        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500 border-2 border-white" />
      )}
    </button>
  )
}
