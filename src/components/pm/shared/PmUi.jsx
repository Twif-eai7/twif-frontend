import {
  LayoutGrid, Folder, Rocket, Target, Wrench, Package, Factory,
  CircleCheck, Star, ChartColumn, Flame, Search, Plus, X,
} from 'lucide-react'

export const PM_ACCENT = '#4d68f0'
export const ICON_STROKE = 1.75

export const PROJECT_GLYPHS = [
  { key: 'layout',  Icon: LayoutGrid },
  { key: 'folder',  Icon: Folder },
  { key: 'rocket',  Icon: Rocket },
  { key: 'target',  Icon: Target },
  { key: 'wrench',  Icon: Wrench },
  { key: 'package', Icon: Package },
  { key: 'factory', Icon: Factory },
  { key: 'check',   Icon: CircleCheck },
  { key: 'star',    Icon: Star },
  { key: 'chart',   Icon: ChartColumn },
  { key: 'flame',   Icon: Flame },
]

const EMOJI_FALLBACK = {
  '📋': 'layout', '🚀': 'rocket', '🎯': 'target', '🛠️': 'wrench',
  '📦': 'package', '🏭': 'factory', '✅': 'check', '🌟': 'star',
  '📊': 'chart', '🔥': 'flame',
}

export function resolveGlyphKey(value) {
  if (!value) return 'layout'
  if (PROJECT_GLYPHS.some(g => g.key === value)) return value
  return EMOJI_FALLBACK[value] || 'layout'
}

export function glyphIcon(key) {
  return PROJECT_GLYPHS.find(g => g.key === resolveGlyphKey(key))?.Icon || LayoutGrid
}

export function ProjectGlyph({ name, color = PM_ACCENT, size = 28, className = '' }) {
  const Icon = glyphIcon(name)
  const iconSize = Math.max(12, Math.round(size * 0.46))
  return (
    <span
      className={`inline-flex items-center justify-center rounded-md flex-shrink-0 ${className}`}
      style={{ width: size, height: size, backgroundColor: `${color}18`, color }}
    >
      <Icon size={iconSize} strokeWidth={ICON_STROKE} />
    </span>
  )
}

export function PmIcon({ icon: Icon, size = 14, className = '' }) {
  if (!Icon) return null
  return <Icon size={size} strokeWidth={ICON_STROKE} className={className} />
}

export function IconButton({ icon: Icon, title, onClick, className = '', danger = false, size = 14 }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`inline-flex items-center justify-center w-7 h-7 rounded-md text-stone-400 hover:text-stone-800 hover:bg-stone-100 transition-colors ${
        danger ? 'hover:text-red-600 hover:bg-red-50' : ''
      } ${className}`}
    >
      <PmIcon icon={Icon} size={size} />
    </button>
  )
}

export function PmButton({ variant = 'secondary', icon: Icon, children, className = '', ...props }) {
  const base = 'inline-flex items-center justify-center gap-1.5 h-8 px-3 text-[12px] font-medium rounded-md transition-colors disabled:opacity-40 disabled:pointer-events-none'
  const styles = {
    primary: 'bg-[#4d68f0] text-white hover:bg-[#3d56e0]',
    secondary: 'bg-white text-stone-700 border border-stone-200 hover:bg-stone-50 hover:border-stone-300',
    ghost: 'text-stone-500 hover:text-stone-800 hover:bg-stone-100',
    danger: 'text-red-600 hover:bg-red-50',
  }
  return (
    <button type="button" className={`${base} ${styles[variant] || styles.secondary} ${className}`} {...props}>
      {Icon && <PmIcon icon={Icon} size={13} />}
      {children}
    </button>
  )
}

export function SegControl({ options, value, onChange }) {
  return (
    <div className="inline-flex items-center p-0.5 rounded-md bg-stone-100">
      {options.map(opt => {
        const Icon = opt.icon
        const active = value === opt.key
        return (
          <button
            key={opt.key}
            type="button"
            title={opt.label}
            onClick={() => onChange(opt.key)}
            className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded text-[12px] font-medium transition-colors ${
              active ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-700'
            }`}
          >
            {Icon && <PmIcon icon={Icon} size={13} />}
            {opt.showLabel !== false && <span className={opt.hideLabelOnMobile ? 'hidden sm:inline' : ''}>{opt.label}</span>}
          </button>
        )
      })}
    </div>
  )
}

export function FieldLabel({ icon: Icon, children }) {
  return (
    <p className="inline-flex items-center gap-1.5 text-[11px] font-medium text-stone-500">
      {Icon && <PmIcon icon={Icon} size={12} />}
      {children}
    </p>
  )
}

export function PmEmpty({ icon: Icon, title, subtitle, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center gap-2 px-6">
      {Icon && (
        <span className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-stone-100 text-stone-400 mb-1">
          <PmIcon icon={Icon} size={18} />
        </span>
      )}
      <p className="text-sm font-medium text-stone-800">{title}</p>
      {subtitle && <p className="text-xs text-stone-400 max-w-xs">{subtitle}</p>}
      {action}
    </div>
  )
}

export function MenuRow({ icon: Icon, children, onClick, danger = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-2 text-[12px] text-left hover:bg-stone-50 ${
        danger ? 'text-red-600' : 'text-stone-700'
      }`}
    >
      {Icon && <PmIcon icon={Icon} size={13} className={danger ? 'text-red-500' : 'text-stone-400'} />}
      {children}
    </button>
  )
}

export function GlyphPicker({ value, color = PM_ACCENT, onChange }) {
  const selected = resolveGlyphKey(value)
  return (
    <div className="flex flex-wrap gap-1">
      {PROJECT_GLYPHS.map(g => {
        const active = selected === g.key
        return (
          <button
            key={g.key}
            type="button"
            onClick={() => onChange(g.key)}
            className={`w-8 h-8 rounded-md flex items-center justify-center transition-colors ${
              active ? 'ring-1 ring-[#4d68f0] ring-offset-1' : 'hover:bg-stone-50'
            }`}
            style={{ backgroundColor: active ? `${color}18` : undefined, color: active ? color : '#a8a29e' }}
          >
            <g.Icon size={14} strokeWidth={ICON_STROKE} />
          </button>
        )
      })}
    </div>
  )
}

export const inputClass =
  'w-full text-[13px] border border-stone-200 rounded-md px-2.5 py-1.5 outline-none bg-white text-stone-800 placeholder-stone-400 focus:border-[#4d68f0] focus:ring-1 focus:ring-[#4d68f0]/15'

export const selectClass =
  'w-full text-[13px] border border-stone-200 rounded-md px-2.5 py-1.5 outline-none bg-white text-stone-800 focus:border-[#4d68f0] focus:ring-1 focus:ring-[#4d68f0]/15'

export const modalShell =
  'bg-white rounded-lg shadow-xl border border-stone-200 w-full max-w-md'

export { Search, Plus, X }
