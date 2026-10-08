import { useState } from 'react'
import { X, UserPlus, Trash2, Search } from 'lucide-react'
import { usePmStore } from '../../../stores/pmStore'
import { MemberAvatar } from '../shared/MemberAvatar'
import { IconButton, PmButton, PmIcon, inputClass, selectClass, modalShell } from '../shared/PmUi'

const ROLES = ['viewer', 'commenter', 'editor', 'owner']

const ROLE_COLORS = {
  owner:     'bg-violet-50 text-violet-600',
  editor:    'bg-blue-50 text-blue-600',
  commenter: 'bg-amber-50 text-amber-600',
  viewer:    'bg-stone-100 text-stone-500',
}

export default function ProjectMembersPanel({ onClose }) {
  const activeProject  = usePmStore(s => s.activeProject)
  const projectMembers = usePmStore(s => s.projectMembers)
  const inviteMember   = usePmStore(s => s.inviteMember)
  const updateMemberRole = usePmStore(s => s.updateMemberRole)
  const removeMember   = usePmStore(s => s.removeMember)

  const [search, setSearch]   = useState('')
  const [newRole, setNewRole] = useState('editor')
  const [adding, setAdding]   = useState(false)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const [memberId, setMemberId] = useState('')

  const handleInvite = async (e) => {
    e.preventDefault()
    if (!memberId.trim()) return
    setSaving(true)
    setError('')
    try {
      await inviteMember(activeProject.id, memberId.trim(), newRole)
      setMemberId('')
      setAdding(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const filtered = projectMembers.filter(m => {
    if (!search) return true
    return (m.full_name || m.email || '').toLowerCase().includes(search.toLowerCase())
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={`${modalShell} flex flex-col max-h-[80vh]`}>
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-stone-100 flex-shrink-0">
          <div>
            <h2 className="text-[13px] font-semibold text-stone-900">Members</h2>
            <p className="text-[11px] text-stone-400 mt-0.5">{activeProject?.title}</p>
          </div>
          <div className="flex items-center gap-1">
            <PmButton variant="primary" icon={UserPlus} onClick={() => setAdding(a => !a)}>
              Invite
            </PmButton>
            <IconButton icon={X} title="Close" onClick={onClose} />
          </div>
        </div>

        {adding && (
          <form onSubmit={handleInvite} className="px-5 py-3 border-b border-stone-100 bg-stone-50 space-y-2.5">
            {error && <p className="text-[12px] text-red-500">{error}</p>}
            <div className="flex gap-2">
              <input
                autoFocus
                value={memberId}
                onChange={e => setMemberId(e.target.value)}
                placeholder="Member ID (UUID)…"
                className={inputClass}
              />
              <select value={newRole} onChange={e => setNewRole(e.target.value)} className={`${selectClass} w-28 flex-shrink-0`}>
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <PmButton variant="primary" disabled={saving || !memberId.trim()} className="flex-1" onClick={handleInvite}>
                {saving ? 'Inviting…' : 'Invite member'}
              </PmButton>
              <PmButton onClick={() => setAdding(false)}>Cancel</PmButton>
            </div>
          </form>
        )}

        <div className="px-4 py-2.5 border-b border-stone-100 flex-shrink-0">
          <div className="flex items-center gap-2 h-8 px-2.5 border border-stone-200 rounded-md bg-white">
            <PmIcon icon={Search} size={13} className="text-stone-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search members…"
              className="flex-1 text-[12px] outline-none placeholder-stone-400"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="text-center py-10 text-[12px] text-stone-400">
              {search ? 'No members match' : 'No members yet'}
            </div>
          ) : (
            filtered.map(member => (
              <div key={member.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-stone-50 group">
                <MemberAvatar member={member} size="md" />
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium text-stone-800 truncate">{member.full_name || member.email}</p>
                  <p className="text-[11px] text-stone-400 truncate">{member.email || member.member_id}</p>
                </div>
                <select
                  value={member.role}
                  onChange={async e => await updateMemberRole(activeProject.id, member.member_id || member.id, e.target.value)}
                  className={`text-[10px] font-medium border-0 rounded-md px-2 py-1 outline-none cursor-pointer ${ROLE_COLORS[member.role] || ROLE_COLORS.viewer}`}
                >
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <IconButton
                  icon={Trash2}
                  title="Remove"
                  danger
                  className="opacity-0 group-hover:opacity-100 w-6 h-6"
                  size={12}
                  onClick={async () => {
                    if (!window.confirm('Remove this member from the project?')) return
                    await removeMember(activeProject.id, member.member_id || member.id)
                  }}
                />
              </div>
            ))
          )}
        </div>

        <div className="px-5 py-3 border-t border-stone-100 flex-shrink-0">
          <p className="text-[11px] text-stone-400 text-center">
            {projectMembers.length} member{projectMembers.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>
    </div>
  )
}
