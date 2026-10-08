import { useRef, useState } from 'react'
import { Paperclip, Plus, Trash2 } from 'lucide-react'
import { usePmStore } from '../../../stores/pmStore'
import { FieldLabel, IconButton, PmIcon } from '../shared/PmUi'

function isImage(att) {
  return (att.mime_type || '').startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(att.file_name || '')
}

export default function TaskAttachmentSection({ task }) {
  const addAttachments = usePmStore(s => s.addAttachments)
  const deleteAttachment = usePmStore(s => s.deleteAttachment)
  const inputRef = useRef()
  const [uploading, setUploading] = useState(false)

  const attachments = task.attachments || []

  const handleFiles = async (list) => {
    const files = [...list]
    if (!files.length) return
    setUploading(true)
    try {
      await addAttachments(task.id, files)
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <FieldLabel icon={Paperclip}>Attachments · {attachments.length}</FieldLabel>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-1 text-[11px] text-[#4d68f0] hover:underline disabled:opacity-50"
        >
          <PmIcon icon={Plus} size={11} />
          {uploading ? 'Uploading…' : 'Add files'}
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={e => handleFiles(e.target.files)}
        />
      </div>

      {attachments.length === 0 ? (
        <p className="text-[11px] text-stone-400 bg-stone-50 rounded-md px-3 py-2.5 border border-stone-100">
          No files yet.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {attachments.map(att => (
            <div key={att.id} className="relative group rounded-md border border-stone-100 overflow-hidden bg-stone-50">
              {isImage(att) ? (
                <a href={att.file_url} target="_blank" rel="noreferrer">
                  <img src={att.file_url} alt={att.file_name} className="w-full h-20 object-cover" />
                </a>
              ) : (
                <a href={att.file_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-2.5 py-3 text-[11px] text-stone-700">
                  <PmIcon icon={Paperclip} size={12} className="text-stone-400 flex-shrink-0" />
                  <span className="truncate">{att.file_name}</span>
                </a>
              )}
              <IconButton
                icon={Trash2}
                title="Remove"
                danger
                size={12}
                className="absolute top-1 right-1 w-6 h-6 bg-white/90 opacity-0 group-hover:opacity-100"
                onClick={() => deleteAttachment(task.id, att.id)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
