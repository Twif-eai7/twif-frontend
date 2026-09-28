import { useState, useMemo } from 'react'
import { usePlmStore } from '../../stores/plmStore'

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

// Fallback for any category name not yet in ICON_BY_NAME (e.g. a brand-new category) — a plain
// dot rather than nothing, so a future name never silently renders icon-less.
function GenericIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <circle cx="8" cy="8" r="2.5" fill="currentColor" stroke="none"/>
    </svg>
  )
}

// ── Apparel / hardgoods roots ────────────────────────────────────────────────
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
function HardGoodsAltIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M8 1.5 L14.5 4.5 L14.5 11.5 L8 14.5 L1.5 11.5 L1.5 4.5 Z"/>
      <circle cx="8" cy="8" r="2" fill="currentColor" stroke="none"/>
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
function HomeDecorIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M2 8 L8 2.5 L14 8 L14 14 L2 14 Z"/>
      <path d="M6 14 L6 9.5 L10 9.5 L10 14"/>
    </svg>
  )
}
function MadeToOrderIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M2.5 13.5 L5 11 M5 11 L11.5 4.5 C12 4 13 4 13.5 4.5 C14 5 14 6 13.5 6.5 L7 13 L4 13.5 L4.5 10.5Z"/>
    </svg>
  )
}
function GiftIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <rect x="2" y="6.5" width="12" height="7.5"/>
      <path d="M2 6.5 L2 4 L14 4 L14 6.5"/>
      <path d="M8 4 L8 14"/>
      <path d="M8 4 C6.5 1.5 3.5 2 4 4 Z"/>
      <path d="M8 4 C9.5 1.5 12.5 2 12 4 Z"/>
    </svg>
  )
}

// ── Accessories family (tag base + small differentiating accent) ────────────
function AccessoriesIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M2 2 L8.5 2 L14 7.5 L9 13.5 L3 7.5 Z"/>
      <circle cx="6.5" cy="5" r="1" fill="currentColor" stroke="none"/>
    </svg>
  )
}
function BathroomAccessoriesIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M2 2 L8.5 2 L14 7.5 L9 13.5 L3 7.5 Z"/>
      <path d="M6.5 4 C6 4.7 5.7 5.3 5.7 5.8 A0.9 0.9 0 0 0 7.5 5.8 C7.5 5.3 7 4.7 6.5 4Z" fill="currentColor" stroke="none"/>
    </svg>
  )
}
function BreakfastAccessoriesIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M2 2 L8.5 2 L14 7.5 L9 13.5 L3 7.5 Z"/>
      <path d="M5.5 4 L5.5 6.5 A1.2 1.2 0 0 0 7.9 6.5 L7.9 4"/>
    </svg>
  )
}
function DeskAccessoriesIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M2 2 L8.5 2 L14 7.5 L9 13.5 L3 7.5 Z"/>
      <path d="M5 6.5 L7.5 4 L8.3 4.8 L5.8 7.3 L5 7.5 Z"/>
    </svg>
  )
}
function GardenAccessoriesIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M2 2 L8.5 2 L14 7.5 L9 13.5 L3 7.5 Z"/>
      <path d="M6.5 3.5 C5 4.5 5 6 6.5 6.8 C8 6 8 4.5 6.5 3.5Z" fill="currentColor" stroke="none"/>
    </svg>
  )
}
function TableAccessoriesIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M2 2 L8.5 2 L14 7.5 L9 13.5 L3 7.5 Z"/>
      <path d="M5.3 3.7 L5.3 5.5 M6 3.7 L6 5.5 M6.7 3.7 L6.7 5.5 M5.3 5.5 Q6 6 6.7 5.5 L6.7 7.3"/>
    </svg>
  )
}

// ── Candles / fragrance ───────────────────────────────────────────────────────
function CandleIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M8 4 C7 3 6.5 2 8 1 C9.5 2 9 3 8 4Z" fill="currentColor" stroke="none"/>
      <rect x="5.5" y="4" width="5" height="9.5" rx="0.5"/>
      <path d="M3.5 13.5 L12.5 13.5"/>
    </svg>
  )
}
function CandlesGroupIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M5 3.5 C4.3 2.8 4 2.2 5 1.5 C6 2.2 5.7 2.8 5 3.5Z" fill="currentColor" stroke="none"/>
      <rect x="3.3" y="3.5" width="3.4" height="9.5" rx="0.4"/>
      <path d="M11 5.5 C10.3 4.8 10 4.2 11 3.5 C12 4.2 11.7 4.8 11 5.5Z" fill="currentColor" stroke="none"/>
      <rect x="9.3" y="5.5" width="3.4" height="7.5" rx="0.4"/>
      <path d="M2 13.5 L14 13.5"/>
    </svg>
  )
}
function CandleHolderIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M8 5 C7.3 4.3 7 3.7 8 3 C9 3.7 8.7 4.3 8 5Z" fill="currentColor" stroke="none"/>
      <rect x="6.3" y="5" width="3.4" height="6" rx="0.4"/>
      <ellipse cx="8" cy="12.5" rx="4" ry="1.2"/>
      <path d="M4.5 12.5 L4.5 11.3 A3.5 1 0 0 1 11.5 11.3 L11.5 12.5"/>
    </svg>
  )
}
function CandlestickIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M8 3.5 C7.3 2.8 7 2.2 8 1.5 C9 2.2 8.7 2.8 8 3.5Z" fill="currentColor" stroke="none"/>
      <path d="M8 3.5 L8 11"/>
      <ellipse cx="8" cy="11.5" rx="1.6" ry="0.6"/>
      <path d="M5 14.5 L11 14.5 L9.5 11.8 L6.5 11.8 Z"/>
    </svg>
  )
}
function LanternIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M6 2 L10 2 M8 2 L8 3.5"/>
      <path d="M5 3.5 L11 3.5 L11 12 L5 12 Z"/>
      <path d="M5 6 L11 6 M5 9 L11 9"/>
      <path d="M6.5 12 L6.5 14 M9.5 12 L9.5 14"/>
    </svg>
  )
}
function FragranceIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M6.5 2 L9.5 2 L9.5 4 L10.5 5.5 L10.5 13.5 L5.5 13.5 L5.5 5.5 L6.5 4 Z"/>
      <path d="M6.5 2 L9.5 2"/>
      <path d="M4 6.5 C4.6 6 4.6 7 4 7.5 M12 6.5 C11.4 6 11.4 7 12 7.5"/>
    </svg>
  )
}
function DiffuserIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M5.5 8 L10.5 8 L10 14 L6 14 Z"/>
      <ellipse cx="8" cy="8" rx="2.5" ry="1"/>
      <path d="M6.5 7 L5.5 1.5 M8 7 L8 1 M9.5 7 L10.5 2"/>
    </svg>
  )
}

// ── Decorative / art / ornaments / mirrors / frames ──────────────────────────
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
function GardenDecorIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <circle cx="8" cy="10" r="4"/>
      <path d="M8 6 L8 3.5"/>
      <path d="M8 3.5 C6.8 2.5 7 1.3 8 1 C9 1.3 9.2 2.5 8 3.5Z" fill="currentColor" stroke="none"/>
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
function FrameIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <rect x="2" y="2" width="12" height="12"/>
      <rect x="4.5" y="4.5" width="7" height="7"/>
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
function RoundMirrorIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <circle cx="8" cy="6.5" r="5"/>
      <path d="M8 11.5 L8 15"/>
      <path d="M5.5 15 L10.5 15"/>
    </svg>
  )
}
function FullLengthMirrorIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <rect x="4.5" y="1" width="7" height="13" rx="2"/>
      <path d="M8 14 L8 15.3"/>
      <path d="M6 15.3 L10 15.3"/>
    </svg>
  )
}
function WallMirrorIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <ellipse cx="8" cy="8" rx="5" ry="6"/>
      <path d="M2 3 L4.3 4"/>
      <path d="M14 3 L11.7 4"/>
    </svg>
  )
}
function WallArtIcon() { return ArtIcon() }

// ── Lighting family ────────────────────────────────────────────────────────
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
function TableFloorLampIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M4.5 3.5 L9 3.5 L10.3 7.5 L3.2 7.5 Z"/>
      <path d="M6.7 7.5 L6.7 11.5"/>
      <path d="M5 11.5 L8.5 11.5"/>
      <path d="M12 2 L12 14"/>
    </svg>
  )
}
function DeskLampIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M3 13.5 L7 13.5"/>
      <path d="M4.5 13.5 L4.5 11 L9 8"/>
      <path d="M9 8 L12.5 5.5"/>
      <path d="M11 3.5 L14 6 L11.5 7 L9.5 4.5 Z"/>
    </svg>
  )
}
function LampshadeIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M5.5 3 L10.5 3 L12.5 11 L3.5 11 Z"/>
      <path d="M6.7 3 L5.2 11 M9.3 3 L10.8 11"/>
    </svg>
  )
}
function FabricShadeIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M5.5 3 L10.5 3 L12.5 11 L3.5 11 Z"/>
      <path d="M4.3 5.5 L11.7 5.5 M3.9 8 L12.1 8"/>
    </svg>
  )
}
function LinenShadeIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M5.5 3 L10.5 3 L12.5 11 L3.5 11 Z"/>
      <circle cx="6.5" cy="6" r="0.4" fill="currentColor" stroke="none"/>
      <circle cx="9.5" cy="6" r="0.4" fill="currentColor" stroke="none"/>
      <circle cx="8" cy="8.5" r="0.4" fill="currentColor" stroke="none"/>
      <circle cx="5.7" cy="9" r="0.4" fill="currentColor" stroke="none"/>
      <circle cx="10.3" cy="9" r="0.4" fill="currentColor" stroke="none"/>
    </svg>
  )
}
function MetalShadeIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M5.5 3 L10.5 3 L12.5 11 L3.5 11 Z"/>
      <path d="M4.6 5.8 L11.4 5.8"/>
      <path d="M4.2 8.4 L11.8 8.4"/>
    </svg>
  )
}
function PendantIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M8 1.5 L8 6"/>
      <path d="M5.5 6 L10.5 6 L9.5 11 L6.5 11 Z"/>
    </svg>
  )
}
function PendantLightIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M4 1.5 L12 1.5"/>
      <path d="M8 1.5 L8 5"/>
      <path d="M5 5 L11 5 L9.7 11.5 L6.3 11.5 Z"/>
    </svg>
  )
}
function SpotLightIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <rect x="6" y="1.5" width="4" height="2.5" rx="0.5"/>
      <path d="M6.5 4 L4 13.5 L12 13.5 L9.5 4 Z"/>
    </svg>
  )
}
function StatementLightIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M8 1.5 L8 3.5"/>
      <ellipse cx="8" cy="4" rx="5" ry="1"/>
      <path d="M3.3 4.3 L4.5 8 M12.7 4.3 L11.5 8 M8 4.7 L8 9"/>
      <circle cx="4.5" cy="8.7" r="0.8" fill="currentColor" stroke="none"/>
      <circle cx="11.5" cy="8.7" r="0.8" fill="currentColor" stroke="none"/>
      <circle cx="8" cy="9.7" r="0.8" fill="currentColor" stroke="none"/>
    </svg>
  )
}
function OutdoorLightIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <rect x="6" y="2" width="4" height="3" rx="0.5"/>
      <path d="M8 5 L8 13.5"/>
      <path d="M5.5 13.5 L10.5 13.5"/>
    </svg>
  )
}
function WallLightIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <rect x="1.5" y="6" width="2" height="4" rx="0.5"/>
      <path d="M3.5 8 L9 8"/>
      <ellipse cx="11.5" cy="8" rx="2.5" ry="3.2"/>
    </svg>
  )
}
function WallSpotIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <rect x="1.5" y="6" width="2" height="4" rx="0.5"/>
      <path d="M3.5 8 L6.5 8"/>
      <path d="M6.5 5.5 L13.5 8 L6.5 10.5 Z"/>
    </svg>
  )
}

// ── Seating ────────────────────────────────────────────────────────────────
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
function OccasionalChairIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M4.5 8 C4.5 4.5 11.5 4.5 11.5 8 L11.5 9.5 L4.5 9.5 Z"/>
      <path d="M4.5 9.5 L4.5 13.5 M11.5 9.5 L11.5 13.5"/>
      <path d="M4.5 9.5 L11.5 9.5"/>
    </svg>
  )
}
function BarStoolIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <ellipse cx="8" cy="3.5" rx="4" ry="1.3"/>
      <path d="M5 4.3 L6.2 13.5 M11 4.3 L9.8 13.5"/>
      <path d="M5.7 9 L10.3 9"/>
    </svg>
  )
}
function BenchIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <rect x="1.5" y="6.5" width="13" height="2" rx="0.3"/>
      <path d="M3 8.5 L3 13.5 M13 8.5 L13 13.5"/>
    </svg>
  )
}
function BenchSeatingIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M3 6.5 L3 4"/>
      <rect x="1.5" y="6.5" width="13" height="2" rx="0.3"/>
      <path d="M3 8.5 L3 13.5 M13 8.5 L13 13.5"/>
    </svg>
  )
}
function DiningChairsBenchesIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M3.5 3 L3.5 7 L7.5 7 L7.5 3"/>
      <path d="M3.5 7 L3.5 13 M7.5 7 L7.5 13"/>
      <rect x="9.5" y="9" width="5" height="1.7" rx="0.3"/>
      <path d="M10.3 10.7 L10.3 13 M13.7 10.7 L13.7 13"/>
    </svg>
  )
}
function GardenTableChairIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M2 9 L2 13.5"/>
      <path d="M2 6.5 C2 4 5.5 4 5.5 6.5 L5.5 9 L2 9 Z"/>
      <rect x="7" y="9" width="7" height="1.5"/>
      <path d="M8.5 10.5 L8.5 13.5 M12.5 10.5 L12.5 13.5"/>
    </svg>
  )
}
function PoufIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <ellipse cx="8" cy="7" rx="5.5" ry="4"/>
      <path d="M3.5 9.5 L3.5 12.5 M12.5 9.5 L12.5 12.5"/>
      <path d="M3.7 12.5 L12.3 12.5"/>
    </svg>
  )
}
function SofaIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M2.5 8 L2.5 5.5 A1.5 1.5 0 0 1 5.5 5.5 L5.5 7 L10.5 7 L10.5 5.5 A1.5 1.5 0 0 1 13.5 5.5 L13.5 8"/>
      <rect x="2" y="8" width="12" height="3.5" rx="0.6"/>
      <path d="M3 11.5 L3 14 M13 11.5 L13 14"/>
    </svg>
  )
}
function SofaCollectionsIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <rect x="1.5" y="4" width="9" height="3" rx="0.6"/>
      <path d="M2 7 L2 8.5 M10.5 7 L10.5 8.5"/>
      <rect x="4.5" y="9.5" width="9" height="3" rx="0.6"/>
      <path d="M5 12.5 L5 14 M13.5 12.5 L13.5 14"/>
    </svg>
  )
}
function SofaDeliveryIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <rect x="1.5" y="6" width="8" height="3" rx="0.5"/>
      <path d="M2 9 L2 11 M9 9 L9 11"/>
      <rect x="11" y="7" width="4" height="4"/>
      <path d="M11 9 L15 9"/>
    </svg>
  )
}

// ── Tables / desks ────────────────────────────────────────────────────────
function TableIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <rect x="1.5" y="4" width="13" height="2.5"/>
      <path d="M3 6.5 L3 14 M13 6.5 L13 14"/>
    </svg>
  )
}
function DiningTableIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <rect x="2.5" y="5.5" width="11" height="2" rx="0.3"/>
      <path d="M4 7.5 L4 12 M12 7.5 L12 12"/>
      <circle cx="1.5" cy="6.5" r="1"/>
      <circle cx="14.5" cy="6.5" r="1"/>
    </svg>
  )
}
function CoffeeTableIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <rect x="1.5" y="8" width="13" height="1.8" rx="0.3"/>
      <path d="M3 9.8 L3 13 M13 9.8 L13 13"/>
    </svg>
  )
}
function ConsoleTableIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <rect x="3" y="3.5" width="10" height="2" rx="0.3"/>
      <path d="M4.5 5.5 L4.5 13 M11.5 5.5 L11.5 13"/>
      <path d="M4.5 9 L11.5 9"/>
    </svg>
  )
}
function SideTableIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <ellipse cx="8" cy="5" rx="4.5" ry="1.5"/>
      <path d="M4.5 5.7 L4.5 13.5 M11.5 5.7 L11.5 13.5"/>
    </svg>
  )
}
function BedsideTableIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <rect x="3" y="2.5" width="10" height="10" rx="0.4"/>
      <path d="M4.5 6 L11.5 6"/>
      <path d="M9.7 4.2 L9.7 5.4"/>
    </svg>
  )
}
function DeskIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <rect x="1.5" y="4" width="13" height="2" rx="0.3"/>
      <path d="M3 6 L3 14"/>
      <rect x="9.5" y="6" width="4.5" height="5.5" rx="0.3"/>
      <path d="M11 8.2 L13 8.2"/>
    </svg>
  )
}

// ── Storage ────────────────────────────────────────────────────────────────
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
function StorageShelvingIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <rect x="2" y="1.5" width="12" height="13"/>
      <path d="M2 6 L14 6 M2 10.5 L14 10.5"/>
    </svg>
  )
}
function StorageUtilityIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <rect x="2" y="5" width="12" height="9"/>
      <path d="M5.5 5 L5.5 2.5 L10.5 2.5 L10.5 5"/>
    </svg>
  )
}
function StorageBenchIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <rect x="2" y="5.5" width="12" height="5"/>
      <path d="M3 10.5 L3 13.5 M13 10.5 L13 13.5"/>
      <path d="M2 5.5 L14 5.5"/>
    </svg>
  )
}
function JarIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <rect x="5" y="1.5" width="6" height="1.8"/>
      <path d="M5.5 3.3 L4.5 5.5 L4.5 13.5 L11.5 13.5 L11.5 5.5 L10.5 3.3"/>
    </svg>
  )
}
function CabinetIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <rect x="2.5" y="2" width="11" height="12"/>
      <path d="M8 2 L8 14"/>
      <circle cx="6.7" cy="8" r="0.5" fill="currentColor" stroke="none"/>
      <circle cx="9.3" cy="8" r="0.5" fill="currentColor" stroke="none"/>
    </svg>
  )
}
function ChestIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <rect x="2.5" y="2" width="11" height="12"/>
      <path d="M2.5 6 L13.5 6 M2.5 10 L13.5 10"/>
      <path d="M7 4 L9 4 M7 8 L9 8 M7 12 L9 12"/>
    </svg>
  )
}
function ShelfIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M2 2 L14 2 M2 6.5 L14 6.5 M2 11 L14 11"/>
      <path d="M3 2 L3 14 M13 2 L13 14"/>
    </svg>
  )
}
function CoatHookIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M2 3 L14 3"/>
      <path d="M6 3 C6 6 4 5.5 4 8"/>
      <path d="M10 3 C10 6 12 5.5 12 8"/>
    </svg>
  )
}
function HooksRailIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M2 2.5 L14 2.5"/>
      <path d="M5 2.5 L5 5.5 A1 1 0 1 0 5.5 5" />
      <path d="M11 2.5 L11 5.5 A1 1 0 1 0 11.5 5" />
    </svg>
  )
}
function BasketIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M3 6 L13 6 L11.5 13.5 L4.5 13.5 Z"/>
      <path d="M5.5 6 C5.5 3 10.5 3 10.5 6"/>
      <path d="M4 8 L12 8 M4.4 10.5 L11.6 10.5"/>
    </svg>
  )
}
function LaundryBasketIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M3 6 L13 6 L11.5 13.5 L4.5 13.5 Z"/>
      <path d="M4 8 L12 8"/>
      <path d="M6 3 C6.5 4.5 7 5 7.5 6 M9 3.5 C8.7 4.5 9.2 5.2 9.7 6"/>
    </svg>
  )
}

// ── Bedroom ────────────────────────────────────────────────────────────────
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
function BedroomIcon() { return BeddingIcon() }
function BedroomLinenIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <rect x="2" y="4" width="12" height="3" rx="0.4"/>
      <rect x="2" y="8" width="12" height="3" rx="0.4"/>
      <path d="M2 12.5 L14 12.5"/>
    </svg>
  )
}
function BedHeadboardIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M3 3 L3 8 L13 8 L13 3" strokeLinecap="round"/>
      <rect x="1.5" y="8" width="13" height="4" rx="0.6"/>
      <path d="M2.5 12 L2.5 14 M13.5 12 L13.5 14"/>
    </svg>
  )
}

// ── Rugs / textiles / cushions ────────────────────────────────────────────
function RugIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <rect x="4" y="1.5" width="8" height="13" rx="1"/>
      <path d="M4 4.5 L12 4.5 M4 8 L12 8 M4 11.5 L12 11.5"/>
      <path d="M6.5 1.5 L6.5 14.5 M9.5 1.5 L9.5 14.5"/>
    </svg>
  )
}
function RunnerIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <rect x="5.5" y="1" width="5" height="14" rx="1"/>
      <path d="M5.5 4 L10.5 4 M5.5 8 L10.5 8 M5.5 12 L10.5 12"/>
    </svg>
  )
}
function DoormatIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <rect x="2" y="4.5" width="12" height="7" rx="0.6"/>
      <path d="M2.5 6.5 L13.5 6.5 M2.5 9.5 L13.5 9.5"/>
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
function CushionThrowIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <rect x="1.5" y="2.5" width="8" height="8" rx="2.5"/>
      <path d="M4 6.5 Q5.5 5.2 7 6.5 Q5.5 7.8 4 6.5Z"/>
      <path d="M9 10.5 L14.5 10.5 M9 12.5 L14.5 12.5 M9 14 L13 14"/>
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
function BlanketIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <rect x="2" y="3" width="12" height="8" rx="0.5"/>
      <path d="M2 6.5 L14 6.5"/>
      <path d="M3 11 L3 13 M5.5 11 L5.5 13 M8 11 L8 13 M10.5 11 L10.5 13 M13 11 L13 13"/>
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
function TextileIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M2.5 4.5 L2.5 11.5 A2 2 0 0 0 4.5 13.5 L11.5 13.5"/>
      <ellipse cx="2.5" cy="4.5" rx="2" ry="1.3"/>
      <path d="M4.5 4.5 L4.5 13.5"/>
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

// ── Outdoor / garden ───────────────────────────────────────────────────────
function OutdoorIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M8 1.5 L14.5 10 L1.5 10 Z"/>
      <rect x="6.5" y="10" width="3" height="4.5"/>
      <path d="M3 14.5 L13 14.5"/>
    </svg>
  )
}
function GardenIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M8 14 L8 6"/>
      <path d="M8 9 C5 9 4.5 6.5 5 4.5 C7.5 5 8 7 8 9Z"/>
      <path d="M8 7 C11 7 11.5 4.5 11 3 C8.5 3.5 8 5.5 8 7Z"/>
    </svg>
  )
}
function GardenFurnitureIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M8 1.5 L8 6"/>
      <path d="M2.5 6 L13.5 6 L8 4 Z"/>
      <path d="M3.5 9 L3.5 6 M3.5 9 L2 13.5 M3.5 9 L5 13.5"/>
      <path d="M12.5 9 L12.5 6 M12.5 9 L11 13.5 M12.5 9 L14 13.5"/>
    </svg>
  )
}
function GardenPotIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M4.5 7 L11.5 7 L10.3 14 L5.7 14 Z"/>
      <path d="M4.5 7 L11.5 7"/>
      <path d="M8 7 C6 5 6.5 3 8 1.5 C9.5 3 10 5 8 7Z"/>
    </svg>
  )
}
function OutdoorGardenIcon() { return OutdoorIcon() }

// ── Vases / planters ──────────────────────────────────────────────────────
function VaseIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M6.5 1.5 L9.5 1.5 L9.5 3.5 C11.5 5.5 11.5 10 9.5 12 L9.5 14.5 L6.5 14.5 L6.5 12 C4.5 10 4.5 5.5 6.5 3.5 Z"/>
    </svg>
  )
}
function VasesPlantersIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M4 1.5 L6 1.5 L6 3 C7.2 4.3 7.2 7.7 6 9 L6 12 L4 12 L4 9 C2.8 7.7 2.8 4.3 4 3 Z"/>
      <path d="M9.5 6.5 L13.5 6.5 L12.7 13.5 L10.3 13.5 Z"/>
    </svg>
  )
}
function HangingPlanterIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M4 1.5 L8 4 L12 1.5"/>
      <path d="M8 4 L8 6.5"/>
      <path d="M5 6.5 L11 6.5 L10.2 13 L5.8 13 Z"/>
    </svg>
  )
}
function IndoorPlanterIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M4.5 8 L11.5 8 L10.3 14 L5.7 14 Z"/>
      <path d="M8 8 C6.5 6 6.7 3.5 6 2 M8 8 C9.5 6 9.3 3.7 10.5 2.5 M8 8 C8 5.5 8 3.5 8 1.5"/>
    </svg>
  )
}

// ── Glassware / barware ────────────────────────────────────────────────────
function GlasswareIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M4.5 2 L11.5 2 L9 8 L9 13 L7 13 M9 8 L7 8"/>
      <path d="M5.5 13 L8.5 13"/>
      <path d="M7 8 L7 13"/>
    </svg>
  )
}
function EverydayGlassIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M5.5 2 L10.5 2 L10 13.5 L6 13.5 Z"/>
      <path d="M5.7 6 L10.3 6"/>
    </svg>
  )
}
function WineGlassIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M5 2 C5 6 6 7.5 8 7.5 C10 7.5 11 6 11 2Z"/>
      <path d="M8 7.5 L8 13"/>
      <path d="M5.5 13 L10.5 13"/>
    </svg>
  )
}
function TumblerIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M5.2 4 L10.8 4 L10.2 13.5 L5.8 13.5 Z"/>
      <path d="M5.4 7.5 L10.6 7.5"/>
    </svg>
  )
}
function BarwareIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M5.5 2.5 L10.5 2.5 L10.5 6 L11.5 7.5 L11.5 13 L4.5 13 L4.5 7.5 L5.5 6 Z"/>
      <path d="M5.5 2.5 L10.5 2.5"/>
      <path d="M4.5 8.5 L11.5 8.5"/>
    </svg>
  )
}
function WineRackIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M2 2 L2 14 M14 2 L14 14"/>
      <path d="M2 5 L14 5 M2 8 L14 8 M2 11 L14 11"/>
      <circle cx="5" cy="6.5" r="1"/>
      <circle cx="11" cy="9.5" r="1"/>
    </svg>
  )
}

// ── Tableware / kitchen ────────────────────────────────────────────────────
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
function KitchenStorageIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <rect x="2" y="2" width="8" height="12"/>
      <path d="M2 7 L10 7"/>
      <path d="M11.5 9 L14 9 L13.3 13.5 L12.2 13.5 Z"/>
    </svg>
  )
}
function KitchenwareIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M3.5 6 L3.5 13.5 A2.5 2.5 0 0 0 8.5 13.5 L8.5 6 Z"/>
      <path d="M3 6 L9 6"/>
      <path d="M11.5 2 L11.5 13.5 M10 4 L13 4"/>
    </svg>
  )
}
function PantryIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <rect x="1.5" y="4.5" width="3.5" height="9"/>
      <rect x="6.2" y="3" width="3.5" height="10.5"/>
      <rect x="10.9" y="5.5" width="3.5" height="8"/>
    </svg>
  )
}
function BowlIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M2.5 7 L13.5 7 C13.5 10.5 11 13 8 13 C5 13 2.5 10.5 2.5 7Z"/>
      <path d="M2.5 7 L13.5 7"/>
    </svg>
  )
}
function BowlTrayIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M4 3.5 L12 3.5 C12 6.5 10 8.5 8 8.5 C6 8.5 4 6.5 4 3.5Z"/>
      <rect x="2" y="10.5" width="12" height="3" rx="0.5"/>
    </svg>
  )
}
function ServingBowlIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M1.5 6.5 L14.5 6.5 C14.5 10 11.6 13 8 13 C4.4 13 1.5 10 1.5 6.5Z"/>
      <path d="M1.5 6.5 L14.5 6.5"/>
      <path d="M8 6.5 L8 2.5"/>
    </svg>
  )
}
function PlateIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <circle cx="8" cy="8" r="6"/>
      <circle cx="8" cy="8" r="3.2"/>
    </svg>
  )
}
function TablewareIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <circle cx="6" cy="6" r="4"/>
      <path d="M11 3 L11 13 M13 3 L13 7.5 A1 1.5 0 0 1 11 7.5"/>
    </svg>
  )
}
function TablewareCollectionsIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <ellipse cx="8" cy="11" rx="6" ry="1.8"/>
      <ellipse cx="8" cy="8" rx="6" ry="1.8"/>
      <ellipse cx="8" cy="5" rx="6" ry="1.8"/>
    </svg>
  )
}
function CutleryIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M4.5 1.5 L4.5 6 M3 1.5 L3 4.5 M6 1.5 L6 4.5 M3 4.5 Q3 6 4.5 6 L4.5 14.5"/>
      <path d="M11.5 1.5 C10 1.5 10 5 11.5 6 L11.5 14.5"/>
    </svg>
  )
}
function ServingCutleryIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M4.5 1 L4.5 5.5 M3 1 L3 4 M6 1 L6 4 M3 4 Q3 5.5 4.5 5.5 L4.5 15"/>
      <path d="M11.5 1 C9.5 1.5 9.5 4.5 11.5 5.5 L11.5 15"/>
    </svg>
  )
}
function CheeseBoardIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <ellipse cx="7" cy="9" rx="6" ry="4"/>
      <path d="M10 4 L14 8 L11.5 10 L8 6.5 Z"/>
    </svg>
  )
}
function ChoppingBoardIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <rect x="2" y="3" width="12" height="10" rx="2"/>
      <circle cx="11.5" cy="5.5" r="0.8"/>
    </svg>
  )
}
function TeapotIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M3 8.5 C3 6.5 5 5.5 8 5.5 C11 5.5 13 6.5 13 8.5 C13 10.8 11 12.5 8 12.5 C5 12.5 3 10.8 3 8.5Z"/>
      <path d="M13 7.5 C15 7.5 15 10 13 10"/>
      <path d="M3 7.5 L1 6.5"/>
      <path d="M7 4 C7 3 9 3 9 4 L9 5.5"/>
    </svg>
  )
}
function MugIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <rect x="2.5" y="4" width="8" height="9" rx="1"/>
      <path d="M10.5 6 C13.5 6 13.5 11 10.5 11"/>
    </svg>
  )
}
function JugIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M4.5 3 L10.5 3 L10.5 5 C12.5 6 12.5 9 10.5 9.5 L10.5 13.5 L4.5 13.5 Z"/>
      <path d="M4.5 3 C4 4.5 4 5.5 5 6.5"/>
      <path d="M4.5 13.5 L10.5 13.5"/>
    </svg>
  )
}
function ServewareIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <ellipse cx="8" cy="8" rx="6.5" ry="3"/>
      <ellipse cx="8" cy="8" rx="3" ry="1.3"/>
    </svg>
  )
}
function TrayIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <rect x="2" y="5" width="12" height="6" rx="1"/>
      <path d="M0.5 8 L2 8 M14 8 L15.5 8"/>
    </svg>
  )
}
function CakeDomeIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M4 11 C4 6.5 12 6.5 12 11"/>
      <rect x="2" y="11" width="12" height="1.7" rx="0.4"/>
      <path d="M8 6.5 L8 4.5"/>
      <circle cx="8" cy="4" r="0.6" fill="currentColor" stroke="none"/>
    </svg>
  )
}
function TableSettingIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <rect x="1.5" y="2" width="13" height="12" rx="1"/>
      <path d="M4.5 4.5 L4.5 11.5 M3.5 4.5 L3.5 7 M5.5 4.5 L5.5 7"/>
      <ellipse cx="10.5" cy="8" rx="2" ry="3.5"/>
    </svg>
  )
}

// ── Bathroom ───────────────────────────────────────────────────────────────
function BathroomIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <path d="M8 1.5 C6.5 3.5 5.5 5.5 5.5 7 A2.5 2.5 0 0 0 10.5 7 C10.5 5.5 9.5 3.5 8 1.5Z"/>
      <path d="M3 14.5 L13 14.5"/>
      <path d="M8 9.5 L8 12"/>
    </svg>
  )
}
function SoapDishIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <ellipse cx="8" cy="12" rx="6" ry="2"/>
      <ellipse cx="8" cy="8.5" rx="3.5" ry="1.6"/>
    </svg>
  )
}
function SoapDispenserIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <rect x="5" y="5" width="6" height="9" rx="1.5"/>
      <path d="M6.5 5 L6.5 3 L9 3 L9 2"/>
      <path d="M9 2 L11 2"/>
    </svg>
  )
}

// ── Clocks ─────────────────────────────────────────────────────────────────
function ClockIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <circle cx="8" cy="8" r="6"/>
      <path d="M8 4.5 L8 8 L10.5 9.5"/>
    </svg>
  )
}

// ── Jewellery ──────────────────────────────────────────────────────────────
function JewelleryIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <polygon points="2.5,6.5 5,2 11,2 13.5,6.5 8,14.5"/>
      <path d="M2.5 6.5 L13.5 6.5"/>
      <path d="M5 2 L6.5 6.5 M11 2 L9.5 6.5"/>
    </svg>
  )
}
function JewelleryBoxIcon() {
  return (
    <svg viewBox="0 0 16 16" {...S} className={IC}>
      <rect x="2.5" y="6.5" width="11" height="7"/>
      <path d="M2.5 6.5 L4 3 L12 3 L13.5 6.5"/>
      <path d="M6.7 9.7 L8 8.2 L9.3 9.7 L8 11.2 Z" fill="currentColor" stroke="none"/>
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

// ── Exact name → icon lookup. Every distinct category name in the catalog gets its own
// component (not shared with siblings) so no two rows ever render the same glyph. A name not
// found here (e.g. a brand-new category added later) falls back to GenericIcon rather than
// rendering icon-less.
const ICON_BY_NAME = {
  'Accessories': AccessoriesIcon,
  'All Home Fragrance': FragranceIcon,
  'Apparel': ApparelIcon,
  'Armchairs': ArmchairIcon,
  'Bar Stools & Bar Chairs': BarStoolIcon,
  'Barware': BarwareIcon,
  'Baskets': BasketIcon,
  'Bathroom': BathroomIcon,
  'Bathroom Accessories': BathroomAccessoriesIcon,
  'Bedroom': BedroomIcon,
  'Bedroom Linens': BedroomLinenIcon,
  'Beds & Headboards': BedHeadboardIcon,
  'Bedside Tables': BedsideTableIcon,
  'Benches': BenchIcon,
  'Benches & Seating': BenchSeatingIcon,
  'Blankets & Throws': BlanketIcon,
  'Bowls': BowlIcon,
  'Bowls & Trays': BowlTrayIcon,
  'Bracelets': BraceletIcon,
  'Breakfast Accessories': BreakfastAccessoriesIcon,
  'Cabinets & Sideboards': CabinetIcon,
  'Cake Domes & Stands': CakeDomeIcon,
  'Candle Holders': CandleHolderIcon,
  'Candles': CandleIcon,
  'Candles & Candle Holders': CandlesGroupIcon,
  'Candlesticks': CandlestickIcon,
  'Cheese Board & Knives': CheeseBoardIcon,
  'Chest of Drawers': ChestIcon,
  'Chopping Boards': ChoppingBoardIcon,
  'Clocks': ClockIcon,
  'Coat Hooks': CoatHookIcon,
  'Coffee Tables': CoffeeTableIcon,
  'Console Tables': ConsoleTableIcon,
  'Cushions': PillowIcon,
  'Cushions & Throws': CushionThrowIcon,
  'Cutlery': CutleryIcon,
  'Decorative Accessories': DecorativeIcon,
  'Desk Accessories': DeskAccessoriesIcon,
  'Desk Lamps': DeskLampIcon,
  'Desks': DeskIcon,
  'Dining Chairs & Benches': DiningChairsBenchesIcon,
  'Dining Tables': DiningTableIcon,
  'Doormats': DoormatIcon,
  'Earrings': EarringsIcon,
  'Everyday Glassware': EverydayGlassIcon,
  'Fabric Lampshades': FabricShadeIcon,
  'Floor Lamps': FloorLampIcon,
  'Footstools & Poufs': PoufIcon,
  'Freestanding Shelves': ShelfIcon,
  'Full Length Mirrors': FullLengthMirrorIcon,
  'Furniture': FurnitureIcon,
  'Garden': GardenIcon,
  'Garden Accessories': GardenAccessoriesIcon,
  'Garden Décor': GardenDecorIcon,
  'Garden Furniture': GardenFurnitureIcon,
  'Garden Pots & Planters': GardenPotIcon,
  'Garden Tables & Chairs': GardenTableChairIcon,
  'Glassware': GlasswareIcon,
  'Hanging Planters': HangingPlanterIcon,
  'Hard Goods': HardGoodsAltIcon,
  'Hard goods': HardgoodsIcon,
  'Hardgoods': HardgoodsIcon,
  'Home Decor': HomeDecorIcon,
  'Hooks & Rails': HooksRailIcon,
  'Indoor Planters': IndoorPlanterIcon,
  'Jewellery': JewelleryIcon,
  'Jewellery Boxes': JewelleryBoxIcon,
  'Jugs': JugIcon,
  'Kitchen & Dining': KitchenIcon,
  'Kitchen Storage': KitchenStorageIcon,
  'Kitchenware': KitchenwareIcon,
  'Lampshades': LampshadeIcon,
  'Lanterns': LanternIcon,
  'Laundry Baskets': LaundryBasketIcon,
  'Lighting': LightingIcon,
  'Linen Lampshades': LinenShadeIcon,
  'Made to Order': MadeToOrderIcon,
  'Metal Lampshades': MetalShadeIcon,
  'Mirrors': MirrorIcon,
  'Mugs': MugIcon,
  'Necklaces': NecklaceIcon,
  'Occasional Chairs': OccasionalChairIcon,
  'Ornaments': OrnamentIcon,
  'Outdoor / Garden': OutdoorGardenIcon,
  'Outdoor Lighting': OutdoorLightIcon,
  'Pantry & Kitchen Storage': PantryIcon,
  'Pendant Lighting': PendantLightIcon,
  'Pendants': PendantIcon,
  'Photo frames': FrameIcon,
  'Plates': PlateIcon,
  'Ready to Deliver Sofas': SofaDeliveryIcon,
  'Reed Diffusers': DiffuserIcon,
  'Rings': RingsIcon,
  'Round Mirrors': RoundMirrorIcon,
  'Rugs': RugIcon,
  'Runners': RunnerIcon,
  'Seasonal / Gifting': GiftIcon,
  'Seating': SeatingIcon,
  'Serveware': ServewareIcon,
  'Serving Bowls': ServingBowlIcon,
  'Serving Cutlery': ServingCutleryIcon,
  'Side Tables': SideTableIcon,
  'Soap Dishes': SoapDishIcon,
  'Soap Dispensers': SoapDispenserIcon,
  'Sofa Collections': SofaCollectionsIcon,
  'Sofas': SofaIcon,
  'Soft Furnishing': SoftFurnishingIcon,
  'Spot Lights': SpotLightIcon,
  'Statement Lighting': StatementLightIcon,
  'Storage': StorageIcon,
  'Storage & Shelving': StorageShelvingIcon,
  'Storage & Utility': StorageUtilityIcon,
  'Storage Benches': StorageBenchIcon,
  'Storage Jars': JarIcon,
  'Table & Floor Lamps': TableFloorLampIcon,
  'Table Accessories': TableAccessoriesIcon,
  'Table Lamps': TableLampIcon,
  'Table Settings & Linens': TableSettingIcon,
  'Tables': TableIcon,
  'Tableware': TablewareIcon,
  'Tableware Collections': TablewareCollectionsIcon,
  'Teapots & Teacups': TeapotIcon,
  'Textile': TextileIcon,
  'Textiles': TextilesIcon,
  'Trays & Platters': TrayIcon,
  'Tumblers': TumblerIcon,
  'Vases': VaseIcon,
  'Vases & Planters': VasesPlantersIcon,
  'Wall & Spot Lights': WallSpotIcon,
  'Wall Art': WallArtIcon,
  'Wall Lights': WallLightIcon,
  'Wall Mirrors': WallMirrorIcon,
  'Wine & Champagne Glasses': WineGlassIcon,
  'Wine Racks': WineRackIcon,
}

function getCategoryIcon(name) {
  const Icon = ICON_BY_NAME[name] || GenericIcon
  return <Icon />
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

  // Adjacency map built once per categories change — lets countMap avoid re-deriving
  // "who are c's children" via a fresh categories.filter() for every node.
  const childrenByParent = useMemo(() => {
    const map = new Map()
    categories.forEach(c => {
      const key = c.parent_id ?? null
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(c)
    })
    return map
  }, [categories])

  // Previously this called getCategoryDescendantIds (an O(categories) BFS) once PER category
  // node, then did a full skus.filter() for each — O(categories × skus). At 2500 SKUs and
  // 100+ categories that's ~250,000 filter evaluations rebuilt on every keystroke (this
  // component's `skus` prop changes on every search/filter interaction). Rewritten as: one
  // pass over skus for direct per-category counts, then one bottom-up propagation over the
  // category tree (each node visited exactly once) — O(categories + skus) total.
  const countMap = useMemo(() => {
    const direct = new Map()
    skus.forEach(s => {
      if (!s.category_id) return
      direct.set(s.category_id, (direct.get(s.category_id) || 0) + 1)
    })
    const map = {}
    const visit = (id) => {
      if (map[id] !== undefined) return map[id]
      let total = direct.get(id) || 0
      ;(childrenByParent.get(id) || []).forEach(child => { total += visit(child.id) })
      map[id] = total
      return total
    }
    categories.forEach(c => visit(c.id))
    return map
  }, [categories, skus, childrenByParent])

  const childrenOf = (parentId) =>
    (childrenByParent.get(parentId) || []).filter(c => (countMap[c.id] || 0) > 0)

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
            <span className={`text-[9px] font-semibold tabular-nums flex-shrink-0 ${isActive ? 'text-[#1A1A18]' : 'text-black/50'}`}>
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
    <nav className="flex flex-col gap-px pr-1">
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
          <span className={`text-[10px] font-semibold tabular-nums ${allActive ? 'text-[#1A1A18]' : 'text-black/55'}`}>
            {skus.length}
          </span>
        )}
      </button>

      {rootNodes.map(node => renderNode(node, 0))}
    </nav>
  )
}
