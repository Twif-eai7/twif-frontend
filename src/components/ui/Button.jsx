import { Spinner } from './Spinner'

const variants = {
  primary:
    'text-white bg-stone-900 hover:bg-stone-800 hover:-translate-y-px hover:shadow-md active:translate-y-0',
  secondary:
    'text-stone-700 bg-white border border-stone-300 hover:bg-stone-50 hover:border-stone-400',
  ghost:
    'text-stone-500 bg-transparent hover:text-stone-800 hover:bg-stone-100',
}

/**
 * @param {'primary'|'secondary'|'ghost'} variant
 * @param {boolean} loading  - shows spinner + disables
 * @param {boolean} fullWidth
 */
export function Button({
  children,
  variant = 'primary',
  loading = false,
  fullWidth = false,
  className = '',
  disabled,
  ...props
}) {
  return (
    <button
      {...props}
      disabled={loading || disabled}
      className={`
        flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl
        text-sm font-medium transition-all duration-150 cursor-pointer
        disabled:opacity-50 disabled:pointer-events-none
        ${variants[variant]}
        ${fullWidth ? 'w-full' : ''}
        ${className}
      `}
    >
      {loading && <Spinner light={variant === 'primary'} />}
      {children}
    </button>
  )
}