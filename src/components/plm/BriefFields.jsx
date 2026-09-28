import { useState, useRef, useLayoutEffect } from 'react'

// Field-row icons + BriefRow — extracted out of WorkspaceModal.jsx so the exact same
// components can be reused read-only on the public guest page (PLMGuestChatPage.jsx),
// guaranteeing pixel-identical rendering instead of a hand-recreated approximation.
export const IconMaterial  = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="gray" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
export const IconFinish    = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="gray" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 12h8M12 8v8"/></svg>
export const IconDimension = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="gray" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 9h18M9 3v18"/></svg>
export const IconPrice     = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="gray" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
// Matches the currency options in the buyer brief's Target Price field (USD/GBP/EUR). Not
// exported (kept local to this file) — a file under react-refresh's "only export components"
// rule can't also export a plain constant; WorkspaceModal.jsx keeps its own copy.
const CURRENCY_SYMBOLS = { USD: '$', GBP: '£', EUR: '€' }
// Renders the actual currency symbol (£/€/$) instead of always showing a fixed dollar-sign
// icon — Price/Target Price/Approved Price all used the same IconPrice glyph regardless of
// which currency was actually selected, which read as a bug the first time a GBP/EUR SKU
// showed a $ icon next to a £/€ value. Falls back to IconPrice's own dollar glyph for USD (or
// anything unrecognized) so the default look is unchanged.
export const IconCurrency  = ({ currency }) => {
  const symbol = CURRENCY_SYMBOLS[currency] || '$'
  if (symbol === '$') return <IconPrice />
  return (
    <span
      className="inline-flex items-center justify-center text-gray-500 font-semibold leading-none"
      style={{ width: 13, height: 13, fontSize: 12 }}
      aria-hidden="true"
    >
      {symbol}
    </span>
  )
}
export const IconQty       = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="gray" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="1"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>
// Distinct from IconQty (box icon, used elsewhere e.g. Sample Findings) — a stack-of-units
// icon for the Buyer Brief's Unit Qty / Approved Qty rows, so they read as "how many units"
// rather than "one package," and no longer look identical to Weight's old box icon.
export const IconUnits     = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="gray" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
// Distinct from IconQty (box icon, used for Unit/Approved Qty) — a scale/weight icon, since
// Weight previously reused IconQty and looked identical to the quantity fields in the same panel.
export const IconWeight    = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="gray" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="5" r="2.5"/><path d="M8.5 7h7l3 12h-13l3-12z"/></svg>
export const IconNotes     = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="gray" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
export const IconShip      = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="gray" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 20h20M4 20l1.5-8h13L20 20M9 12V6h6v6M6 12h12"/></svg>
export const IconCalendar  = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="gray" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>

// valueUppercase: display-only text-transform on the field's VALUE (not the underlying stored
// data, which is untouched) — separate from `uppercase`, which has only ever controlled the
// LABEL's case. Off by default so this doesn't silently reshape every existing BriefRow caller.
export function BriefRow({ icon, label, brief, field, setBrief, placeholder, readOnly = false, multiline = false, hasError = false, onClearError, type = 'text', step, after, uppercase = true, valueUppercase = false }) {
  const [editing, setEditing] = useState(false)
  const afterRef = useRef(null)
  const textareaRef = useRef(null)
  const val = brief[field] || ''
  const handleChange = (v) => { setBrief(b => ({ ...b, [field]: v })); if (onClearError) onClearError(field) }

  // Auto-grow the multiline textarea to fit its content so text never gets
  // scroll-cropped inside a fixed-height box while editing.
  useLayoutEffect(() => {
    if (multiline && editing && textareaRef.current) {
      const el = textareaRef.current
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight}px`
    }
  }, [multiline, editing, val])

  return (
    <div
      className={`flex items-start gap-2 px-2 py-1.5 rounded-md group transition-colors
        ${!readOnly ? 'hover:bg-black/[.04] cursor-pointer' : ''}
        ${hasError ? 'bg-red-50/60' : ''}`}
      onClick={() => !readOnly && !editing && setEditing(true)}
    >
      <div className="flex items-center gap-2 w-[162px] flex-shrink-0 pt-0.5">
        <span className={hasError ? 'text-red-400' : 'text-black'} style={{flexShrink:0}}>{icon}</span>
        <span className={`text-[12px] font-bold truncate ${uppercase ? 'uppercase' : ''} ${hasError ? 'text-red-500' : 'text-black'}`}>{label}</span>
        {hasError && <span className="w-1 h-1 rounded-full bg-red-400 flex-shrink-0" />}
      </div>
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {/* Numeric fields render as a live input at all times (not gated behind the
            click-to-edit toggle text fields use) so their increase/decrease spinner is
            visible and usable immediately, matching every other numeric field in the
            workspace — without this, a plain "12"/"2" span never showed a spinner at all
            until clicked into first. */}
        {(editing || type === 'number') && !readOnly ? (
          multiline ? (
            <textarea
              ref={textareaRef}
              autoFocus
              value={val}
              onChange={e => handleChange(e.target.value)}
              onBlur={e => { if (afterRef.current?.contains(e.relatedTarget)) return; setEditing(false) }}
              className={`flex-1 w-full min-w-0 text-[13px] text-[#1A1A18] bg-transparent outline-none resize-none leading-relaxed overflow-hidden min-h-[60px] ${valueUppercase ? 'uppercase placeholder:normal-case' : ''}`}
              rows={3}
            />
          ) : (
            <input
              autoFocus={editing}
              type={type}
              step={type === 'number' ? (step ?? '0.1') : undefined}
              min={type === 'number' ? '0' : undefined}
              value={val}
              onChange={e => handleChange(e.target.value)}
              onBlur={e => { if (afterRef.current?.contains(e.relatedTarget)) return; setEditing(false) }}
              onKeyDown={e => e.key === 'Enter' && setEditing(false)}
              // Width in `ch` (≈ one digit's width) for the digits themselves, PLUS a fixed
              // pixel allowance via calc() for the spinner/border/padding — the browser's native
              // spinner buttons have a fixed pixel width (~18-20px) that doesn't scale with font
              // size at all, so sizing that part in `ch` (as a first attempt did) under-reserved
              // it and actually clipped the digits themselves out of view. calc() mixes both
              // correctly: exact character width for content, real pixels for the chrome around it.
              // maxWidth is a hard backstop — without it, pasting/spamming a long run of digits
              // grows the box without limit and blows out the whole row's layout; beyond this
              // cap the box just scrolls internally (nothing typed is lost) instead of growing.
              style={type === 'number' ? { width: `calc(${Math.max(2, String(val).length)}ch + 26px)`, maxWidth: '110px' } : undefined}
              className={`min-w-0 text-[13px] text-[#1A1A18] outline-none ${type === 'number'
                ? 'flex-shrink-0 spinner-always-visible bg-white border border-black/20 rounded px-0.5 py-0.5 focus:border-black'
                : `flex-1 w-full bg-transparent ${valueUppercase ? 'uppercase placeholder:normal-case' : ''}`}`}
            />
          )
        ) : (
          <span className={`text-[13px] ${after ? 'min-w-[40px] flex-shrink-0 whitespace-nowrap' : 'flex-1'} ${val ? 'text-[#1A1A18]' : 'text-black'} ${valueUppercase && val ? 'uppercase' : ''}`}>
            {val || placeholder}
          </span>
        )}
        {after && <div ref={afterRef} className="flex-1 flex-shrink-0" onClick={e => e.stopPropagation()}>{after}</div>}
      </div>
    </div>
  )
}
