import { useMemo, useState } from 'react'
import DOMPurify from 'dompurify'
import { MessageSquare, Paperclip, Trash2 } from 'lucide-react'
import { usePmStore } from '../../../stores/pmStore'
import { MemberAvatar } from '../shared/MemberAvatar'
import RichNoteEditor from '../../plm/RichNoteEditor'
import { FieldLabel, IconButton, PmIcon } from '../shared/PmUi'

function fmt(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function TaskCommentThread({ task }) {
  const addComment = usePmStore(s => s.addComment)
  const deleteComment = usePmStore(s => s.deleteComment)
  const uploadInlineImage = usePmStore(s => s.uploadInlineImage)
  const projectMembers = usePmStore(s => s.projectMembers)

  const [mentionIds, setMentionIds] = useState([])
  const [files, setFiles] = useState([])
  const [sending, setSending] = useState(false)

  const comments = task.comments || []

  const handleSend = async ({ html }) => {
    setSending(true)
    try {
      await addComment(task.id, { html, mentions: mentionIds, files })
      setMentionIds([])
      setFiles([])
    } finally {
      setSending(false)
    }
  }

  const mentionOptions = useMemo(() => projectMembers || [], [projectMembers])

  return (
    <div className="space-y-3">
      <FieldLabel icon={MessageSquare}>Comments · {comments.length}</FieldLabel>

      <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
        {comments.length === 0 && (
          <p className="text-[11px] text-stone-400 bg-stone-50 rounded-md px-3 py-3 border border-stone-100">
            No comments yet. Mention teammates with the chips below.
          </p>
        )}
        {comments.map(c => {
          const author = c.organization_members || {}
          return (
            <div key={c.id} className="flex items-start gap-2 group">
              <MemberAvatar member={author} size="sm" />
              <div className="flex-1 min-w-0 bg-stone-50 rounded-md px-3 py-2 border border-stone-100">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold text-stone-800 truncate">{author.full_name || author.email || 'Member'}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-stone-400">{fmt(c.created_at)}</span>
                    <IconButton
                      icon={Trash2}
                      title="Delete"
                      danger
                      size={12}
                      className="opacity-0 group-hover:opacity-100 w-6 h-6"
                      onClick={() => deleteComment(task.id, c.id)}
                    />
                  </div>
                </div>
                <div
                  className="text-xs text-stone-700 mt-1 prose prose-sm max-w-none [&_img]:max-w-full [&_img]:rounded-lg"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(c.body || '') }}
                />
                {(c.attachments || []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {c.attachments.map((a, i) => (
                      <a key={i} href={a.url} target="_blank" rel="noreferrer" className="text-[10px] text-[#4d68f0] hover:underline truncate max-w-[160px]">
                        <PmIcon icon={Paperclip} size={10} className="inline mr-0.5" /> {a.name}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {mentionOptions.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {mentionOptions.map(m => {
            const id = m.member_id || m.id
            const on = mentionIds.includes(id)
            return (
              <button
                key={id}
                type="button"
                onClick={() => setMentionIds(prev => on ? prev.filter(x => x !== id) : [...prev, id])}
                className={`text-[10px] px-2 py-0.5 rounded-full border ${on ? 'bg-violet-50 text-violet-700 border-violet-200' : 'bg-white text-stone-500 border-stone-200'}`}
              >
                @{m.full_name || m.email || 'member'}
              </button>
            )
          })}
        </div>
      )}

      <input
        type="file"
        multiple
        onChange={e => setFiles([...e.target.files])}
        className="text-[11px] text-stone-500"
      />
      {files.length > 0 && (
        <p className="text-[10px] text-stone-400">{files.length} file{files.length > 1 ? 's' : ''} attached</p>
      )}

      <RichNoteEditor
        key={task.id}
        placeholder="Write a comment… (Ctrl/Cmd+Enter to send)"
        sendLabel={sending ? 'Sending…' : 'Comment'}
        draftKey={`pm-comment-${task.id}`}
        maximizable={false}
        showTag={false}
        uploadImage={async (file) => {
          const { url } = await uploadInlineImage(task.id, file)
          return url
        }}
        onSend={handleSend}
      />
    </div>
  )
}
