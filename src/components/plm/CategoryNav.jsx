import { useState, useMemo } from 'react'
import { usePlmStore, getCategoryDescendantIds } from '../../stores/plmStore'

const IC = 'w-3.5 h-3.5 flex-shrink-0'
const S  = { fill: 'none', stroke: 'currentColor', strokeWidth: '1.3', strokeLinejoin: 'round', strokeLinecap: 'round' }

function AllIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <rect x="1.5" y="1.5" width="5.5" height="5.5"/><rect x="9" y="1.5" width="5.5" height="5.5"/>
      <rect x="1.5" y="9" width="5.5" height="5.5"/><rect x="9" y="9" width="5.5" height="5.5"/>
    </svg>
  )
}
function ApparelIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M6 2 L3 4 L1 7 L4.5 7 L4.5 14 L11.5 14 L11.5 7 L15 7 L13 4 L10 2 Q8 4 6 2Z"/>
    </svg>
  )
}
function HardgoodsIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M8 1.5 L14.5 4.5 L14.5 11.5 L8 14.5 L1.5 11.5 L1.5 4.5 Z"/>
      <path d="M8 1.5 L8 8.5"/>
      <path d="M1.5 4.5 L8 8.5 L14.5 4.5"/>
    </svg>
  )
}
function AccessoriesIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M2 2 L8.5 2 L14 7.5 L9 13.5 L3 7.5 Z"/>
      <circle cx="6.5" cy="5" r="1" fill="currentColor" stroke="none"/>
    </svg>
  )
}
function CandleIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M8 4 C7 3 6.5 2 8 1 C9.5 2 9 3 8 4Z" fill="currentColor" stroke="none"/>
      <rect x="5.5" y="4" width="5" height="9.5" rx="0.5"/>
      <path d="M3.5 13.5 L12.5 13.5"/>
    </svg>
  )
}
function DecorativeIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M6 1.5 L10 1.5 L12.5 8 L11 14.5 L5 14.5 L3.5 8 Z"/>
      <path d="M3.7 8 L12.3 8"/>
      <path d="M6.5 1.5 L5 5.5"/><path d="M9.5 1.5 L11 5.5"/>
    </svg>
  )
}
function OrnamentIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <circle cx="8" cy="10" r="4.5"/>
      <path d="M8 5.5 L8 3"/>
      <path d="M6 3 L10 3"/>
      <path d="M6 8.5 Q8 7 10 8.5"/>
    </svg>
  )
}
function FurnitureIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <rect x="2" y="8" width="12" height="4"/>
      <rect x="1" y="6" width="2.5" height="6"/>
      <rect x="12.5" y="6" width="2.5" height="6"/>
      <rect x="3.5" y="5" width="9" height="3"/>
      <path d="M4.5 12 L4.5 14 M11.5 12 L11.5 14"/>
    </svg>
  )
}
function SeatingIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M4 3 L4 8 L12 8 L12 3"/>
      <rect x="3" y="8" width="10" height="2.5"/>
      <path d="M4 10.5 L4 14 M12 10.5 L12 14"/>
      <path d="M3 3 L13 3"/>
    </svg>
  )
}
function ArmchairIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <rect x="4" y="4" width="8" height="5"/>
      <rect x="3" y="8" width="10" height="3"/>
      <path d="M2 7 L2 11 L4 11"/>
      <path d="M14 7 L14 11 L12 11"/>
      <path d="M5 11 L5 14 M11 11 L11 14"/>
    </svg>
  )
}
function KitchenIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M5 2 L5 14"/>
      <path d="M3.5 2 L3.5 6"/>
      <path d="M6.5 2 L6.5 6"/>
      <path d="M3.5 6 Q3.5 8 5 8 Q6.5 8 6.5 6"/>
      <path d="M11 2 C11 2 13.5 2 13.5 5 C13.5 7 12 8 12 8 L12 14"/>
    </svg>
  )
}
function LightingIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M5.5 10 C4 8.8 3 7.2 3 5.5 A5 5 0 0 1 13 5.5 C13 7.2 12 8.8 10.5 10 Z"/>
      <path d="M6 11.5 L10 11.5"/>
      <path d="M6.5 13 L9.5 13"/>
    </svg>
  )
}
function FloorLampIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M5 6 L11 6 L8 2 Z"/>
      <path d="M8 6 L8 13.5"/>
      <path d="M5 13.5 L11 13.5"/>
    </svg>
  )
}
function TableLampIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M5.5 2 L10.5 2 L12.5 8 L3.5 8 Z"/>
      <path d="M8 8 L8 13"/>
      <path d="M5 13 L11 13"/>
    </svg>
  )
}
function TextilesIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <rect x="3" y="4.5" width="10" height="7"/>
      <ellipse cx="3" cy="8" rx="1.5" ry="3.5"/>
      <ellipse cx="13" cy="8" rx="1.5" ry="3.5"/>
    </svg>
  )
}
function RugIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <rect x="4" y="1.5" width="8" height="13" rx="1"/>
      <path d="M4 4.5 L12 4.5 M4 8 L12 8 M4 11.5 L12 11.5"/>
      <path d="M6.5 1.5 L6.5 14.5 M9.5 1.5 L9.5 14.5"/>
    </svg>
  )
}
function MirrorIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <ellipse cx="8" cy="7" rx="4.5" ry="5.5"/>
      <path d="M8 12.5 L8 15"/>
      <path d="M5.5 15 L10.5 15"/>
    </svg>
  )
}
function ArtIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <rect x="2" y="2" width="12" height="12" rx="0.5"/>
      <path d="M2 10 L5 7 L8 9.5 L11 6 L14 10"/>
      <circle cx="5.5" cy="5.5" r="1.5"/>
    </svg>
  )
}
function PillowIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <rect x="1.5" y="4" width="13" height="8" rx="3"/>
      <path d="M5 8 Q8 6 11 8 Q8 10 5 8Z"/>
    </svg>
  )
}
function ThrowsIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <rect x="2" y="4.5" width="12" height="7" rx="0.5"/>
      <path d="M4 4.5 L4 2.5 M7 4.5 L7 2.5 M10 4.5 L10 2.5 M13 4.5 L13 2.5"/>
      <path d="M4 11.5 L4 13.5 M7 11.5 L7 13.5 M10 11.5 L10 13.5 M13 11.5 L13 13.5"/>
    </svg>
  )
}
function OutdoorIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M8 1.5 L14.5 10 L1.5 10 Z"/>
      <rect x="6.5" y="10" width="3" height="4.5"/>
      <path d="M3 14.5 L13 14.5"/>
    </svg>
  )
}
function BeddingIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <rect x="1.5" y="6" width="13" height="7.5" rx="1"/>
      <path d="M1.5 9 L14.5 9"/>
      <rect x="3" y="3" width="4" height="3" rx="0.5"/>
      <rect x="9" y="3" width="4" height="3" rx="0.5"/>
    </svg>
  )
}
function StorageIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <rect x="2" y="2" width="12" height="5"/>
      <rect x="2" y="7" width="12" height="5"/>
      <path d="M7 4.5 L9 4.5 M7 9.5 L9 9.5"/>
      <path d="M3 12 L3 14.5 M13 12 L13 14.5"/>
    </svg>
  )
}
function SoftFurnishingIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M2 2 C4 5 4 9 2 14"/>
      <path d="M14 2 C12 5 12 9 14 14"/>
      <path d="M2 2 L14 2"/>
      <path d="M2 14 L14 14"/>
      <path d="M8 2 C6 5 6 9 8 14"/>
    </svg>
  )
}
function WallDecorIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <rect x="2" y="3" width="12" height="9" rx="0.5"/>
      <path d="M5 3 L5 12 M11 3 L11 12"/>
      <path d="M2 7 L14 7"/>
    </svg>
  )
}
function JewelleryIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <polygon points="2.5,6.5 5,2 11,2 13.5,6.5 8,14.5"/>
      <path d="M2.5 6.5 L13.5 6.5"/>
      <path d="M5 2 L6.5 6.5 M11 2 L9.5 6.5"/>
    </svg>
  )
}
function RingsIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <ellipse cx="8" cy="6.5" rx="5.5" ry="2.5"/>
      <path d="M2.5 6.5 L2.5 9.5 C2.5 10.9 4.9 12 8 12 C11.1 12 13.5 10.9 13.5 9.5 L13.5 6.5"/>
    </svg>
  )
}
function NecklaceIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M2 2.5 C3 6 5 8.5 8 9.5 C11 8.5 13 6 14 2.5"/>
      <path d="M6.5 9 L8 13 L9.5 9"/>
    </svg>
  )
}
function BraceletIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <ellipse cx="8" cy="5" rx="5" ry="2"/>
      <path d="M3 5 L3 10 C3 11.7 5.2 13 8 13 C10.8 13 13 11.7 13 10 L13 5"/>
    </svg>
  )
}
function EarringsIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <circle cx="5.5" cy="3.5" r="1.2"/>
      <path d="M5.5 4.7 L5.5 9"/>
      <path d="M3.5 9 Q5.5 12.5 7.5 9 Z"/>
      <circle cx="10.5" cy="3.5" r="1.2"/>
      <path d="M10.5 4.7 L10.5 9"/>
      <path d="M8.5 9 Q10.5 12.5 12.5 9 Z"/>
    </svg>
  )
}

function getCategoryIcon(name) {
  const n = name.toLowerCase()
  if (n.includes('candle'))                                         return <CandleIcon />
  if (n.includes('ornament'))                                       return <OrnamentIcon />
  if (n.includes('decorative'))                                     return <DecorativeIcon />
  if (n.includes('wall'))                                           return <WallDecorIcon />
  if (n.includes('mirror'))                                         return <MirrorIcon />
  if (n.includes('art') && !n.includes('artificial'))              return <ArtIcon />
  if (n.includes('floor') && n.includes('lamp'))                   return <FloorLampIcon />
  if (n.includes('table') && n.includes('lamp'))                   return <TableLampIcon />
  if (n.includes('lamp') || n.includes('lighting'))                return <LightingIcon />
  if (n.includes('accessori'))                                     return <AccessoriesIcon />
  if (n.includes('apparel') || n.includes('clothing'))             return <ApparelIcon />
  if (n.includes('hardgood') || n.includes('hard good'))          return <HardgoodsIcon />
  if (n.includes('arm'))                                           return <ArmchairIcon />
  if (n.includes('seating') || n.includes('chair'))               return <SeatingIcon />
  if (n.includes('sofa') || n.includes('couch'))                  return <SeatingIcon />
  if (n.includes('outdoor') || n.includes('garden') || n.includes('patio')) return <OutdoorIcon />
  if (n.includes('furniture'))                                     return <FurnitureIcon />
  if (n.includes('kitchen') || n.includes('dining'))              return <KitchenIcon />
  if (n.includes('storage') || n.includes('cabinet') || n.includes('shelf')) return <StorageIcon />
  if (n.includes('bedding') || n.includes('bed'))                 return <BeddingIcon />
  if (n.includes('throw'))                                         return <ThrowsIcon />
  if (n.includes('pillow') || n.includes('cushion'))              return <PillowIcon />
  if (n.includes('rug'))                                           return <RugIcon />
  if (n.includes('soft furnish') || n.includes('soft-furnish'))             return <SoftFurnishingIcon />
  if (n.includes('textile') || n.includes('fabric') || n.includes('linen')) return <TextilesIcon />
  if (n.includes('earring'))                                                return <EarringsIcon />
  if (n.includes('ring'))                                                   return <RingsIcon />
  if (n.includes('necklace') || n.includes('chain') || n.includes('pendant')) return <NecklaceIcon />
  if (n.includes('bracelet') || n.includes('bangle'))                       return <BraceletIcon />
  if (n.includes('jewel') || n.includes('jewelry'))                         return <JewelleryIcon />
  return null
}

export default function CategoryNav({ skus }) {
  const categories = usePlmStore(s => s.categories)
  const category   = usePlmStore(s => s.filters.category)
  const setFilter  = usePlmStore(s => s.setFilter)
  const collapsed  = usePlmStore(s => s.sidebarCollapsed)

  const [expanded, setExpanded] = useState(() => new Set())

  const toggle = (id, e) => {
    e.stopPropagation()
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const countMap = useMemo(() => {
    const map = {}
    categories.forEach(c => {
      const ids = getCategoryDescendantIds(categories, c.id)
      map[c.id] = skus.filter(s => s.category_id && ids.has(s.category_id)).length
    })
    return map
  }, [categories, skus])

  const childrenOf = (parentId) =>
    categories.filter(c => c.parent_id === parentId && (countMap[c.id] || 0) > 0)

  const renderNode = (node, depth) => {
    const count    = countMap[node.id] || 0
    const children = childrenOf(node.id)
    const hasKids  = children.length > 0
    const isOpen   = expanded.has(node.id)
    const isActive = category === node.id
    const icon     = getCategoryIcon(node.name)

    return (
      <div key={node.id}>
        <button
          type="button"
          title={node.name}
          onClick={() => { setFilter('category', node.id); if (hasKids && !collapsed) toggle(node.id, { stopPropagation: () => {} }) }}
          style={collapsed ? { paddingLeft: '12px', paddingRight: '12px' } : { paddingLeft: `${12 + depth * 10}px`, paddingRight: '12px' }}
          className={`flex items-center gap-1.5 py-2 w-full text-left text-[10px] font-bold uppercase tracking-[.06em] transition-all cursor-pointer border-l-2 whitespace-nowrap
            ${collapsed ? 'justify-center' : ''}
            ${isActive ? 'border-[#1A1A18] text-[#1A1A18] bg-black/5' : 'border-transparent text-[#1A1A18]/70 hover:bg-black/[.04] hover:text-[#1A1A18]'}`}
        >
          {icon && (
            <span className={`flex-shrink-0 transition-opacity ${isActive ? 'opacity-90' : 'opacity-40'}`}>
              {icon}
            </span>
          )}
          {!collapsed && <span className="flex-1 leading-tight">{node.name}</span>}
          {!collapsed && (
            <span className={`text-[9px] font-semibold tabular-nums flex-shrink-0 ${isActive ? 'text-[#1A1A18]' : 'text-black/30'}`}>
              {count}
            </span>
          )}
        </button>
        {isOpen && !collapsed && children.map(child => renderNode(child, depth + 1))}
      </div>
    )
  }

  const rootNodes = categories.filter(c => !c.parent_id && (countMap[c.id] || 0) > 0)
  const allActive = category === 'all'

  return (
    <nav className="flex flex-col gap-px">
      <button
        type="button"
        title="All Products"
        onClick={() => setFilter('category', 'all')}
        className={`flex items-center gap-1.5 py-2.5 border-l-2 text-[10px] font-bold uppercase tracking-[.06em] transition-all cursor-pointer w-full text-left
          ${collapsed ? 'justify-center px-3' : 'px-3'}
          ${allActive ? 'border-[#1A1A18] text-[#1A1A18] bg-black/5' : 'border-transparent text-[#1A1A18] hover:bg-black/[.04]'}`}
      >
        <span className={`flex-shrink-0 ${allActive ? 'opacity-100' : 'opacity-55'}`}>
          <AllIcon />
        </span>
        {!collapsed && <span className="flex-1">All Products</span>}
        {!collapsed && (
          <span className={`text-[10px] font-semibold tabular-nums ${allActive ? 'text-[#1A1A18]' : 'text-black/35'}`}>
            {skus.length}
          </span>
        )}
      </button>

      {rootNodes.map(node => renderNode(node, 0))}
    </nav>
  )
}
