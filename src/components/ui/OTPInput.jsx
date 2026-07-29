import { useEffect, useRef, useState } from 'react'

/**
 * Multi-box OTP input.
 * Calls onComplete(code) when all digits are entered.
 * Supports paste of full OTP.
 */
export function OTPInput({ length = 6, onComplete, hasError = false, disabled = false }) {
  const [vals, setVals] = useState(() => Array(length).fill(''))
  const refs = useRef([])

  useEffect(() => {
    // Keep local state aligned with requested OTP length (important after HMR/prop changes).
    setVals(prev => {
      const next = Array(length).fill('')
      for (let i = 0; i < Math.min(prev.length, length); i += 1) next[i] = prev[i]
      return next
    })
    refs.current = Array.from({ length }, (_, i) => refs.current[i] || null)
  }, [length])

  function handleChange(i, e) {
    const v = e.target.value.replace(/\D/g, '').slice(-1)
    const next = [...vals]
    next[i] = v
    setVals(next)

    if (v && i < length - 1) refs.current[i + 1]?.focus()

    const full = next.join('')
    if (full.length === length) onComplete(full)
  }

  function handleKeyDown(i, e) {
    if (e.key === 'Backspace' && !vals[i] && i > 0) {
      const next = [...vals]
      next[i - 1] = ''
      setVals(next)
      refs.current[i - 1]?.focus()
    }
  }

  function handlePaste(e) {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length)
    if (pasted.length === length) {
      e.preventDefault()
      setVals(pasted.split(''))
      refs.current[length - 1]?.focus()
      onComplete(pasted)
    }
  }

  return (
    <div className="my-5 w-full px-1">
      <div
        className="mx-auto grid w-full max-w-md gap-2 sm:gap-2.5"
        style={{ gridTemplateColumns: `repeat(${length}, minmax(0, 1fr))` }}
      >
        {vals.map((v, i) => (
          <input
            key={i}
            ref={el => { refs.current[i] = el }}
            type="text"
            inputMode="numeric"
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            disabled={disabled}
            maxLength={1}
            value={v}
            onChange={e => handleChange(i, e)}
            onKeyDown={e => handleKeyDown(i, e)}
            onPaste={handlePaste}
            className={`
              w-full min-w-0 aspect-5/6 text-center text-lg sm:text-xl font-semibold border rounded-xl
              outline-none transition-all duration-150 caret-transparent
              ${hasError
                ? 'border-red-400 bg-red-50 text-red-700'
                : v
                  ? 'border-stone-900 bg-stone-50 text-stone-900'
                  : 'border-stone-300 bg-white text-stone-900 focus:border-stone-900 focus:ring-2 focus:ring-stone-900/8'
              }
              ${disabled ? 'opacity-70 cursor-not-allowed' : ''}
            `}
          />
        ))}
      </div>
    </div>
  )
}