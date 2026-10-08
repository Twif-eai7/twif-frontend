function initials(name) {
  if (!name) return '?'
  return name.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

const AVATAR_COLORS = [
  'bg-blue-500', 'bg-violet-500', 'bg-emerald-500', 'bg-amber-500',
  'bg-rose-500',  'bg-cyan-500',   'bg-fuchsia-500', 'bg-teal-500',
]

function colorFor(str) {
  if (!str) return AVATAR_COLORS[0]
  let h = 0
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]
}

/** Single avatar */
export function MemberAvatar({ member, size = 'sm', className = '' }) {
  const name = member?.full_name || member?.organization_members?.full_name || member?.email || ''
  const email = member?.email || member?.organization_members?.email || ''
  const abbr = initials(name || email)
  const color = colorFor(email || name)

  const sizeClass = {
    xs: 'w-5 h-5 text-[9px]',
    sm: 'w-6 h-6 text-[10px]',
    md: 'w-8 h-8 text-xs',
    lg: 'w-10 h-10 text-sm',
  }[size] || 'w-6 h-6 text-[10px]'

  return (
    <span
      title={name || email}
      className={`inline-flex items-center justify-center rounded-full font-bold text-white flex-shrink-0 ${color} ${sizeClass} ${className}`}
    >
      {abbr}
    </span>
  )
}

/** Stacked group of avatars with +N overflow */
export function MemberAvatarGroup({ members = [], max = 3, size = 'sm' }) {
  const shown = members.slice(0, max)
  const overflow = members.length - max

  return (
    <div className="flex items-center -space-x-1.5">
      {shown.map((m, i) => (
        <MemberAvatar key={m.member_id || m.id || i} member={m?.organization_members || m} size={size} className="ring-1 ring-white" />
      ))}
      {overflow > 0 && (
        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-stone-200 text-stone-600 text-[10px] font-bold ring-1 ring-white">
          +{overflow}
        </span>
      )}
    </div>
  )
}
