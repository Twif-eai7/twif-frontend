import { useState, useRef, useEffect } from 'react'
import { Plus, Check } from 'lucide-react'
import { usePmStore } from '../../../stores/pmStore'
import { MemberAvatar, MemberAvatarGroup } from '../shared/MemberAvatar'
import { PmIcon } from '../shared/PmUi'

export default function TaskAssigneeSelector({ task }) {
  const projectMembers = usePmStore(s => s.projectMembers)
  const addAssignees   = usePmStore(s => s.addAssignees)
  const removeAssignee = usePmStore(s => s.removeAssignee)

  const [open, setOpen]     = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef()

  useEffect(() => {
    if (!open) return
    const handler = e => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const assignedIds  = new Set((task.assignees || []).map(a => a.member_id))
  const filtered = projectMembers.filter(m =>
    !search || (m.full_name || m.email || '').toLowerCase().includes(search.toLowerCase())
  )

  const toggle = async (member) => {
    if (assignedIds.has(member.id)) {
      await removeAssignee(task.id, member.id)
    } else {
      await addAssignees(task.id, [member.id])
    }
  }

  return (
    <div className="relative" ref={ref}>
      {/* Trigger */}
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 group"
        title="Manage assignees"
      >
        {(task.assignees?.length > 0) ? (
          <MemberAvatarGroup members={task.assignees} max={4} size="sm" />
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] text-stone-400 hover:text-stone-600 border border-dashed border-stone-300 rounded-md px-2 py-1 transition-colors">
            <PmIcon icon={Plus} size={10} /> Assign
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 top-full mt-1.5 z-50 w-56 bg-white rounded-lg border border-stone-200 shadow-lg overflow-hidden">
          <div className="p-2 border-b border-stone-100">
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search members…"
              className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-stone-50 border border-stone-200 outline-none focus:border-[#4d68f0] placeholder-stone-400"
            />
          </div>

          <div className="max-h-52 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="text-[11px] text-stone-400 text-center py-4">No members found</p>
            ) : (
              filtered.map(member => {
                const isAssigned = assignedIds.has(member.id)
                return (
                  <button
                    key={member.id}
                    onClick={() => toggle(member)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-stone-50 transition-colors ${isAssigned ? 'bg-blue-50/50' : ''}`}
                  >
                    <MemberAvatar member={member} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-stone-800 truncate">{member.full_name || member.email}</p>
                      {member.department && (
                        <p className="text-[10px] text-stone-400 capitalize">{member.department}</p>
                      )}
                    </div>
                    {isAssigned && (
                      <PmIcon icon={Check} size={13} className="text-[#4d68f0] flex-shrink-0" />
                    )}
                  </button>
                )
              })
            )}
          </div>

          {projectMembers.length === 0 && (
            <p className="text-[11px] text-stone-400 text-center px-3 py-4">
              Invite members to the project first
            </p>
          )}
        </div>
      )}
    </div>
  )
}
