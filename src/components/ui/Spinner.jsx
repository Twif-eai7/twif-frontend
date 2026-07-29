/**
 * @param {boolean} light - white spinner (on dark bg) vs dark spinner (on light bg)
 * @param {string}  size  - tailwind size class e.g. 'w-4 h-4'
 */
export function Spinner({ light = true, size = 'w-4 h-4' }) {
  return (
    <div
      className={`
        ${size} rounded-full border-2 animate-spin flex-shrink-0
        ${light
          ? 'border-white/30 border-t-white'
          : 'border-stone-200 border-t-stone-800'}
      `}
    />
  )
}