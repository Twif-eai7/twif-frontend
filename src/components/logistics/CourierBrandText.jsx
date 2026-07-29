const sz = {
  sm: 'text-[11px]',
  md: 'text-sm',
  lg: 'text-base',
}

function FedExText({ size }) {
  const s = sz[size] || sz.md
  return (
    <span className={`font-black ${s} tracking-tight`}>
      <span className="text-[#4D148C]">Fed</span>
      <span className="text-[#FF6600]">Ex</span>
    </span>
  )
}

function BlueDartText({ size }) {
  const s = sz[size] || sz.md
  return (
    <span className={`font-black ${s} tracking-tight`}>
      <span className="text-[#003DA5]">Blue</span>
      <span className="text-[#78BE20]">Dart</span>
    </span>
  )
}

function DelhiveryText({ size }) {
  const s = sz[size] || sz.md
  return (
    <span className={`font-black uppercase ${s} tracking-wider text-gray-900`}>
      <span className="text-[#E31E24]">D</span>
      ELHIVER
      <span className="text-[#E31E24]">Y</span>
    </span>
  )
}

function DHLText({ size }) {
  const s = sz[size] || sz.md
  return (
    <span className={`font-black italic ${s} text-[#D40511] tracking-tight`}>
      DHL
    </span>
  )
}

const BRAND_RENDERERS = {
  'BlueDart':              (p) => <BlueDartText {...p} />,
  'DTDC':                  (p) => <span className={`font-black ${sz[p.size] || sz.md} text-[#004B87] tracking-wide`}>DTDC</span>,
  'Delhivery':             (p) => <DelhiveryText {...p} />,
  'Ecom Express':          (p) => <span className={`font-bold ${sz[p.size] || sz.md} text-[#E31837]`}>Ecom Express</span>,
  'Xpressbees':            (p) => <span className={`font-black ${sz[p.size] || sz.md} text-gray-900`}><span className="text-[#F5C518]">X</span>pressbees</span>,
  'Ekart Logistics':       (p) => <span className={`font-bold ${sz[p.size] || sz.md} text-[#2874F0]`}>Ekart Logistics</span>,
  'Shadowfax':             (p) => <span className={`font-bold ${sz[p.size] || sz.md} text-[#00A651]`}>Shadowfax</span>,
  'FedEx':                 (p) => <FedExText {...p} />,
  'DHL Express':           (p) => <DHLText {...p} />, // legacy records
  'India Post':            (p) => <span className={`font-bold ${sz[p.size] || sz.md} text-[#DA251D]`}>India Post</span>,
  'Professional Couriers': (p) => <span className={`font-bold ${sz[p.size] || sz.md} text-[#1e3a8a]`}>Professional Couriers</span>,
  'Safexpress':            (p) => <span className={`font-bold ${sz[p.size] || sz.md} text-[#00843D]`}>Safexpress</span>,
  'Trackon Couriers':      (p) => <span className={`font-bold ${sz[p.size] || sz.md} text-[#C8102E]`}>Trackon Couriers</span>,
  'Maruti Courier':        (p) => <span className={`font-bold ${sz[p.size] || sz.md} text-[#DC2626]`}>Maruti Courier</span>,
  'DHL':                   (p) => <DHLText {...p} />,
  'UPS':                   (p) => <span className={`font-black ${sz[p.size] || sz.md} text-[#351C15] tracking-tight`}>UPS</span>,
  'FedEx International': (p) => (
    <span className="inline-flex items-center gap-1">
      <FedExText size={p.size} />
      <span className={`${sz[p.size] || sz.md} font-semibold text-gray-600`}>International</span>
    </span>
  ),
}

export default function CourierBrandText({ name, size = 'md' }) {
  if (!name) return null
  const render = BRAND_RENDERERS[name]
  if (render) return render({ size })
  return <span className={`${sz[size] || sz.md} font-semibold text-gray-900`}>{name}</span>
}
