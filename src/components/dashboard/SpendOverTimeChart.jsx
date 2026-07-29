import React, { useRef } from 'react'

const SVG_WIDTH = 400
const SVG_HEIGHT = 220
const CHART_X = 40
const CHART_Y = 30
const CHART_WIDTH = 355
const CHART_HEIGHT = 150
const BAR_WIDTH = 16
const Y_TICKS = 4

export default function SpendOverTimeChart({ data }) {
  const [clickedIndex, setClickedIndex] = React.useState(null)
  const [hoverIndex, setHoverIndex] = React.useState(null)
  const lastClickRef = useRef(0)

  const points = Array.isArray(data) && data.length ? data : []

  const maxValue = React.useMemo(() => {
    if (!points.length) return 1
    return Math.ceil(Math.max(...points.map((d) => d.value)) / 100000) * 100000
  }, [points])

  const totalSpacing = points.length ? CHART_WIDTH / points.length : CHART_WIDTH

  const handleClick = (index) => {
    setClickedIndex((prev) => (prev === index ? null : index))
    lastClickRef.current = Date.now()
  }

  const handleHover = (index) => {
    if (Date.now() - lastClickRef.current < 50) return
    setHoverIndex(index)
  }

  const handleMouseOut = () => setHoverIndex(null)

  const renderYAxis = () => {
    const els = []
    for (let i = 0; i <= Y_TICKS; i++) {
      const value = (maxValue / Y_TICKS) * i
      const yPos = CHART_Y + CHART_HEIGHT - (value / maxValue) * CHART_HEIGHT
      els.push(
        <text
          key={`y-${i}`}
          x={CHART_X - 8}
          y={yPos + 4}
          textAnchor="end"
          fill="#6c757d"
          fontSize="12"
        >
          ${Math.round(value / 1000)}K
        </text>
      )
      if (i > 0) {
        els.push(
          <line
            key={`grid-${i}`}
            x1={CHART_X}
            y1={yPos}
            x2={CHART_X + CHART_WIDTH}
            y2={yPos}
            stroke="#E5E7EB"
            strokeWidth="1"
            strokeDasharray="2,3"
          />
        )
      }
    }
    return els
  }

  const bars = []
  const xLabels = []
  points.forEach((d, i) => {
    const barHeight = (d.value / maxValue) * CHART_HEIGHT
    const xPos = CHART_X + i * totalSpacing + (totalSpacing - BAR_WIDTH) / 2
    const yPos = CHART_Y + CHART_HEIGHT - barHeight
    const isClicked = i === clickedIndex
    const isHovered = i === hoverIndex
    let fill = '#E5E7EB'
    if (isClicked) fill = 'rgba(208, 98, 30, 1)'
    else if (isHovered) fill = 'rgba(208, 98, 30, 0.6)'

    bars.push(
      <rect
        key={`bar-${i}`}
        x={xPos}
        y={yPos}
        width={BAR_WIDTH}
        height={barHeight}
        fill={fill}
        rx={4}
        onClick={() => handleClick(i)}
        onMouseOver={() => handleHover(i)}
        onMouseOut={handleMouseOut}
        style={{ cursor: 'pointer' }}
      />
    )
    xLabels.push(
      <text
        key={`x-${i}`}
        x={xPos + BAR_WIDTH / 2}
        y={CHART_Y + CHART_HEIGHT + 20}
        textAnchor="middle"
        fill="#6c757d"
        fontSize="12"
      >
        {d.label}
      </text>
    )
  })

  const tooltipFor = (index) => {
    if (index == null || !points[index]) return null
    const d = points[index]
    const barHeight = (d.value / maxValue) * CHART_HEIGHT
    const xPos = CHART_X + index * totalSpacing + (totalSpacing - BAR_WIDTH) / 2
    const yPos = CHART_Y + CHART_HEIGHT - barHeight
    const text = d.tooltipText ?? String(d.value)
    const tw = text.length * 7.5 + 20
    const th = 28
    let tx = xPos + BAR_WIDTH / 2 - tw / 2
    const ty = yPos - th - 8
    const pad = 5
    if (tx < pad) tx = pad
    else if (tx + tw > SVG_WIDTH - pad) tx = SVG_WIDTH - tw - pad
    return (
      <g key={`tt-${index}`} style={{ pointerEvents: 'none' }}>
        <rect x={tx} y={ty} width={tw} height={th} rx={4} fill="black" fillOpacity="0.9" />
        <polygon
          points={`${xPos + BAR_WIDTH / 2 - 5},${ty + th} ${xPos + BAR_WIDTH / 2},${ty + th + 5} ${xPos + BAR_WIDTH / 2 + 5},${ty + th}`}
          fill="black"
          fillOpacity="0.9"
        />
        <text
          x={tx + tw / 2}
          y={ty + th / 2 + 5}
          textAnchor="middle"
          fill="white"
          fontSize="12"
          fontWeight="500"
        >
          {text}
        </text>
      </g>
    )
  }

  const tooltips = []
  if (clickedIndex != null) tooltips.push(tooltipFor(clickedIndex))
  if (hoverIndex != null && hoverIndex !== clickedIndex) tooltips.push(tooltipFor(hoverIndex))

  return (
    <div className="w-full h-56">
      <svg
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        className="w-full h-full"
      >
        <g>{renderYAxis()}</g>
        <g>{bars}</g>
        <g>{xLabels}</g>
        {tooltips}
      </svg>
    </div>
  )
}
