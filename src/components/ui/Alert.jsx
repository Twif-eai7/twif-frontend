const styles = {
  error:   'bg-red-50   border-red-200   text-red-700',
  success: 'bg-green-50 border-green-200 text-green-700',
  info:    'bg-blue-50  border-blue-200  text-blue-700',
  warning: 'bg-amber-50 border-amber-200 text-amber-700',
}

/**
 * @param {'error'|'success'|'info'|'warning'} type
 */
export function Alert({ type = 'error', children, className = '' }) {
  return (
    <div
      className={`
        px-4 py-3 rounded-xl border text-sm leading-relaxed mb-4
        ${styles[type]} ${className}
      `}
    >
      {children}
    </div>
  )
}