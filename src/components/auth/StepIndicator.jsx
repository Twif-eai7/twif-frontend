/**
 * Linear step progress indicator.
 * @param {string[]} steps  - labels (used for count only)
 * @param {number}   current - 0-indexed active step
 */
export default function StepIndicator({ steps, current }) {
  return (
    <div className="flex items-center mb-7">
      {steps.map((_, i) => (
        <div key={i} className="flex items-center flex-1 last:flex-none">
          {/* Dot */}
          <div
            className={`
              w-7 h-7 rounded-full flex items-center justify-center
              text-xs font-semibold flex-shrink-0 transition-all duration-300
              ${i < current
                ? 'bg-stone-900 text-white'
                : i === current
                  ? 'bg-stone-900 text-white ring-4 ring-stone-900/10'
                  : 'bg-stone-100 text-stone-400'}
            `}
          >
            {i < current ? (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path
                  d="M2 6l3 3 5-5"
                  stroke="white"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              i + 1
            )}
          </div>

          {/* Connector line */}
          {i < steps.length - 1 && (
            <div
              className={`
                flex-1 h-px mx-2 transition-colors duration-300
                ${i < current ? 'bg-stone-900' : 'bg-stone-200'}
              `}
            />
          )}
        </div>
      ))}
    </div>
  )
}