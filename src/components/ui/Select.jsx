const chevron = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='%236b7280' viewBox='0 0 16 16'%3E%3Cpath d='M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z'/%3E%3C/svg%3E")`

/**
 * Labelled select with custom chevron.
 */
export function Select({
  label,
  required,
  children,
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

      <select
        {...props}
        className={`
          w-full px-3.5 py-2.5 border border-stone-300 rounded-xl
          text-sm text-stone-900 bg-white appearance-none cursor-pointer
          outline-none transition-all duration-150
          focus:border-stone-900 focus:ring-2 focus:ring-stone-900/8
          ${className}
        `}
        style={{
          backgroundImage: chevron,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 12px center',
          paddingRight: '2.5rem',
        }}
      >
        {children}
      </select>
    </div>
  )
}