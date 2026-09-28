import { useRef, useState, useEffect, useCallback } from 'react'
import DOMPurify from 'dompurify'
import CameraCaptureModal from './modals/CameraCaptureModal'
import {
  RICH_HTML_SANITIZE_CONFIG, RICH_FONT_OPTIONS, RICH_SIZE_OPTIONS,
  extractImageUrls, noteHasContent,
} from './richNote'

// A self-contained rich-text note editor — the "Notes" composer used in the workspace and
// the Create-SKU flow. contentEditable + execCommand for formatting, DOMPurify on send.
// Storage is injected: `uploadImage(file) => Promise<url>` lets each host put inline images
// wherever it wants; `draftKey` (or null) controls localStorage draft persistence.
//
// Props:
//   initialHtml   {string}   note HTML to load once on mount (editing an existing note)
//   locked        {boolean}  disables all input
//   placeholder   {string}
//   onSend        {function} ({ html, text, images }) => void | Promise  — required
//   onChange      {function} ({ html }) => void  — optional, fires on every edit
//   uploadImage   {function} (File) => Promise<string url>  — required for attach/camera
//   draftKey      {string|null}  localStorage key for autosaved draft; null = no draft
//   autoFocus     {boolean}
//   sendLabel     {string}   send-button text (default "Save")
//   maximizable   {boolean}  show the maximize toggle (default true)
export default function RichNoteEditor({
  initialHtml = '', locked = false, placeholder = 'Write your note… (Ctrl/Cmd+Enter to send)',
  onSend, onChange, uploadImage, draftKey = null, autoFocus = false,
  sendLabel = 'Save', maximizable = true, clearOnSend = true,
  onHide, defaultMaximized = false, showTag = true,
}) {
  const editorRef   = useRef(null)
  const fileRef     = useRef(null)
  const savedRange  = useRef(null)
  const draftTimer  = useRef(null)
  const fontMenuRef = useRef(null)
  const sizeMenuRef = useRef(null)
  const caseMenuRef = useRef(null)

  // Resolve the starting content + formatting once (from initialHtml, else a saved draft).
  // Checked unconditionally now, not just when initialHtml is empty — a draft can only ever
  // exist here because a PREVIOUS session ended via Hide instead of Send/Done (doSend clears
  // it on success below), so if one's sitting in localStorage at all it's always more recent
  // unsent work than whatever's already saved, even when there's existing content to append
  // onto. Previously that in-progress addition was silently discarded on reopen since the
  // check never ran at all once initialHtml was non-empty.
  const [initial] = useState(() => {
    let html = initialHtml || '', meta = {}
    let restoredDraft = false
    if (draftKey) {
      try {
        const d = JSON.parse(localStorage.getItem(draftKey) || 'null')
        if (d?.html) { html = d.html; meta = d; restoredDraft = true }
      } catch { /* ignore */ }
    }
    return {
      html,
      restoredDraft,
      fontFamily: meta.fontFamily || '',
      fontSize: meta.fontSize || '',
      textColor: meta.textColor || '#1a1a18',
      highlightColor: meta.highlightColor || '#ffff00',
    }
  })

  const [hasContent,   setHasContent]   = useState(() => noteHasContent(initial.html))
  const [maximized,    setMaximized]    = useState(defaultMaximized)
  const [openMenu,     setOpenMenu]     = useState(null)   // 'font' | 'size' | 'case' | null
  const [fontFamily,   setFontFamily]   = useState(initial.fontFamily)
  const [fontSize,     setFontSize]     = useState(initial.fontSize)
  const [textColor,    setTextColor]    = useState(initial.textColor)
  const [hiliteColor,  setHiliteColor]  = useState(initial.highlightColor)
  const [active,       setActive]       = useState({})     // { bold, italic, underline, ul, ol }
  const [cameraOpen,   setCameraOpen]   = useState(false)
  const [camShots,     setCamShots]     = useState(0)
  const [uploading,    setUploading]    = useState(false)
  const [sending,      setSending]      = useState(false)
  const [lightboxUrl,  setLightboxUrl]  = useState(null) // full-screen review of an image already in the note — separate from the maximize toggle, which is the whole editor, not one photo

  const menuRefs = { font: fontMenuRef, size: sizeMenuRef, case: caseMenuRef }

  // ── mount: paint the starting HTML into the contentEditable node ──────────
  useEffect(() => {
    if (editorRef.current) editorRef.current.innerHTML = initial.html
    if (autoFocus && editorRef.current) editorRef.current.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const saveDraft = useCallback((extra = {}) => {
    if (!draftKey) return
    const html = editorRef.current?.innerHTML || ''
    if (!noteHasContent(html)) { try { localStorage.removeItem(draftKey) } catch { /* */ } return }
    try {
      localStorage.setItem(draftKey, JSON.stringify({
        html,
        fontFamily: extra.fontFamily ?? fontFamily,
        fontSize: extra.fontSize ?? fontSize,
        textColor: extra.textColor ?? textColor,
        highlightColor: extra.highlightColor ?? hiliteColor,
      }))
    } catch { /* quota / private mode */ }
  }, [draftKey, fontFamily, fontSize, textColor, hiliteColor])

  // ── selection helpers (toolbar controls steal focus) ──────────────────────
  const saveSelection = () => {
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode)) {
      savedRange.current = sel.getRangeAt(0).cloneRange()
    }
  }
  const restoreSelection = () => {
    if (!savedRange.current || !editorRef.current) return
    editorRef.current.focus()
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(savedRange.current)
  }

  // Track selection while the editor is mounted so toolbar clicks always have a target.
  useEffect(() => {
    const onSelChange = () => saveSelection()
    document.addEventListener('selectionchange', onSelChange)
    return () => document.removeEventListener('selectionchange', onSelChange)
  }, [])

  // Close popover menus on outside click.
  useEffect(() => {
    if (!openMenu) return
    const onDown = (e) => {
      const r = menuRefs[openMenu]
      if (r?.current && !r.current.contains(e.target)) setOpenMenu(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openMenu])

  const refreshActive = () => {
    try {
      setActive({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
        ul: document.queryCommandState('insertUnorderedList'),
        ol: document.queryCommandState('insertOrderedList'),
      })
    } catch { /* queryCommandState can throw with no selection */ }
  }

  // Wrap the current selection in a <span style=...> for props execCommand can't do reliably.
  const wrapStyle = (prop, value) => {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return
    const range = sel.getRangeAt(0)
    if (!editorRef.current?.contains(range.commonAncestorContainer)) return
    if (range.collapsed) return
    const span = document.createElement('span')
    span.style[prop] = value
    try {
      span.appendChild(range.extractContents())
      range.insertNode(span)
      sel.removeAllRanges()
      const nr = document.createRange()
      nr.selectNodeContents(span)
      sel.addRange(nr)
    } catch { /* cross-node ranges can fail — ignore */ }
  }

  const exec = (command, value = null) => {
    editorRef.current?.focus()
    if (command === 'fontSize')  return wrapStyle('fontSize', value)
    if (command === 'fontName')  return wrapStyle('fontFamily', value)
    try { document.execCommand(command, false, value) } catch { /* */ }
    refreshActive()
    setHasContent(noteHasContent(editorRef.current?.innerHTML))
    saveDraft()
    onChange?.({ html: editorRef.current?.innerHTML || '' })
  }

  const transformCase = (mode) => {
    restoreSelection()
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) { setOpenMenu(null); return }
    const text = sel.toString()
    let next = text
    if (mode === 'upper') next = text.toUpperCase()
    else if (mode === 'lower') next = text.toLowerCase()
    else if (mode === 'sentence') next = text.charAt(0).toUpperCase() + text.slice(1).toLowerCase()
    try { document.execCommand('insertText', false, next) } catch { /* */ }
    setOpenMenu(null)
    saveDraft()
    onChange?.({ html: editorRef.current?.innerHTML || '' })
  }

  const clearFormatting = () => {
    editorRef.current?.focus()
    try {
      document.execCommand('removeFormat')
      document.execCommand('foreColor', false, '#1a1a18')
    } catch { /* */ }
    refreshActive()
    saveDraft()
  }

  // ── inline images ────────────────────────────────────────────────────────
  const insertImages = async (files) => {
    const imgs = Array.from(files).filter(f => f.type.startsWith('image/'))
    if (!imgs.length || !uploadImage) return
    setUploading(true)
    try {
      restoreSelection()
      for (const file of imgs) {
        let url
        try { url = await uploadImage(file) } catch { url = null }
        if (!url) continue
        editorRef.current?.focus()
        restoreSelection()
        // Trailing <br> is required, not cosmetic: with nothing after it, an inserted image
        // that ends up as the editor's last node leaves no line for the caret to land on below
        // it — clicking under a tall image just re-selects the image instead of placing a text
        // cursor there. display:block avoids the same problem's inline-layout cousin (a bare
        // inline <img> can leave a dangling caret position beside it that's easy to miss).
        // width:260px (capped by max-width:100% so it still shrinks on a narrower editor,
        // e.g. mobile) instead of the max-width:100% this used to be alone — that scaled the
        // image to fill however wide the editor happened to be, which in the maximized
        // full-screen editor view meant a full-resolution photo rendering enormous, taller
        // than the viewport, since nothing bounded the height either.
        const imgHtml = `<img src="${url}" style="max-width:100%;width:260px;display:block;border-radius:6px;margin:4px 0;" /><br>`
        try { document.execCommand('insertHTML', false, imgHtml) }
        catch { editorRef.current?.insertAdjacentHTML('beforeend', imgHtml) }
        saveSelection()
      }
      setHasContent(true)
      saveDraft()
      onChange?.({ html: editorRef.current?.innerHTML || '' })
    } finally {
      setUploading(false)
    }
  }

  const handleCameraShot = async (file) => { setCamShots(n => n + 1); await insertImages([file]) }

  const handlePaste = (e) => {
    const imgs = Array.from(e.clipboardData?.items || []).filter(i => i.type.startsWith('image/'))
    if (imgs.length) { e.preventDefault(); insertImages(imgs.map(i => i.getAsFile()).filter(Boolean)) }
  }

  // ── send ─────────────────────────────────────────────────────────────────
  const doSend = async () => {
    if (locked || sending) return
    const raw = editorRef.current?.innerHTML || ''
    if (!noteHasContent(raw)) return
    const html = DOMPurify.sanitize(raw, RICH_HTML_SANITIZE_CONFIG)
    const text = editorRef.current?.textContent?.trim() || ''
    setSending(true)
    try {
      await onSend?.({ html, text, images: extractImageUrls(html) })
      if (clearOnSend) {
        if (editorRef.current) editorRef.current.innerHTML = ''
        setHasContent(false)
        setActive({})
        if (draftKey) { try { localStorage.removeItem(draftKey) } catch { /* */ } }
      }
      setMaximized(false)
    } finally {
      setSending(false)
    }
  }

  const onEditorKeyDown = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); doSend() }
  }
  const onEditorInput = () => {
    setHasContent(noteHasContent(editorRef.current?.innerHTML))
    refreshActive()
    clearTimeout(draftTimer.current)
    draftTimer.current = setTimeout(saveDraft, 400)
    onChange?.({ html: editorRef.current?.innerHTML || '' })
  }
  useEffect(() => () => clearTimeout(draftTimer.current), [])

  const tbBtn = 'w-8 h-8 flex items-center justify-center rounded border-none cursor-pointer disabled:opacity-30 bg-transparent text-black hover:bg-black/10'
  const tbActive = 'bg-[#7c3aed]/15 text-[#7c3aed]'

  return (
    <>
      {maximized && <div className="fixed inset-0 z-[65] bg-black/40" onClick={() => setMaximized(false)} />}
      <div className={maximized
        ? 'fixed inset-4 sm:inset-10 z-[70] flex flex-col border border-black rounded-lg bg-white shadow-2xl'
        : `flex flex-col border rounded-lg bg-white overflow-hidden ${locked ? 'border-black/10 bg-black/[.03]' : 'border-black/20 focus-within:border-black'}`}
      >
        {/* Toolbar */}
        <div className="flex items-center flex-wrap gap-0.5 px-1.5 py-1 border-b border-black/10 bg-black/[.02]">
          {maximizable && (
            <>
              <button type="button" title={maximized ? 'Minimize' : 'Maximize'}
                onMouseDown={e => e.preventDefault()} onClick={() => setMaximized(v => !v)} className={tbBtn}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {maximized
                    ? <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/>
                    : <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>}
                </svg>
              </button>
              <div className="w-px h-5 bg-black/15 mx-0.5" />
            </>
          )}

          {[['bold', 'B', 'font-bold'], ['italic', 'I', 'italic'], ['underline', 'U', 'underline']].map(([cmd, label, cls]) => (
            <button key={cmd} type="button" title={cmd} disabled={locked}
              onMouseDown={e => e.preventDefault()} onClick={() => exec(cmd)}
              className={`w-8 h-8 flex items-center justify-center rounded text-[13px] ${cls} border-none cursor-pointer disabled:opacity-30 ${active[cmd] ? tbActive : 'bg-transparent text-black hover:bg-black/10'}`}
            >{label}</button>
          ))}

          <button type="button" title="Bulleted list" disabled={locked}
            onMouseDown={e => e.preventDefault()} onClick={() => exec('insertUnorderedList')}
            className={`${tbBtn} ${active.ul ? tbActive : ''}`}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/>
              <circle cx="4" cy="6" r="1.3" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="4" cy="18" r="1.3" fill="currentColor" stroke="none"/>
            </svg>
          </button>
          <button type="button" title="Numbered list" disabled={locked}
            onMouseDown={e => e.preventDefault()} onClick={() => exec('insertOrderedList')}
            className={`${tbBtn} ${active.ol ? tbActive : ''} text-[11px] font-bold`}
          >1.</button>

          <div className="w-px h-5 bg-black/15 mx-0.5" />

          <div ref={caseMenuRef} className="relative">
            <button type="button" title="Change case" disabled={locked}
              onMouseDown={saveSelection} onClick={() => setOpenMenu(v => v === 'case' ? null : 'case')}
              className={`${tbBtn} text-[11px] font-bold`}
            >Aa</button>
            {openMenu === 'case' && (
              <div onMouseDown={e => e.stopPropagation()} className="absolute z-20 top-full left-1/2 -translate-x-1/2 mt-1 w-40 bg-white border border-black/15 rounded shadow-lg">
                {[['upper', 'UPPERCASE'], ['lower', 'lowercase'], ['sentence', 'Sentence case']].map(([m, l]) => (
                  <button key={m} type="button" onMouseDown={e => e.preventDefault()} onClick={() => transformCase(m)}
                    className="block w-full text-left text-[12px] px-2.5 py-1.5 cursor-pointer border-none bg-transparent hover:bg-black/[.06]">{l}</button>
                ))}
              </div>
            )}
          </div>

          <button type="button" title="Clear formatting" disabled={locked}
            onMouseDown={e => e.preventDefault()} onClick={clearFormatting} className={tbBtn}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 20H9L4 15a2 2 0 0 1 0-2.8l7.5-7.5a2 2 0 0 1 2.8 0l5.5 5.5a2 2 0 0 1 0 2.8L13 20"/><line x1="6" y1="11" x2="14" y2="19"/>
            </svg>
          </button>

          <div className="w-px h-5 bg-black/15 mx-0.5" />

          <label title={`Text color: ${textColor}`} className="w-8 h-8 flex flex-col items-center justify-center rounded hover:bg-black/10 cursor-pointer relative">
            <span className="text-[12px] font-bold leading-none" style={{ color: textColor }}>A</span>
            <span className="w-4 h-[3px] rounded-full mt-0.5" style={{ backgroundColor: textColor }} />
            <input type="color" disabled={locked} value={textColor}
              onMouseDown={saveSelection}
              onChange={e => { restoreSelection(); exec('foreColor', e.target.value); setTextColor(e.target.value); saveDraft({ textColor: e.target.value }) }}
              className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed" />
          </label>
          <label title={`Highlight: ${hiliteColor}`} className="w-8 h-8 flex items-center justify-center rounded hover:bg-black/10 cursor-pointer relative">
            <svg width="15" height="15" viewBox="0 0 24 24" fill={hiliteColor} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 11l6-6 4 4-6 6z"/><path d="M4 20l4-1 8-8-3-3-8 8z"/>
            </svg>
            <input type="color" disabled={locked} value={hiliteColor}
              onMouseDown={saveSelection}
              onChange={e => { restoreSelection(); exec('hiliteColor', e.target.value); setHiliteColor(e.target.value); saveDraft({ highlightColor: e.target.value }) }}
              className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed" />
          </label>

          <div className="w-px h-5 bg-black/15 mx-0.5" />

          <div ref={fontMenuRef} className="relative">
            <button type="button" disabled={locked}
              onMouseDown={saveSelection} onClick={() => setOpenMenu(v => v === 'font' ? null : 'font')}
              className="text-[11px] border border-black/15 rounded px-1.5 py-1.5 bg-white text-black outline-none cursor-pointer disabled:opacity-30 whitespace-nowrap"
              style={fontFamily ? { fontFamily } : undefined}
            >{fontFamily || 'Font'}</button>
            {openMenu === 'font' && (
              <div onMouseDown={e => e.stopPropagation()} className="absolute z-20 top-full left-1/2 -translate-x-1/2 mt-1 w-40 max-h-[164px] overflow-y-auto bg-white border border-black/15 rounded shadow-lg">
                {RICH_FONT_OPTIONS.map(f => (
                  <button key={f} type="button" onMouseDown={e => e.preventDefault()}
                    onClick={() => { restoreSelection(); exec('fontName', f); setFontFamily(f); saveDraft({ fontFamily: f }); setOpenMenu(null) }}
                    style={{ fontFamily: f }}
                    className={`block w-full text-left text-[12px] px-2.5 py-1.5 cursor-pointer border-none bg-transparent hover:bg-black/[.06] ${fontFamily === f ? 'bg-black/[.06] font-semibold' : ''}`}
                  >{f}</button>
                ))}
              </div>
            )}
          </div>
          <div ref={sizeMenuRef} className="relative">
            <button type="button" disabled={locked}
              onMouseDown={saveSelection} onClick={() => setOpenMenu(v => v === 'size' ? null : 'size')}
              className="text-[11px] border border-black/15 rounded px-1.5 py-1.5 bg-white text-black outline-none cursor-pointer disabled:opacity-30 whitespace-nowrap"
            >{fontSize || 'Size'}</button>
            {openMenu === 'size' && (
              <div onMouseDown={e => e.stopPropagation()} className="absolute z-20 top-full left-1/2 -translate-x-1/2 mt-1 w-20 max-h-[164px] overflow-y-auto bg-white border border-black/15 rounded shadow-lg">
                {RICH_SIZE_OPTIONS.map(s => (
                  <button key={s} type="button" onMouseDown={e => e.preventDefault()}
                    onClick={() => { restoreSelection(); exec('fontSize', s); setFontSize(s); saveDraft({ fontSize: s }); setOpenMenu(null) }}
                    className={`block w-full text-left text-[12px] px-2.5 py-1.5 cursor-pointer border-none bg-transparent hover:bg-black/[.06] ${fontSize === s ? 'bg-black/[.06] font-semibold' : ''}`}
                  >{s}</button>
                ))}
              </div>
            )}
          </div>

          {onHide && (
            <button type="button" onMouseDown={e => e.preventDefault()} onClick={onHide}
              className={`${showTag ? 'ml-1.5' : 'ml-auto'} h-7 px-2 rounded text-[10px] font-bold uppercase tracking-[.06em] text-[#7c3aed] hover:bg-[#7c3aed]/10 border-none bg-transparent cursor-pointer`}
            >Hide</button>
          )}

          {showTag && <span className="ml-auto pl-1.5 text-[9px] font-bold uppercase tracking-[.08em] text-black select-none">Notes</span>}
        </div>

        {/* Notice that this content came from a recovered draft, not what's actually saved —
            silently swapping in different content than the last save, with no indication,
            would be confusing/easy to miss. Stays up for this mount (until Send/Done actually
            commits it, or the editor is closed) rather than trying to guess when it's been
            "seen enough" to hide itself. */}
        {initial.restoredDraft && (
          <div className="px-3.5 py-1.5 bg-[#fff8e6] border-b border-[#f0d98c] text-[10px] font-semibold text-[#8a6d1a]">
            Restored unsaved changes from before
          </div>
        )}

        {/* Editable area */}
        <div
          ref={editorRef}
          contentEditable={!locked}
          suppressContentEditableWarning
          onKeyDown={onEditorKeyDown}
          onInput={onEditorInput}
          onKeyUp={refreshActive}
          onMouseUp={refreshActive}
          onFocus={refreshActive}
          onPaste={handlePaste}
          // Review-in-full-screen for an image already dropped into the note — the fixed
          // 260px insert width (see insertImages) makes for a good compact editing size, but
          // that's too small to actually check a photo for something like texture/damage.
          // preventDefault only fires for an actual image click, so normal cursor placement
          // elsewhere in the note is untouched.
          onClick={e => { if (e.target.tagName === 'IMG') { e.preventDefault(); setLightboxUrl(e.target.src) } }}
          data-rich-placeholder={placeholder}
          className={`rich-note-editable overflow-y-auto px-3.5 py-2.5 text-[13px] text-[#1A1A18] outline-none leading-relaxed [&_img]:cursor-zoom-in ${maximized ? 'flex-1' : 'min-h-[110px] max-h-64'}`}
        />

        {/* Footer: attach / camera / send */}
        <div className="flex items-center gap-2 px-3 py-2 border-t border-black/10 bg-black/[.02]">
          <button type="button" title="Attach image" disabled={locked || uploading}
            onClick={() => { saveSelection(); fileRef.current?.click() }}
            className="text-black hover:text-[#7c3aed] cursor-pointer border-none bg-none flex-shrink-0 transition-colors disabled:opacity-30"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
            </svg>
          </button>
          <button type="button" title="Take a photo" disabled={locked || uploading}
            onClick={() => { saveSelection(); setCamShots(0); setCameraOpen(true) }}
            className="text-black hover:text-[#7c3aed] cursor-pointer border-none bg-none flex-shrink-0 transition-colors disabled:opacity-30"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>
            </svg>
          </button>
          {uploading && <span className="text-[10px] text-black/40">Uploading…</span>}
          <button type="button" onClick={doSend} disabled={locked || sending || !hasContent}
            className="ml-auto w-9 h-9 rounded-full bg-[#7c3aed] text-white flex items-center justify-center cursor-pointer disabled:opacity-30 hover:bg-[#6d28d9] transition-colors"
            title={`${sendLabel} (Ctrl/Cmd+Enter)`}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
      </div>

      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden"
        onChange={e => { insertImages(e.target.files); e.target.value = '' }} />

      {cameraOpen && (
        <CameraCaptureModal onCapture={handleCameraShot} onDone={() => setCameraOpen(false)} shotCount={camShots} />
      )}

      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[2000] bg-black/90 flex items-center justify-center cursor-zoom-out"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxUrl(null)}
            title="Close"
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/10 text-white flex items-center justify-center cursor-pointer border-none hover:bg-white/20 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
          <img
            src={lightboxUrl}
            alt=""
            onClick={e => e.stopPropagation()}
            className="max-w-[92vw] max-h-[92vh] object-contain cursor-default"
          />
        </div>
      )}

      <style>{`
        .rich-note-editable:empty:before { content: attr(data-rich-placeholder); color: rgba(0,0,0,.35); pointer-events: none; }
        .rich-note-editable ul { list-style: disc; padding-left: 1.4em; margin: .25em 0; }
        .rich-note-editable ol { list-style: decimal; padding-left: 1.4em; margin: .25em 0; }
        .rich-note-editable img { max-width: 100%; border-radius: 6px; }
      `}</style>
    </>
  )
}
