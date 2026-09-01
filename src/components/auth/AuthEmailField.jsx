function UserIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

export default function AuthEmailField({
  value,
  onChange,
  placeholder = 'Email or ID',
  autoFocus = false,
  disabled = false,
}) {
  return (
    <div className="relative">
      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#94a3b8] pointer-events-none">
        <UserIcon />
      </span>
      <input
        type="email"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete="email"
        autoFocus={autoFocus}
        disabled={disabled}
        className="w-full pl-11 pr-4 py-3.5 rounded-xl bg-[#f1f5f9] border border-transparent text-sm text-[#0f172a] placeholder:text-[#94a3b8] outline-none transition-all focus:bg-white focus:border-[#c7d2fe] focus:ring-2 focus:ring-[#4d68f0]/15 disabled:opacity-60"
      />
    </div>
  )
}
