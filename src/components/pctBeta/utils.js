import {
  STAGE_CARDS,
  SKU_DETAILS_BY_SKU,
  ESCALATION_MATRIX_TIERS,
  CURRENT_USER_NAME,
} from './constants'

export function skuDetailSeed(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619)
  return h >>> 0
}

export function skuDetailGenerated(row) {
  const sku = row && row.sku ? String(row.sku) : '—'
  const po = row && row.po ? String(row.po) : ''
  const h = skuDetailSeed(`${po}|${sku}`)
  const vendorShort = (row && row.vendor ? String(row.vendor) : 'Vendor').split(/\s+/)[0] || 'Vendor'
  const materials = ['Mango wood', 'Iron', 'Ceramic', 'Glass', 'Jute blend', 'Cotton canvas', 'Brass', 'Recycled glass']
  const finishes = ['Natural', 'Rustic', 'Matt black', 'Whitewash', 'Antique brass', 'Clear glazed']
  const cats = ['Decor', 'Tabletop', 'Textiles', 'Lighting', 'Cookware', 'Garden']
  const dims = ['18 × 24 × 32 cm', 'Ø 28 × H 35 cm', '30 × 40 × 12 cm', '42 × 42 × 45 cm']
  const weights = ['0.8 kg', '1.4 kg', '2.2 kg', '3.6 kg', '8 kg']
  const cols = ['Natural', 'Black', 'Stone white', 'Terracotta', 'Slate grey']
  const qty = 80 + (h % 420)
  return {
    title: `${vendorShort} line — ${sku}`,
    category: cats[h % cats.length],
    material: materials[h % materials.length],
    finish: finishes[h % finishes.length],
    dimensions: dims[h % dims.length],
    weight: weights[h % weights.length],
    colour: cols[h % cols.length],
    orderQty: qty,
    buyerRef: `BR-${sku.replace(/\W/g, '').slice(-4) || '0000'}-${(h % 900) + 100}`,
    notes: `Tech pack ${po || '—'} · Ex-factory ${row && row.exf ? row.exf : '—'}.`,
  }
}

export function skuDetailForRow(row) {
  const snap = row?.plmSnapshot
  if (snap) {
    return {
      title: snap.description || snap.auto_code,
      category: snap.category || '',
      material: snap.material || '',
      finish: snap.finish || '',
      dimensions: snap.dimensions || '',
      weight: snap.weight || '',
      colour: snap.color || '',
      orderQty: snap.confirmed_qty ?? '',
      buyerRef: snap.buyer_ref || row.buyerRef || '',
      notes: snap.plm_url ? 'Open in PLM for full brief.' : '',
      imageUrl: snap.image_url || '',
      plmUrl: snap.plm_url || (row.workspaceId ? `/plm?workspace=${row.workspaceId}` : ''),
    }
  }
  const gen = skuDetailGenerated(row)
  const ov = row && row.sku ? SKU_DETAILS_BY_SKU[row.sku] : null
  return ov ? { ...gen, ...ov } : gen
}

export function variedCompletedTimestamp(seed) {
  const s = Math.abs(seed | 0)
  const day = 1 + (s % 27)
  const hour = 8 + (s % 12)
  const minute = (s * 17 + (s % 7)) % 60
  return `${String(day).padStart(2, '0')} Jan 2026 at ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

export function mapPOStageToStageCardId(stageName) {
  const s = (stageName || '').toLowerCase()
  if (s.includes('po receipt') || s.includes('lock')) return 'po'
  if (s.includes('tech pack')) return 'tech'
  if (s.includes('raw material')) return 'rm'
  if (s.includes('packaging')) return 'pack'
  if (s.includes('pp')) return 'pp'
  if (s.includes('bulk')) return 'bulk'
  if (s.includes('midline')) return 'midline'
  if (s.includes('inline')) return 'inline'
  if (s.includes('final')) return 'final'
  if (s.includes('dispatch') || s.includes('ship') || s.includes('ex-india')) return 'ship'
  return 'po'
}

export function getPOStageIndex(po) {
  const stageId = mapPOStageToStageCardId(po && po.stage ? po.stage : '')
  const idx = STAGE_CARDS.findIndex((s) => s.id === stageId)
  return idx >= 0 ? idx : 0
}

export function workflowLineKey(po) {
  if (!po) return ''
  if (po.pctLineId) return po.pctLineId
  if (!po.po) return ''
  const sku = po.sku != null ? String(po.sku) : ''
  return `${po.po}::${sku}::ws4`
}

export function lineEligibleForExcelExportLaneComplete(po) {
  if (!po || po.excelAllComplete !== true) return false
  const lastIdx = STAGE_CARDS.length - 1
  if (getPOStageIndex(po) !== lastIdx) return false
  if (po.risk === 'High' || po.risk === 'Medium') return false
  const v = po.delayDays
  const d = v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v)
  if (d !== null && d > 0) return false
  return true
}

export function delayDaysNumber(r) {
  const v = r && r.delayDays
  if (v === null || v === undefined || Number.isNaN(Number(v))) return null
  return Number(v)
}

export function riskOrder(risk) {
  if (risk === 'High') return 3
  if (risk === 'Medium') return 2
  return 1
}

export function representativeRowsByPO(rows) {
  const byPo = new Map()
  for (const r of rows) {
    const po = r.po
    const prev = byPo.get(po)
    if (!prev) { byPo.set(po, r); continue }
    const rp = riskOrder(r.risk), pp = riskOrder(prev.risk)
    let worse = prev
    if (rp > pp) worse = r
    else if (rp === pp) {
      const dr = delayDaysNumber(r) ?? -Infinity
      const dp = delayDaysNumber(prev) ?? -Infinity
      if (dr > dp) worse = r
    }
    byPo.set(po, worse)
  }
  return Array.from(byPo.values())
}

export function worstRowForPo(po, poRows) {
  const lines = poRows.filter((r) => r.po === po)
  if (!lines.length) return null
  return lines.reduce((best, r) => {
    const br = riskOrder(r.risk), bb = riskOrder(best.risk)
    if (br > bb) return r
    if (br < bb) return best
    const dr = delayDaysNumber(r) ?? -Infinity
    const db = delayDaysNumber(best) ?? -Infinity
    return dr > db ? r : best
  })
}

export function getEscalationTier(delayDays, risk) {
  const [t2, t4, t7, critical] = ESCALATION_MATRIX_TIERS
  const d = delayDays === null || delayDays === undefined || Number.isNaN(Number(delayDays)) ? null : Number(delayDays)
  if (risk === 'High') return critical
  if (d === null || d <= 0) return null
  if (d > 10) return critical
  if (d >= t7.minDays) return t7
  if (d >= t4.minDays) return t4
  if (d >= t2.minDays) return t2
  return t2
}

export function getVendorColor(vendor) {
  const colors = {
    'Ramchander Exports': '#c53030',
    'Art Asia': '#2b6cb0',
    'PM Overseas': '#2d6a4f',
    'Dynamic Décor': '#7c3aed',
    'M.S. IMPEX': '#b45309',
    'Creative V Collection': '#0e7490',
    'Demo Vendor': '#475569',
  }
  return colors[vendor]
    || '#' + (vendor || 'V').split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) & 0xffffff, 0x556677).toString(16).padStart(6, '0')
}

export function getVendorInitials(vendor) {
  if (!vendor) return 'V'
  const parts = vendor.split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return vendor.substring(0, 2).toUpperCase()
}

export function getBuyerColor(buyer) {
  const colors = { Nkuku: '#2d6a4f', 'M&S': '#1e40af', NEXT: '#374151' }
  return colors[buyer] || '#475569'
}

export function getBuyerInitials(buyer) {
  if (!buyer) return '?'
  if (buyer === 'M&S') return 'M&S'
  return buyer.substring(0, 2).toUpperCase()
}

export function guessBuyer(r) {
  if (!r || !r.po) return 'NK'
  const po = r.po.toUpperCase()
  if (po.includes('M&S') || (r.owner && r.owner.includes('M&S'))) return 'M&S'
  const h = po.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  const buyers = ['Nkuku', 'M&S', 'NEXT']
  return buyers[h % buyers.length]
}

export function timestampNow() {
  return new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function activityTimestampNow() {
  return new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(',', '')
}

export function formatChatTimestamp(ts) {
  if (!ts) return ''
  return ts.replace(/\s+\d{4},/, ',')
}

export function buildDashboardEscalationAlerts(poRows, limit = 200) {
  const candidates = representativeRowsByPO(poRows).filter((r) => getEscalationTier(delayDaysNumber(r), r.risk) !== null)
  const sorted = candidates.slice().sort((a, b) => {
    const ta = getEscalationTier(delayDaysNumber(a), a.risk)
    const tb = getEscalationTier(delayDaysNumber(b), b.risk)
    const rankDiff = tb.order - ta.order || (delayDaysNumber(b) || 0) - (delayDaysNumber(a) || 0)
    if (rankDiff !== 0) return rankDiff
    return riskOrder(b.risk) - riskOrder(a.risk)
  })
  return sorted.slice(0, limit).map((r) => {
    const d = delayDaysNumber(r)
    const tier = getEscalationTier(d, r.risk)
    const delayPart = d !== null && d > 0 ? `${Math.round(d)}d delayed · ` : ''
    const title = (delayPart + (r.claim || 'Review line')).slice(0, 140)
    const due = r.exf && r.exf !== '—' ? `EWD ${r.exf}` : 'Date TBC'
    return { severity: tier.severity, matrixTrigger: tier.matrixTrigger, title, po: `${r.po} · ${r.sku}`, owner: tier.ownerLabel, due, action: tier.actionLabel }
  })
}

export function createInitialStageProgressForPO(po) {
  const lineKey = `${po && po.po ? po.po : ''}|${po && po.sku != null ? po.sku : ''}`
  const poSeed = lineKey.split('').reduce((a, ch) => a + ch.charCodeAt(0), 0)
  const idx = getPOStageIndex(po)

  if (lineEligibleForExcelExportLaneComplete(po)) {
    return STAGE_CARDS.reduce((acc, s, cardIdx) => {
      acc[s.id] = {
        status: 'completed',
        timestamp: `Checked by ${CURRENT_USER_NAME} · ${variedCompletedTimestamp(poSeed + cardIdx * 131)}`,
      }
      return acc
    }, {})
  }

  return STAGE_CARDS.reduce((acc, s, cardIdx) => {
    const status = cardIdx < idx ? 'completed' : cardIdx === idx ? 'active' : 'pending'
    acc[s.id] = {
      status,
      timestamp:
        status === 'completed'
          ? `Checked by ${CURRENT_USER_NAME} · ${variedCompletedTimestamp(poSeed + cardIdx * 131)}`
          : status === 'active' ? 'Current stage from tracker row (SKU)' : 'Not moved yet',
    }
    return acc
  }, {})
}

export function createInitialStageChecksForPO(progress, po) {
  const lineKey = `${po && po.po ? po.po : ''}|${po && po.sku != null ? po.sku : ''}`
  const poSeed = lineKey.split('').reduce((a, ch) => a + ch.charCodeAt(0), 0)
  return STAGE_CARDS.reduce((acc, s, stageIdx) => {
    const isCompleted = progress[s.id] && progress[s.id].status === 'completed'
    acc[s.id] = s.checks.map((_, checkIdx) => ({
      done: isCompleted,
      by: isCompleted ? CURRENT_USER_NAME : '',
      ts: isCompleted ? variedCompletedTimestamp(poSeed + stageIdx * 97 + checkIdx * 11) : '',
    }))
    return acc
  }, {})
}
