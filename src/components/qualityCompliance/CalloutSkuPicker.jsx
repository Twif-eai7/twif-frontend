// Small checkbox used for SKU selection: RepositoryPoDrawer.jsx's own table rows, and
// CalloutModal.jsx's in-modal SKUs drawer. Kept as its own file (not moved into either) since
// both are otherwise unrelated components.
export function SkuCheckbox({ checked, onToggle, label }) {
  return (
    <span
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      tabIndex={0}
      onClick={(e) => { e.stopPropagation(); onToggle() }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onToggle() } }}
      className={`w-3.5 h-3.5 rounded flex-shrink-0 flex items-center justify-center border cursor-pointer transition-colors
        ${checked ? 'bg-gray-900 border-gray-900' : 'bg-white border-gray-300 hover:border-gray-500'}`}
    >
      {checked && (
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5">
          <polyline points="4 12 9 18 20 6" />
        </svg>
      )}
    </span>
  )
}
