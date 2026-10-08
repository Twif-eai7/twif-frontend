import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, Bell } from 'lucide-react'
import { usePmStore } from '../../../stores/pmStore'
import { useMemberId } from '../../../stores/profileStore'
import { IconButton, PmButton, PmIcon } from './PmUi'

export default function DueDateAlertToast() {
  const memberId = useMemberId()
  const navigate = useNavigate()
  const fetchNotifications = usePmStore(s => s.fetchNotifications)
  const subscribeToNotifications = usePmStore(s => s.subscribeToNotifications)
  const alertQueue = usePmStore(s => s.alertQueue)
  const markNotificationRead = usePmStore(s => s.markNotificationRead)
  const snoozeNotification = usePmStore(s => s.snoozeNotification)
  const dismissAlert = usePmStore(s => s.dismissAlert)

  useEffect(() => {
    fetchNotifications()
    const unsub = subscribeToNotifications(memberId)
    return () => { unsub?.() }
  }, [memberId, fetchNotifications, subscribeToNotifications])

  const current = alertQueue[0]
  if (!current) return null

  return (
    <div className="fixed bottom-5 right-5 z-[80] w-[340px] bg-white rounded-lg shadow-xl border border-stone-200 overflow-hidden">
      <div className="h-0.5 bg-[#4d68f0]" />
      <div className="p-4 space-y-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2.5">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-amber-50 text-amber-600 flex-shrink-0 mt-0.5">
              <PmIcon icon={Bell} size={14} />
            </span>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-amber-600">Upcoming task</p>
              <h3 className="text-[13px] font-semibold text-stone-900 leading-snug mt-0.5">{current.title}</h3>
            </div>
          </div>
          <IconButton icon={X} title="Dismiss" onClick={() => dismissAlert(current.id)} />
        </div>
        {current.body && <p className="text-[11px] text-stone-500 pl-9">{current.body}</p>}
        <div className="flex items-center gap-1.5 pt-1">
          <PmButton
            variant="primary"
            className="flex-1"
            onClick={() => {
              markNotificationRead(current.id)
              if (current.project_id && current.task_id) {
                navigate(`/dashboard/projects/${current.project_id}?task=${current.task_id}`)
              }
            }}
          >
            Open task
          </PmButton>
          <PmButton onClick={() => snoozeNotification(current.id, 10)}>Snooze 10m</PmButton>
          <PmButton variant="ghost" onClick={() => markNotificationRead(current.id)}>Dismiss</PmButton>
        </div>
      </div>
    </div>
  )
}
