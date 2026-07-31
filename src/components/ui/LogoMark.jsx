// Placeholder brand mark — drop the real Twif logo image into /public and swap
// the <span> below for an <img src="/logo.png" ... /> once it's ready.
export default function LogoMark({ size = 30, dark = true }) {
  const pad = size * 0.14
  const inner = size - pad * 2
  const fontSize = Math.max(10, Math.round(inner * 0.55))

  const mark = (
    <span
      className="font-bold text-white select-none"
      style={{ fontSize, lineHeight: 1, fontFamily: 'Georgia, serif' }}
    >
      T
    </span>
  )

  // Original asset colours on white — used on dark chrome (e.g. PCT top bar).
  if (!dark) {
    return (
      <div
        style={{ width: size, height: size, borderRadius: size * 0.23 }}
        className="flex shrink-0 items-center justify-center overflow-hidden bg-gradient-to-br from-[#7e14ff] to-[#47bfff] shadow-[0_1px_2px_rgba(0,0,0,0.12)]"
      >
        {mark}
      </div>
    )
  }

  return (
    <div
      style={{ width: size, height: size, borderRadius: size * 0.23 }}
      className="flex items-center justify-center shrink-0 overflow-hidden ring-1 bg-gradient-to-br from-[#7e14ff] to-[#47bfff] ring-stone-200"
    >
      {mark}
    </div>
  )
}
