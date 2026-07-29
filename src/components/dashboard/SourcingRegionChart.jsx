import { useState, useCallback, useMemo } from "react";

// ─── helpers ──────────────────────────────────────────────────────────────────

const PALETTE = [
  "#4285F4","#34A853","#FBBC05","#EA4335","#9E9E9E",
  "#AB47BC","#00ACC1","#FF7043","#F06292","#AED581",
];

function fmtVal(v) {
  if (v >= 1e6) return "$" + (v / 1e6).toFixed(1) + "M";
  if (v >= 1e3) return "$" + (v / 1e3).toFixed(0) + "K";
  return "$" + v;
}

// ─── 3-D pie geometry ─────────────────────────────────────────────────────────

const W = 420, H = 320;
const CX = 220, CY = 140;
const RX = 115, RY = 55;
const DEPTH = 20;

function toXY(angle) {
  return [CX + RX * Math.cos(angle), CY + RY * Math.sin(angle)];
}

function buildAngles(chartData) {
  const total = chartData.reduce((s, d) => s + d.value, 0);
  if (!total) return { angles: [], total };

  const sorted = [...chartData].filter(d => d.value > 0).sort((a, b) => b.value - a.value);
  const angles = [];
  let cum = -Math.PI / 2;
  sorted.forEach(item => {
    const sweep = (item.value / total) * 2 * Math.PI;
    angles.push({ item, start: cum, end: cum + sweep, sweep });
    cum += sweep;
  });
  return { angles, total };
}

function buildLabelPositions(angles, total) {
  const labelData = angles.map(({ item, start, end }, i) => {
    const mid      = (start + end) / 2;
    const pct      = Math.round((item.value / total) * 100);
   const topBoost = Math.sin(mid) < -0.5 ? 18 : 0;
const lx = CX + (RX + 55 + topBoost) * Math.cos(mid);
const ly = CY + (RY + 48 + topBoost) * Math.sin(mid);
    const depthOffset = Math.sin(mid) > 0 ? DEPTH * 0.5 : 0; // push down for front slices
 const edgeBoost = pct < 0.05 ? 1.18 : 1.02;  // ← here, pct is already computed
  const ex       = CX + RX * edgeBoost * Math.cos(mid);
  const ey       = CY + RY * edgeBoost * Math.sin(mid);
    const anchor   = Math.cos(mid) > 0.15 ? "start" : Math.cos(mid) < -0.15 ? "end" : "middle";
    const short    = item.label.length > 13 ? item.label.substring(0, 12) + "…" : item.label;
    return { item, mid, lx, ly, ex, ey, anchor, pct, short, i };
  }).filter(d => d.item.value / total >= 0.01);



  // collision nudge
 const TOP_ZONE = -0.6; // sin(mid) < this = "top" labels
const topLabels  = labelData.filter(d => Math.sin(d.mid) < TOP_ZONE);
const sideLabels = labelData.filter(d => Math.sin(d.mid) >= TOP_ZONE);

// Fan top labels evenly across the top, sorted left-to-right by angle
topLabels.sort((a, b) => a.mid - b.mid);
const topCount = topLabels.length;
topLabels.forEach((d, idx) => {
  const spread = 300;
  const startX = CX - spread / 2;
  d.lx = startX + (idx + 0.5) * (spread / topCount);
  d.ly = CY - RY - 62 - Math.floor(idx % 2) * 16;
});

// Light collision nudge only for side labels
const MIN_GAP = 19;
for (let pass = 0; pass < 8; pass++) {
  for (let a = 0; a < sideLabels.length; a++) {
    for (let b = a + 1; b < sideLabels.length; b++) {
      const la = sideLabels[a], lb = sideLabels[b];
      if (Math.abs(la.lx - lb.lx) < 85 && Math.abs(la.ly - lb.ly) < MIN_GAP) {
        const push = (MIN_GAP - Math.abs(la.ly - lb.ly)) / 2 + 2;
        if (la.ly <= lb.ly) { la.ly -= push; lb.ly += push; }
        else                { la.ly += push; lb.ly -= push; }
      }
    }
  }
}
  labelData.forEach(d => {
  if (d.ly < CY && Math.abs(d.lx - CX) < 30)
    d.lx += Math.cos(d.mid) >= 0 ? 35 : -35;
});

  return labelData;
}

// ─── sub-components ───────────────────────────────────────────────────────────

function PieSides({ angles }) {
  return (
    <g>
      {angles.map(({ item, start, end }, i) => {
        const sweep = end - start;
        // Full circle: draw the front-half cylinder wall explicitly
        if (Math.abs(sweep - 2 * Math.PI) < 0.001) {
          const rx1 = CX + RX, ry1 = CY;
          const lx1 = CX - RX, ly1 = CY;
          return (
            <path
              key={i}
              d={`M${rx1} ${ry1} L${rx1} ${ry1 + DEPTH} A${RX} ${RY} 0 0 1 ${lx1} ${ly1 + DEPTH} L${lx1} ${ly1} A${RX} ${RY} 0 0 0 ${rx1} ${ry1} Z`}
              fill={item.color + "BB"}
              stroke="white"
              strokeWidth="0.5"
            />
          );
        }
        const mid = (start + end) / 2;
        if (Math.sin(mid) < -0.5) return null;
        const [x1, y1] = toXY(start);
        const [x2, y2] = toXY(end);
        const largeArc  = sweep > Math.PI ? 1 : 0;
        return (
          <path
            key={i}
            d={`M${x1} ${y1} L${x1} ${y1 + DEPTH}
                A${RX} ${RY} 0 ${largeArc} 1 ${x2} ${y2 + DEPTH}
                L${x2} ${y2} A${RX} ${RY} 0 ${largeArc} 0 ${x1} ${y1} Z`}
            fill={item.color + "BB"}
            stroke="white"
            strokeWidth="0.5"
          />
        );
      })}
    </g>
  );
}

function PieTops({ angles, hovered, onEnter, onLeave }) {
  return (
    <g>
      {angles.map(({ item, start, end, sweep }, i) => {
        const mid = (start + end) / 2;
        const tx  = hovered === i ? Math.cos(mid) * 7 : 0;
        const ty  = hovered === i ? Math.sin(mid) * 7 : 0;
        // Full circle: SVG arc with identical start/end degenerates to a line
        if (Math.abs(sweep - 2 * Math.PI) < 0.001) {
          return (
            <g
              key={i}
              style={{ cursor: "pointer", transform: `translate(${tx}px,${ty}px)`, transition: "transform 0.18s ease" }}
              onMouseEnter={() => onEnter(i)}
              onMouseLeave={onLeave}
            >
              <ellipse cx={CX} cy={CY} rx={RX} ry={RY} fill={item.color} stroke="white" strokeWidth="1.2" />
            </g>
          );
        }
        const [x1, y1] = toXY(start);
        const [x2, y2] = toXY(end);
        const largeArc = sweep > Math.PI ? 1 : 0;
        return (
          <g
            key={i}
            style={{
              cursor: "pointer",
              transform: `translate(${tx}px,${ty}px)`,
              transition: "transform 0.18s ease",
            }}
            onMouseEnter={() => onEnter(i)}
            onMouseLeave={onLeave}
          >
            <path
              d={`M${CX} ${CY} L${x1} ${y1} A${RX} ${RY} 0 ${largeArc} 1 ${x2} ${y2} Z`}
              fill={item.color}
              stroke="white"
              strokeWidth="1.2"
            />
          </g>
        );
      })}
    </g>
  );
}

function PieLabels({ labelData }) {
  return (
    <g>
      {labelData.map((d, i) => (
        <g key={i} style={{ pointerEvents: "none" }}>
          <line
            x1={d.ex} y1={d.ey} x2={d.lx} y2={d.ly + 4}
            stroke={d.item.color} strokeWidth="1" opacity="0.5"
          />
          <text
            x={d.lx} y={d.ly}
            textAnchor={d.anchor}
            fill={d.item.color}
            fontSize="8.5"
            fontWeight="600"
          >
            {d.short}
          </text>
          <text
            x={d.lx} y={d.ly + 11}
            textAnchor={d.anchor}
            fill="#555"
            fontSize="8"
          >
            {d.pct}%
          </text>
        </g>
      ))}
    </g>
  );
}

function PieTooltip({ angles, total, hovered }) {
  if (hovered === null || !angles[hovered]) return null;
  const seg = angles[hovered];
  const pct = ((seg.item.value / total) * 100).toFixed(1);
  const mid = (seg.start + seg.end) / 2;
  const tx  = Math.max(10, Math.min(CX + Math.cos(mid) * 90 - 80, 235));

  if (seg.item.subItems?.length > 0) {
    const sub   = seg.item.subItems;
    const W_TIP = 178;
    const ROW_H = 13;
    const H_TIP = 24 + sub.length * ROW_H + 6;
    const ty    = Math.max(5, CY + Math.sin(mid) * 60 - H_TIP);
    return (
      <g transform={`translate(${tx},${ty})`} style={{ pointerEvents: "none" }}>
        <rect x="0" y="0" width={W_TIP} height={H_TIP} rx="6" fill="rgba(20,20,20,0.93)" />
        <text x={W_TIP / 2} y="15" textAnchor="middle" fill="white" fontSize="8.5" fontWeight="600">
          {`Others (${sub.length}) — ${pct}% · ${fmtVal(seg.item.value)}`}
        </text>
        {sub.map((item, i) => {
          const name = item.label.length > 22 ? item.label.substring(0, 21) + "…" : item.label;
          return (
            <text key={i} x="8" y={26 + i * ROW_H} fill="#ccc" fontSize="7.5">
              {`${name} — ${fmtVal(item.value)}`}
            </text>
          );
        })}
      </g>
    );
  }

  const ty   = Math.max(5, CY + Math.sin(mid) * 60 - 60);
  const name = seg.item.label.length > 20 ? seg.item.label.substring(0, 19) + "…" : seg.item.label;
  return (
    <g transform={`translate(${tx},${ty})`} style={{ pointerEvents: "none" }}>
      <rect x="0" y="0" width="155" height="44" rx="6" fill="rgba(20,20,20,0.9)" />
      <text x="77" y="15" textAnchor="middle" fill="white"   fontSize="9"   fontWeight="600">{name}</text>
      <text x="77" y="28" textAnchor="middle" fill="#aaa"    fontSize="8.5"             >{fmtVal(seg.item.value)}</text>
      <text x="77" y="40" textAnchor="middle" fill="#66bb6a" fontSize="8"   fontWeight="600">{pct}% of total</text>
    </g>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

/**
 * SourcingRegionChart
 *
 * Props
 * ─────
 * countryData  { origin: string, value: number }[]
 * clientData   { client: string, value: number }[]
 * defaultMode  "country" | "client"   (default: "country")
 *
 * countryData  comes from your `dynamicData` array (origin + value).
 * clientData   comes from `volumeShippedData.clientData` (client + value).
 */
// SourcingRegionChart.jsx — change the props signature
export default function SourcingRegionChart({ sourcingList = [], sourcingMode, setSourcingMode }) {
  const [hovered, setHovered] = useState(null);

  const onEnter  = useCallback(idx => setHovered(idx), []);
  const onLeave  = useCallback(()  => setHovered(null), []);

  const chartData = useMemo(() => {
    const items = sourcingList
      .filter(d => d.value > 0)
      .map((d, i) => ({
        label: d.client || d.region,
        value: d.value,
        color: d.color || PALETTE[i % PALETTE.length],
      }))

    const total = items.reduce((s, d) => s + d.value, 0)
    if (!total) return []

    const main = [], others = []
    items.forEach(item => {
      if (item.value / total >= 0.025) main.push(item)
      else others.push(item)
    })

    const data = main.map((item, i) => ({ ...item, color: PALETTE[i % PALETTE.length] }))
    if (others.length > 0) {
      data.push({
        label: `Others (${others.length})`,
        value: others.reduce((s, d) => s + d.value, 0),
        color: "#BDBDBD",
        subItems: others,
      })
    }
    return data
  }, [sourcingList])
  const { angles, total } = buildAngles(chartData);
  const labelData  = total ? buildLabelPositions(angles, total) : [];

  const isEmpty = !total;

  return (
    <div>
      {/* chart body */}
      {isEmpty ? (
        <div style={{ padding: "2em", textAlign: "center", color: "var(--color-text-secondary,#888)", fontSize: 13 }}>
          No data
        </div>
      ) : (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          style={{ display: "block", overflow: "visible" }}
          role="img"
          aria-label={`3D pie chart of sourcing by ${sourcingMode}`}
        >
          <PieSides  angles={angles} />
          <PieTops   angles={angles} hovered={hovered} onEnter={onEnter} onLeave={onLeave} />
          <PieLabels labelData={labelData} />
          <PieTooltip angles={angles} total={total} hovered={hovered} />
        </svg>
      )}
    </div>
  );
}