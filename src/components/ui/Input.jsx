/**
 * Labelled text input with optional hint and inline error.
 */
export function Input({
  label,
  required,
  hint,
  error,
  className = '',
  wrapperClassName = '',
  ...props
}) {
  return (
    <div className={`mb-4 ${wrapperClassName}`}>
      {label && (
        <label className="block text-sm font-medium text-stone-700 mb-1.5">
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}

      <input
        {...props}
        className={`
          w-full px-3.5 py-2.5 border rounded-xl text-sm text-stone-900 bg-white
          outline-none transition-all duration-150 placeholder:text-stone-400
          focus:border-stone-900 focus:ring-2 focus:ring-stone-900/8
          ${error ? 'border-red-400 bg-red-50 focus:border-red-500 focus:ring-red-500/10' : 'border-stone-300'}
          ${className}
        `}
      />

      {hint && !error && (
        <p className="mt-1.5 text-xs text-stone-400">{hint}</p>
      )}
      {error && (
        <p className="mt-1.5 text-xs text-red-600">{error}</p>
      )}
    </div>
  )
}