// Stage cards, exception cards, escalation matrix, account/buyer/tab lists, alert dependency maps.
// Ported faithfully from public/pct-beta.html.

export const CURRENT_USER_NAME = 'Nikhil Mehta'
export const CURRENT_USER_ROLE = 'merchant'

export const REAL_DATA = (() => {
  const totalPOs = 105
  const totalLineItems = 1982
  const totalVendors = 26
  const totalValue = 194663
  const totalQty = 89228
  const shippedQty = 17138
  const balanceQty = 114
  const onTime = 592
  const beforeTime = 66
  const delayed = 101
  const otif = Math.round(((onTime + beforeTime) / (onTime + beforeTime + delayed)) * 100)
  return { totalPOs, totalLineItems, totalVendors, totalValue, totalQty, shippedQty, balanceQty, onTime, beforeTime, delayed, otif }
})()

export const PO_DEMO_ROW = {
  po: 'PO-DEMO-001',
  sku: 'SKU-DEMO-01',
  vendor: 'Demo Vendor',
  exf: '30 Jun 2026',
  stage: 'PO Receipt & Lock',
  risk: 'Low',
  claim: 'Demo PO — workflow starts at stage 1',
  owner: 'Merchant',
  styles: 1,
  excelAllComplete: false,
  delayDays: null,
}

export const SKU_DETAILS_BY_SKU = {
  'SKU-DEMO-01': {
    title: 'Demo article',
    category: 'Homeware',
    material: 'Mixed',
    finish: 'As approved',
    dimensions: '—',
    weight: '—',
    colour: '—',
    orderQty: 120,
    buyerRef: 'DEMO-REF',
    notes: 'Demo PO row — use workflow stages from PO Receipt.',
  },
  AS0201: {
    title: 'Reclaimed iron kadai with grill',
    category: 'Cookware / metal',
    material: 'Iron',
    finish: 'Rustic',
    dimensions: 'Ø 45 cm · H 12 cm',
    weight: '10 kg',
    colour: 'Natural iron',
    orderQty: 480,
    buyerRef: 'AFG-101',
    notes: 'Buyer reference visuals in Reference Media.',
  },
  AS0202: {
    title: 'Reclaimed iron kadai (compact)',
    category: 'Cookware / metal',
    material: 'Iron',
    finish: 'Rustic',
    dimensions: 'Ø 38 cm · H 11 cm',
    weight: '7.5 kg',
    colour: 'Natural iron',
    orderQty: 360,
    buyerRef: 'AFG-102',
    notes: 'Pairs with AS0201 on shelf.',
  },
}

export const STAGE_CARDS = [
  { id: 'po', title: 'PO Receipt & Lock', owner: 'Merchant', sla: '0–1 day', status: 'active',
    checks: ['Buyer PO uploaded', 'Tech pack attached', 'Price lock created', 'Ex-factory date locked'],
    alerts: ['PO vs cost sheet mismatch', 'Missing tech pack', 'Currency mismatch'] },
  { id: 'tech', title: 'Tech Pack Validation', owner: 'Merchant + QA', sla: '1–3 days', status: 'pending',
    checks: ['Size tolerance', 'Weight tolerance', 'Material / finish', 'Color code / artwork', 'Approved reference sample'],
    alerts: ['Size spec missing', 'Weight missing', 'Artwork not approved', 'Spec changed after PO'] },
  { id: 'rm', title: 'Raw Material Indent', owner: 'Factory + Sourcing', sla: '3–7 days', status: 'pending',
    checks: ['BOM freeze', 'RM quantity', 'Lead time', 'RM costing', 'Alternative source'],
    alerts: ['RM delay', 'RM cost variance >3%', 'Material grade mismatch', 'Insufficient stock'] },
  { id: 'pack', title: 'Packaging Indent', owner: 'Merchant + Factory', sla: '3–7 days', status: 'pending',
    checks: ['Barcode approved', 'Shipping marks', 'Drop test protocol', 'Label legal text', 'Master carton spec'],
    alerts: ['Barcode mismatch', 'Label compliance missing', 'Carton gsm mismatch'] },
  { id: 'pp', title: 'PP Meeting & Sample Approval', owner: 'Merchant + QA + Factory', sla: '7–15 days', status: 'pending',
    checks: ['PP date', 'Inline date', 'Midline date', 'Final insp. date', 'Buyer comments closure'],
    alerts: ['PP sample pending', 'No approval', 'Critical comments open'] },
  { id: 'bulk', title: 'Bulk Production', owner: 'Factory', sla: '15–60 days', status: 'pending',
    checks: ['Line allocation', 'Daily output', 'WIP variance', 'Rework log'],
    alerts: ['Output lag', 'Capacity overload', 'Tech spec drift'] },
  { id: 'inline', title: 'Inline QC', owner: 'QA', sla: '20–35 days', status: 'pending',
    checks: ['Workmanship', 'Size & weight', 'Finish'],
    alerts: ['AQL risk', 'Size drift'] },
  { id: 'midline', title: 'Midline QC', owner: 'QA', sla: '35–50 days', status: 'pending',
    checks: ['Packing method', 'Corrective action'],
    alerts: ['Wrong finish', 'Wrong accessories'] },
  { id: 'final', title: 'Final QC & Documentation', owner: 'QA + Merchant + Logistics', sla: '60–75 days', status: 'pending',
    checks: ['Final inspection', 'Invoice check', 'Packing list', 'HS code', 'Value check'],
    alerts: ['Wrong price in invoice', 'Qty mismatch', 'Inspection outcome', 'Shipment without docs'] },
  { id: 'ship', title: 'Stuffing, Dispatch & Ex-India', owner: 'Logistics', sla: '75–90+ days', status: 'pending',
    checks: ['Container booking', 'Stuffing confirmation', 'BL readiness', 'ETD lock'],
    alerts: ['Missed vessel', 'Late cargo readiness', 'BL delay'] },
]

export const TABS = [
  { key: 'dashboard', label: 'Control Tower', icon: 'dashboard' },
  { key: 'workflow', label: 'Stage Workflow', icon: 'workflow' },
  { key: 'exceptions', label: 'Exception Engine', icon: 'alert' },
  { key: 'po360', label: 'PO 360', icon: 'clipboard' },
  { key: 'indents', label: 'RM & Packaging', icon: 'boxes' },
  { key: 'qc', label: 'QC & Compliance', icon: 'shield' },
  { key: 'claims', label: 'Claims Prevention', icon: 'filecheck' },
]

export const NAV_MAIN_TABS = [
  { key: 'dashboard', label: 'Control Tower', icon: 'dashboard', badge: 11 },
  { key: 'workflow', label: 'Stage Workflow', icon: 'workflow', badge: 105 },
]
export const NAV_EXEC_TABS = [
  { key: 'exceptions', label: 'Exception Engine', icon: 'alert', badge: 3 },
  { key: 'po360', label: 'PO 360', icon: 'clipboard', badge: null },
  { key: 'qc', label: 'QC & Compliance', icon: 'shield', badge: null },
  { key: 'claims', label: 'Claims Prevention', icon: 'filecheck', badge: null },
]
export const NAV_BUYERS = [
  { initials: 'NK', name: 'Nkuku', color: '#2d6a4f' },
  { initials: 'SU', name: 'Sugarboo Designs INC', color: '#1e3a8a' },
  { initials: 'EL', name: 'ELOQUENCE', color: '#0f766e' },
  { initials: 'NO', name: 'NORDAL A/S', color: '#7c2d12' },
  { initials: 'DE', name: 'DESIGNLAB EVENTS FZ-LLC', color: '#4c1d95' },
  { initials: 'OL', name: 'OLIVE ATELIERS INC', color: '#14532d' },
  { initials: 'AB', name: 'ABIGAIL AHERN', color: '#7f1d1d' },
  { initials: 'RE', name: 'REED SMYTHE & COMPANY', color: '#1d4ed8' },
  { initials: 'VO', name: 'V.O.F. Lumiere', color: '#334155' },
  { initials: 'SD', name: 'SUNDANCE', color: '#9a3412' },
  { initials: 'DI', name: 'DINNERWARE & CO B.V', color: '#0f766e' },
  { initials: 'GH', name: 'GARNET HILL', color: '#1e40af' },
  { initials: 'EP', name: 'EPOCA INTERNATIONAL INC.', color: '#7c3aed' },
  { initials: 'DB', name: 'DESERET BOOK COMPANY', color: '#a16207' },
  { initials: 'LB', name: 'M/s. LIFETIME BRANDS', color: '#475569' },
  { initials: 'PE', name: 'PELTRINA S.A', color: '#166534' },
  { initials: 'CC', name: 'CUADRA CREATIVA S.A', color: '#831843' },
  { initials: 'KR', name: 'Kravet Inc', color: '#0369a1' },
  { initials: 'IN', name: 'INV HOME', color: '#1f2937' },
  { initials: 'UF', name: 'UPHOLSTERY & FABRICS STORES INC', color: '#065f46' },
  { initials: 'JY', name: 'JAMIE YOUNG COMPANY', color: '#4338ca' },
  { initials: 'KS', name: 'KIM Seybert INC', color: '#b91c1c' },
  { initials: 'NL', name: 'NKUKU Ltd', color: '#166534' },
  { initials: 'JA', name: 'JONATHAN ADLER', color: '#312e81' },
  { initials: 'FC', name: 'FC INTERIORS SRL', color: '#075985' },
  { initials: 'AR', name: 'AREO INC', color: '#854d0e' },
  { initials: 'NS', name: 'Nickel & Suede, LLC', color: '#3f3f46' },
  { initials: 'BB', name: 'BALANCE & BLOOM', color: '#134e4a' },
  { initials: 'SH', name: 'SHASTRA HOME', color: '#78350f' },
  { initials: 'JO', name: 'JOEL', color: '#111827' },
  { initials: 'SL', name: 'Society of Lifestyle APS', color: '#0c4a6e' },
  { initials: 'RA', name: 'RECREATED ART AND SOUL', color: '#7e22ce' },
]

export const ACCOUNTS = [
  { initials: 'NK', name: 'Nkuku', category: 'Home Category', color: '#2d6a4f' },
  { initials: 'SU', name: 'Sugarboo Designs INC', category: 'Buyer Account', color: '#1e3a8a' },
  { initials: 'EL', name: 'ELOQUENCE', category: 'Buyer Account', color: '#0f766e' },
  { initials: 'NO', name: 'NORDAL A/S', category: 'Buyer Account', color: '#7c2d12' },
  { initials: 'DE', name: 'DESIGNLAB EVENTS FZ-LLC', category: 'Buyer Account', color: '#4c1d95' },
  { initials: 'OL', name: 'OLIVE ATELIERS INC', category: 'Buyer Account', color: '#14532d' },
  { initials: 'AB', name: 'ABIGAIL AHERN', category: 'Buyer Account', color: '#7f1d1d' },
  { initials: 'RE', name: 'REED SMYTHE & COMPANY', category: 'Buyer Account', color: '#1d4ed8' },
  { initials: 'VO', name: 'V.O.F. Lumiere', category: 'Buyer Account', color: '#334155' },
  { initials: 'SD', name: 'SUNDANCE', category: 'Buyer Account', color: '#9a3412' },
  { initials: 'DI', name: 'DINNERWARE & CO B.V', category: 'Buyer Account', color: '#0f766e' },
  { initials: 'GH', name: 'GARNET HILL', category: 'Buyer Account', color: '#1e40af' },
  { initials: 'EP', name: 'EPOCA INTERNATIONAL INC.', category: 'Buyer Account', color: '#7c3aed' },
  { initials: 'DB', name: 'DESERET BOOK COMPANY', category: 'Buyer Account', color: '#a16207' },
  { initials: 'LB', name: 'M/s. LIFETIME BRANDS', category: 'Buyer Account', color: '#475569' },
  { initials: 'PE', name: 'PELTRINA S.A', category: 'Buyer Account', color: '#166534' },
  { initials: 'CC', name: 'CUADRA CREATIVA S.A', category: 'Buyer Account', color: '#831843' },
  { initials: 'KR', name: 'Kravet Inc', category: 'Buyer Account', color: '#0369a1' },
  { initials: 'IN', name: 'INV HOME', category: 'Buyer Account', color: '#1f2937' },
  { initials: 'UF', name: 'UPHOLSTERY & FABRICS STORES INC', category: 'Buyer Account', color: '#065f46' },
  { initials: 'JY', name: 'JAMIE YOUNG COMPANY', category: 'Buyer Account', color: '#4338ca' },
  { initials: 'KS', name: 'KIM Seybert INC', category: 'Buyer Account', color: '#b91c1c' },
  { initials: 'NL', name: 'NKUKU Ltd', category: 'Buyer Account', color: '#166534' },
  { initials: 'JA', name: 'JONATHAN ADLER', category: 'Buyer Account', color: '#312e81' },
  { initials: 'FC', name: 'FC INTERIORS SRL', category: 'Buyer Account', color: '#075985' },
  { initials: 'AR', name: 'AREO INC', category: 'Buyer Account', color: '#854d0e' },
  { initials: 'NS', name: 'Nickel & Suede, LLC', category: 'Buyer Account', color: '#3f3f46' },
  { initials: 'BB', name: 'BALANCE & BLOOM', category: 'Buyer Account', color: '#134e4a' },
  { initials: 'SH', name: 'SHASTRA HOME', category: 'Buyer Account', color: '#78350f' },
  { initials: 'JO', name: 'JOEL', category: 'Buyer Account', color: '#111827' },
  { initials: 'SL', name: 'Society of Lifestyle APS', category: 'Buyer Account', color: '#0c4a6e' },
  { initials: 'RA', name: 'RECREATED ART AND SOUL', category: 'Buyer Account', color: '#7e22ce' },
]

export const GLOBAL_TOPBAR_TABS = [
  { key: 'dashboard', label: 'Control Tower' },
  { key: 'po360', label: 'PO 360' },
  { key: 'qc', label: 'QC & Compliance' },
  { key: 'workflow', label: 'Stage Workflow' },
]

export const STAGE_DUMMY_ATTACHMENTS = {
  po: [
    { name: 'PO_Copy.pdf', url: 'data:text/plain;charset=utf-8,PO%20copy%20dummy%20document' },
    { name: 'Cost_Sheet.png', url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="420" height="260"><rect width="100%" height="100%" fill="%23eff6ff"/><text x="20" y="40" fill="%231e3a8a" font-size="18" font-family="Arial">Cost Sheet Dummy Preview</text></svg>' },
  ],
  tech: [{ name: 'Tech_Pack_Snapshot.png', url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="420" height="260"><rect width="100%" height="100%" fill="%23ecfeff"/><text x="20" y="40" fill="%230e7490" font-size="18" font-family="Arial">Tech Pack Dummy Preview</text></svg>' }],
  rm: [{ name: 'RM_Plan.xlsx', url: 'data:text/plain;charset=utf-8,RM%20plan%20dummy%20file' }],
  pack: [{ name: 'Packaging_Artwork.jpg', url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="420" height="260"><rect width="100%" height="100%" fill="%23fef3c7"/><text x="20" y="40" fill="%2392400e" font-size="18" font-family="Arial">Packaging Dummy Artwork</text></svg>' }],
  pp: [{ name: 'PP_Meeting_Minutes.pdf', url: 'data:text/plain;charset=utf-8,PP%20meeting%20minutes%20dummy%20content' }],
  bulk: [{ name: 'Bulk_Tracker.csv', url: 'data:text/plain;charset=utf-8,date,output%0A2026-04-27,1200' }],
  inline: [{ name: 'Inline_Defect_Photo.png', url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="420" height="260"><rect width="100%" height="100%" fill="%23fee2e2"/><text x="20" y="40" fill="%23991b1b" font-size="18" font-family="Arial">Inline Dummy Evidence</text></svg>' }],
  midline: [{ name: 'Midline_Defect_Photo.png', url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="420" height="260"><rect width="100%" height="100%" fill="%23fee2e2"/><text x="20" y="40" fill="%23991b1b" font-size="18" font-family="Arial">Midline Dummy Evidence</text></svg>' }],
  final: [{ name: 'Final_Inspection_Report.pdf', url: 'data:text/plain;charset=utf-8,Final%20inspection%20report%20dummy' }],
  ship: [{ name: 'BL_Copy.pdf', url: 'data:text/plain;charset=utf-8,Bill%20of%20Lading%20dummy' }],
}

export const EXCEPTION_CARDS = [
  { icon: 'file', title: 'Commercial Control', points: ['Wrong PO price vs approved cost sheet', 'Invoice value mismatch', 'Currency mismatch', 'Unapproved discount or rebate'] },
  { icon: 'scan', title: 'Spec Control', points: ['Size / dimension variance', 'Weight variance', 'Finish / coating mismatch', 'Wrong component / accessory usage'] },
  { icon: 'package', title: 'Packaging Control', points: ['Barcode mismatch', 'Label legal text missing', 'Wrong carton size / gsm', 'Drop test protocol not approved'] },
  { icon: 'truck', title: 'Dispatch Control', points: ['Shipment before final QC', 'Late stuffing', 'Missing BL docs', 'Missed vessel risk'] },
]

export const ESCALATION_MATRIX_TIERS = [
  { order: 1, minDays: 2, maxExclusive: 4, matrixTrigger: '2 days delay', ownerLabel: 'Merchant', actionLabel: 'Merchant alert', severity: 'medium' },
  { order: 2, minDays: 4, maxExclusive: 7, matrixTrigger: '4 days delay', ownerLabel: 'Merchant + QA Head', actionLabel: 'Merchant + QA Head', severity: 'high' },
  { order: 3, minDays: 7, maxExclusive: 11, matrixTrigger: '7 days delay', ownerLabel: 'COO / Director', actionLabel: 'COO / Director escalation', severity: 'high' },
  { order: 4, minDays: 11, matrixTrigger: 'Critical mismatch', ownerLabel: 'Compliance gate', actionLabel: 'Hard stop + doc block', severity: 'critical' },
]

export const MANDATORY_TO_ALERT_DEPENDENCIES = {
  po: { 0: [0, 2, 3], 1: [1], 2: [0, 2] },
}

export const MANDATORY_TO_ALERT_ITEM_DEPENDENCIES = {
  po: {
    0: { 0: [2], 1: [3], 2: [0] },
    1: { 0: [1], 1: [0], 2: [0] },
    2: { 0: [], 1: [], 2: [] },
  },
  inline: {
    0: { 0: [1], 1: [0], 2: [2] },
    1: { 0: [1], 1: [2], 2: [2] },
  },
  midline: {
    0: { 0: [0], 1: [1], 2: [0] },
    1: { 0: [0], 1: [0], 2: [1] },
  },
  tech: {
    0: { 0: [0], 1: [2], 2: [4] },
    1: { 0: [1], 1: [1], 2: [0] },
    2: { 0: [3], 1: [3], 2: [2] },
    3: { 0: [4], 1: [0], 2: [2] },
  },
  rm: {
    0: { 0: [2], 1: [2], 2: [1] },
    1: { 0: [1], 1: [3], 2: [4] },
    2: { 0: [0], 1: [2], 2: [4] },
    3: { 0: [1], 1: [4], 2: [2] },
  },
  pack: {
    0: { 0: [0], 1: [1], 2: [4] },
    1: { 0: [3], 1: [3], 2: [1] },
    2: { 0: [4], 1: [2], 2: [3] },
  },
  pp: {
    0: { 0: [0], 1: [0], 2: [4] },
    1: { 0: [4], 1: [4], 2: [0] },
    2: { 0: [4], 1: [4], 2: [0] },
  },
  bulk: {
    0: { 0: [1], 1: [1], 2: [0] },
    1: { 0: [0], 1: [0], 2: [1] },
    2: { 0: [3], 1: [3], 2: [2] },
  },
  final: {
    0: { 0: [1], 1: [4], 2: [1] },
    1: { 0: [2], 1: [2], 2: [4] },
    2: { 0: [0, 1, 2], 1: [0, 4] },
    3: { 0: [2], 1: [0], 2: [3] },
  },
  ship: {
    0: { 0: [3], 1: [1], 2: [0] },
    1: { 0: [1], 1: [1], 2: [0] },
    2: { 0: [2], 1: [2], 2: [2] },
  },
}

export function getAlertChecklist(stageId, alertText) {
  const t = (alertText || '').toLowerCase().trim()
  if (stageId === 'po' && t === 'po vs cost sheet mismatch') return ['Price check', 'Ship date', 'Quantity']
  if (stageId === 'po' && t === 'missing tech pack') return ['Tech pack attached', 'Product specs received', 'Label specs received']
  if (stageId === 'po' && t === 'currency mismatch') return ['PO currency verified', 'Price/value recalculated', 'Cost sheet aligned']
  if (stageId === 'tech' && t === 'size spec missing') return ['Product specs due checked', 'Product specs received', 'Spec sheet approved']
  if (stageId === 'tech' && t === 'weight missing') return ['Order quantity verified', 'Weight tolerance updated', 'Testing sample plan created']
  if (stageId === 'tech' && t === 'artwork not approved') return ['Label specs received', 'Artwork submitted', 'Wash care approval captured']
  if (stageId === 'tech' && t === 'spec changed after po') return ['Buyer change logged', 'PPM impact assessed', 'Latest spec version locked']
  if (stageId === 'rm' && t === 'rm delay') return ['Inhouse due checked', 'Inhouse actual updated', 'Raw material shortage if any']
  if (stageId === 'rm' && t === 'rm cost variance >3%') return ['PO price revalidated', 'Value impact approved', 'Merchant sign-off done']
  if (stageId === 'rm' && t === 'material grade mismatch') return ['Material spec checked', 'Testing sample submitted', 'Alternate source approved']
  if (stageId === 'rm' && t === 'insufficient stock') return ['Balance quantity checked', 'PO line priority set', 'Raw material for balance arrange']
  if (stageId === 'pack' && t === 'barcode mismatch') return ['Barcode artwork matched', 'Carting issued status checked', 'Pack copy approved']
  if (stageId === 'pack' && t === 'label compliance missing') return ['Label specs received', 'Wash care approved', 'Legal text verified']
  if (stageId === 'pack' && t === 'carton gsm mismatch') return ['Carton specs matched', 'Drop test requirement checked', 'Vendor corrective action logged']
  if (stageId === 'pp' && t === 'pp sample pending') return ['PPM due checked', 'PPM conducted date updated', 'PP comments shared']
  if (stageId === 'pp' && t === 'Approval pending') return ['Buyer approval requested', 'Escalation comment logged', 'Revised sample ETA captured']
  if (stageId === 'pp' && t === 'critical comments open') return ['Critical points listed', 'Owner assigned', 'Closure date committed']
  if (stageId === 'bulk' && t === 'output lag') return ['Production output vs plan checked', 'Pending quantity reviewed', 'Recovery capacity planned']
  if (stageId === 'bulk' && t === 'capacity overload') return ['Line allocation revised', 'Outsource/support options checked', 'Merchant notified']
  if (stageId === 'bulk' && t === 'tech spec drift') return ['Inline findings reviewed', 'Latest approved spec recirculated', 'Deviation closure logged']
  if (stageId === 'inline' && t === 'aql risk') return ['Inline actual updated', 'Defect trend reviewed', 'Corrective actions assigned']
  if (stageId === 'inline' && t === 'size drift') return ['Size tolerance rechecked', 'Midline plan advanced', 'Pattern correction confirmed']
  if (stageId === 'midline' && t === 'wrong finish') return ['Finish spec verified', 'Rework plan approved', 'QA recheck scheduled']
  if (stageId === 'midline' && t === 'wrong accessories') return ['Accessory inhouse date checked', 'Wrong lot isolated', 'Replacement ETA committed']
  if (stageId === 'final' && t === 'wrong price in invoice') return ['Invoice vs PO price matched', 'Value in USD validated', 'Approval note attached']
  if (stageId === 'final' && t === 'qty mismatch') return ['Final quantity counted', 'Shipped quantity updated', 'Balance quantity actioned']
  if (stageId === 'final' && /inspection outcome/i.test(t)) return ['Pass — signed report, docs aligned, release authorised', 'Fail — defects logged & re-inspection booked']
  if (stageId === 'final' && t === 'shipment without docs') return ['Packing list uploaded', 'Buyer approval captured', 'Carting issued confirmed']
  if (stageId === 'ship' && t === 'missed vessel') return ['ETD lock checked', 'Cargo readiness reconfirmed', 'Rebooking plan approved']
  if (stageId === 'ship' && t === 'late cargo readiness') return ['Stuffing confirmation pending list cleared', 'Dispatch ETA updated', 'AWD impact shared']
  if (stageId === 'ship' && t === 'bl delay') return ['BL readiness checked', 'Shipping docs complete', 'Buyer update sent']
  if (t.includes('missing tech pack')) return ['Tech pack attached', 'Product specs received', 'Label specs received']
  if (t.includes('mismatch')) return ['Mismatch reviewed', 'Root cause noted', 'Corrective action closed']
  return ['Issue resolved']
}

export function alertNeedsFileUpload(alertText) {
  const t = (alertText || '').toLowerCase()
  return t.includes('missing tech pack') || t.includes('missing') || t.includes('mismatch')
}
