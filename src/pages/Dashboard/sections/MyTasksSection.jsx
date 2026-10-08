import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { usePmStore } from '../../../stores/pmStore'
import MyTasksView from '../../../components/pm/views/MyTasksView'
import TaskDetailDrawer from '../../../components/pm/task/TaskDetailDrawer'
import { Spinner } from '../../../components/ui'
import { PRIORITY_CONFIG } from '../../../components/pm/shared/PriorityIcon'
import { PmIcon, selectClass } from '../../../components/pm/shared/PmUi'

export default function MyTasksSection() {
  const navigate = useNavigate()
  const myTasks = usePmStore(s => s.myTasks)
  const myTasksLoading = usePmStore(s => s.myTasksLoading)
  const fetchMyTasks = usePmStore(s => s.fetchMyTasks)
  const openTask = usePmStore(s => s.openTask)
  const [priority, setPriority] = useState('')

  useEffect(() => {
    fetchMyTasks(priority ? { priority } : {})
  }, [fetchMyTasks, priority])

  return (
    <div className="flex flex-col h-full bg-[#fafafa]">
      <div className="flex items-center justify-between px-4 sm:px-6 pt-5 pb-4 border-b border-stone-200/80 flex-shrink-0 bg-white">
        <div>
          <button type="button" onClick={() => navigate('/dashboard/projects')} className="inline-flex items-center gap-1 text-[11px] text-stone-400 hover:text-stone-700">
            <PmIcon icon={ChevronLeft} size={12} />
            Projects
          </button>
          <h1 className="text-[15px] font-semibold text-stone-900 tracking-tight mt-1">My Tasks</h1>
          <p className="text-[12px] text-stone-400 mt-0.5">Assigned work, grouped by due date</p>
        </div>
        <select
          value={priority}
          onChange={e => setPriority(e.target.value)}
          className={`${selectClass} w-auto text-[12px] h-8 py-0`}
        >
          <option value="">All priorities</option>
          {Object.entries(PRIORITY_CONFIG).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </div>

      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
        {myTasksLoading ? (
          <div className="flex justify-center py-16"><Spinner light={false} size="w-6 h-6" /></div>
        ) : (
          <MyTasksView
            tasks={myTasks}
            onTaskClick={(task) => {
              if (task.project_id) navigate(`/dashboard/projects/${task.project_id}?task=${task.id}`)
              else openTask(task.id)
            }}
          />
        )}
      </div>
      <TaskDetailDrawer />
    </div>
  )
}
