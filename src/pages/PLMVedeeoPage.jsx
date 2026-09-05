import { useEffect, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { usePlmStore } from '../stores/plmStore'
import { useOrgsInit } from '../stores/orgsStore'
import { usePLMCatalog } from '../hooks/usePLMCatalog'
import { useProfileHeader } from '../stores/profileStore'
import VideoCallOverlay from '../components/plm/VideoCallOverlay'
import { Spinner } from '../components/ui'

export default function PLMVedeeoPage() {
  useOrgsInit()
  const { memberId, role } = usePLMCatalog()
  const profileHeader = useProfileHeader()
  const userName = profileHeader?.name || role

  const [params] = useSearchParams()
  const navigate = useNavigate()
  const workspaceId = params.get('workspace')
  const inviteId = params.get('invite')

  const openWorkspace       = usePlmStore(s => s.openWorkspace)
  const startVideoCall      = usePlmStore(s => s.startVideoCall)
  const acceptVideoCall     = usePlmStore(s => s.acceptVideoCall)
  const endVideoCall        = usePlmStore(s => s.endVideoCall)
  const activeVideoCall     = usePlmStore(s => s.activeVideoCall)
  const videoCallConnecting = usePlmStore(s => s.videoCallConnecting)

  const startedRef = useRef(false)

  useEffect(() => {
    if (!workspaceId) {
      navigate('/plm', { replace: true })
      return
    }
    if (!memberId) return
    openWorkspace(workspaceId, null, { silent: true })
  }, [workspaceId, memberId, navigate, openWorkspace])

  useEffect(() => {
    if (!workspaceId || !memberId) return
    if (activeVideoCall?.workspaceId === workspaceId && activeVideoCall.joinUrl) return
    if (videoCallConnecting === workspaceId) return
    if (startedRef.current) return

    startedRef.current = true
    const run = inviteId
      ? acceptVideoCall(workspaceId, memberId, userName, inviteId)
      : startVideoCall(workspaceId, memberId, userName)

    run.catch((err) => {
      startedRef.current = false
      alert('Could not start video call: ' + err.message)
      navigate(`/plm?workspace=${workspaceId}`, { replace: true })
    })
  }, [
    workspaceId, memberId, userName, inviteId,
    activeVideoCall, videoCallConnecting,
    startVideoCall, acceptVideoCall, navigate,
  ])

  const handleLeave = async () => {
    if (workspaceId && memberId) {
      await endVideoCall(workspaceId, memberId)
    }
    navigate(workspaceId ? `/plm?workspace=${workspaceId}` : '/plm', { replace: true })
  }

  if (!workspaceId || !memberId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0a0a09]">
        <Spinner light size="w-6 h-6" />
      </div>
    )
  }

  const isReady = activeVideoCall?.workspaceId === workspaceId && activeVideoCall.joinUrl
  const isConnecting = videoCallConnecting === workspaceId

  if (isReady) {
    return (
      <VideoCallOverlay
        fullPage
        workspaceId={workspaceId}
        memberId={memberId}
        userName={userName}
        joinUrl={activeVideoCall.joinUrl}
        onLeave={handleLeave}
      />
    )
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[#0a0a09]">
      <Spinner light size="w-6 h-6" />
      <p className="text-[11px] font-bold uppercase tracking-[.1em] text-white/50">
        {isConnecting ? 'Connecting to video call…' : inviteId ? 'Joining video call…' : 'Starting video call…'}
      </p>
    </div>
  )
}
