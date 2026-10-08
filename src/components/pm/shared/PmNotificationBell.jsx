import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { usePmStore } from '../../../stores/pmStore'
import { PmIcon } from './PmUi'

export default function PmNotificationBell() {
  const navigate = useNavigate()
  const notifications = usePmStore(s => s.notifications)
  const fetchNotifications = usePmStore(s => s.fetchNotifications)
  const markNotificationRead = usePmStore(s => s.markNotificationRead)
  const markAllNotificationsRead = usePmStore(s => s.markAllNotificationsRead)
  const [open, setOpen] = useState(false)

  useEffect(() => { fetchNotifications() }, [fetchNotifications])

  const unread = notifications.filter(n => !n.read).length

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="relative inline-flex items-center justify-center gap-1.5 w-8 h-8 lg:w-auto lg:h-8 lg:px-2.5 rounded-md border border-stone-200 bg-white text-[12px] font-medium text-stone-600 hover:bg-stone-50"
        title="Project notifications"
      >
        <span className="hidden lg:inline">Projects</span>
        <PmIcon icon={Bell} size={14} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#4d68f0] text-[9px] font-semibold text-white px-0.5">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 z-50 w-80 bg-white border border-stone-200 rounded-lg shadow-lg overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-stone-100">
              <p className="text-[12px] font-medium text-stone-800">Project alerts</p>
              {unread > 0 && (
                <button onClick={markAllNotificationsRead} className="text-[11px] text-[#4d68f0]">Mark all read</button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="text-[11px] text-stone-400 px-4 py-8 text-center">No notifications yet</p>
              ) : notifications.slice(0, 20).map(n => (
                <button
                  key={n.id}
                  onClick={() => {
                    markNotificationRead(n.id)
                    setOpen(false)
                    if (n.project_id) navigate(`/dashboard/projects/${n.project_id}${n.task_id ? `?task=${n.task_id}` : ''}`)
                  }}
                  className={`w-full text-left px-3 py-2.5 border-b border-stone-50 hover:bg-stone-50 ${n.read ? 'opacity-60' : ''}`}
                >
                  <p className="text-[12px] font-medium text-stone-800">{n.title}</p>
                  {n.body && <p className="text-[11px] text-stone-500 mt-0.5 line-clamp-2">{n.body}</p>}
                  <p className="text-[10px] text-stone-300 mt-0.5">{new Date(n.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
