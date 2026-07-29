export default function LogoMark({ size = 30, dark = true }) {
  const pad = size * 0.14
  const inner = size - pad * 2

  // Original asset colours on white — used on dark chrome (e.g. PCT top bar).
  if (!dark) {
    return (
      <div
        style={{ width: size, height: size, borderRadius: size * 0.23 }}
        className="flex shrink-0 items-center justify-center overflow-hidden bg-white shadow-[0_1px_2px_rgba(0,0,0,0.12)]"
      >
        <img
          src="/jng.jpg"
          alt=""
          className="object-contain"
          style={{ maxWidth: inner, maxHeight: inner }}
        />
      </div>
    )
  }

  return (
    <div
      style={{ width: size, height: size, borderRadius: size * 0.23 }}
      className="flex items-center justify-center shrink-0 overflow-hidden ring-1 bg-white ring-stone-200"
    >
      <img
        src="/jng.jpg"
        alt=""
        width={Math.round(inner)}
        height={Math.round(inner)}
        className="object-contain"
        style={{ maxWidth: inner, maxHeight: inner }}
      />
    </div>
  )
}
