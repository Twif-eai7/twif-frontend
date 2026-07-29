const AUDIT_TYPE_LABEL = {
  fcca: 'FCCA', sedex: 'Sedex', eudr: 'EUDR',
  'social-compliance': 'Social Compliance',
  smeta: 'SMETA', bsci: 'BSCI', sa8000: 'SA 8000', ics: 'ICS',
}
const LOGO_URL = 'https://cdn.shopify.com/s/files/1/0494/0922/8958/files/logo.png?v=1614315516'

function fmtDate(d) {
  if (!d) return '—'
  const dt = new Date(d)
  return isNaN(dt) ? d : dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

async function fetchAsBase64(url) {
  try {
    const blob = await fetch(url).then(r => r.blob())
    return await new Promise((res, rej) => {
      const reader = new FileReader()
      reader.onload = () => res(reader.result)
      reader.onerror = rej
      reader.readAsDataURL(blob)
    })
  } catch { return null }
}

export async function exportAuditPdf(audit, { logoUrl } = {}) {
  const resolvedLogo = logoUrl ?? LOGO_URL
  const [[{ default: jsPDF }], logoBase64] = await Promise.all([
    Promise.all([import('jspdf'), import('jspdf-autotable')]),
    fetchAsBase64(resolvedLogo),
  ])

  const g   = audit.audit_general_info       ?? {}
  const mfg = audit.audit_manufacturing_info ?? {}
  const inf = audit.audit_infrastructure     ?? {}
  const qm  = audit.audit_quality_management ?? {}
  const cap = audit.audit_capacity_review    ?? {}
  const com = audit.audit_compliance_safety  ?? {}
  const sum = audit.audit_summary            ?? {}
  const sn  = audit.organizations?.display_name ?? '—'
  const _cats = (audit.product_categories ?? []).map(c => c.name)
  const cat = _cats.length === 0 ? null
    : _cats.length <= 2 ? _cats.join(', ')
    : `${_cats[0]} & ${_cats.length - 1} more`

  const doc = new jsPDF('p', 'mm', 'a4')
  const W = 210, M = 14, CW = W - M * 2, PH = 297
  const LCW = 70, GAP = 6, VX = M + LCW + GAP, VCW = CW - LCW - GAP

  let y = 0

  // ── Page 1 header — bordered table with logo / form name / doc ref ───────────
  const HH   = 22                // header height
  const LOGO = 30                // logo cell width
  const TTL  = 108               // title cell width
  const REF  = CW - LOGO - TTL  // reference cell width

  const year  = audit.assessment_date ? new Date(audit.assessment_date).getFullYear() : new Date().getFullYear()
  const revNo = String((audit.revision_no ?? 0) + 1).padStart(2, '0')
  const refBase = `JNG-QA-AUD-${year}-001-REV`
  const midY  = 8 + HH / 2 + 1.5

  doc.setDrawColor(180, 180, 180).setLineWidth(0.35)
  doc.rect(M, 8, CW, HH)
  doc.line(M + LOGO, 8, M + LOGO, 8 + HH)
  doc.line(M + LOGO + TTL, 8, M + LOGO + TTL, 8 + HH)

  // Logo cell
  if (logoBase64) {
    try { doc.addImage(logoBase64, M + 2, 9.5, LOGO - 4, HH - 3, '', 'FAST') }
    catch { /* fallback below */ }
  }
  if (!logoBase64) {
    doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(30, 30, 30)
    doc.text('JNG', M + LOGO / 2, midY, { align: 'center' })
  }

  // Title cell
  doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(17, 17, 17)
  doc.text('Factory Capability & Capacity Audit (FCCA)', M + LOGO + TTL / 2, midY, { align: 'center' })

  // Reference cell — base in gray, revision number in orange
  const refX = M + LOGO + TTL + REF / 2
  const baseW = doc.getStringUnitWidth(refBase) * 7 / doc.internal.scaleFactor
  doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(80, 80, 80)
  doc.text(refBase + revNo, refX, midY, { align: 'center' })
  // Overlay the revision digits in orange
  const fullRef = refBase + revNo
  const fullW = doc.getStringUnitWidth(fullRef) * 7 / doc.internal.scaleFactor
  const suffixX = refX - fullW / 2 + baseW
  doc.setFont('helvetica', 'bold').setTextColor(200, 80, 0)
  doc.text(revNo, suffixX, midY)

  // Sub-header row: supplier name + audit type + meta
  y = 8 + HH
  doc.setFillColor(245, 245, 245).rect(M, y, CW, 10, 'F')
  doc.setDrawColor(180, 180, 180).setLineWidth(0.35)
  doc.line(M, y + 10, M + CW, y + 10)
  doc.setFont('helvetica', 'bold').setFontSize(9).setTextColor(17, 17, 17)
  doc.text(sn, M + 4, y + 6.5)
  const metaParts = [AUDIT_TYPE_LABEL[audit.audit_type] ?? audit.audit_type, fmtDate(audit.assessment_date), audit.factory_representative, cat].filter(Boolean)
  doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(120, 120, 120)
  doc.text(metaParts.join('   ·   '), W - M - 4, y + 6.5, { align: 'right' })

  y = 8 + HH + 10 + 8  // content starts below both header rows

  // ── Helpers ──────────────────────────────────────────────────────────────────

  // Add a page if less than h mm remain before the footer
  function needsPage(h = 14) {
    if (y + h > PH - 16) { doc.addPage(); y = 18 }
  }

  function secHead(n, title) {
    needsPage(35)
    doc.setFont('helvetica', 'bold').setFontSize(6.5).setTextColor(160, 160, 160)
    doc.text(n, M, y)
    doc.setFontSize(13).setTextColor(17, 17, 17)
    doc.text(title, M, y + 5.5)
    y += 11
    doc.setDrawColor(200, 200, 200).setLineWidth(0.4).line(M, y, W - M, y)
    y += 5
  }

  function subHead(label) {
    needsPage(20)
    y += 4
    doc.setFillColor(246, 246, 246).rect(M, y, CW, 6.5, 'F')
    doc.setFont('helvetica', 'bold').setFontSize(6).setTextColor(130, 130, 130)
    doc.text(label.toUpperCase(), M + 3, y + 4.5)
    y += 9
  }

  // Helper: draw label (handles wrapping), returns line count
  function lbl(label) {
    doc.setFont('helvetica', 'bold').setFontSize(6).setTextColor(150, 150, 150)
    const lines = doc.splitTextToSize(label.toUpperCase(), LCW - 2)
    doc.text(lines, M, y + 4.6)
    return lines.length
  }

  // Single label:value row with a thin separator line
  function row(label, value) {
    needsPage(12)
    const v = String(value ?? '—')
    doc.setFont('helvetica', 'normal').setFontSize(8.5)
    const vLines = doc.splitTextToSize(v, VCW)
    const shown  = vLines.slice(0, 5)
    const lblLen = lbl(label)
    const rh = Math.max(lblLen * 3.5, shown.length * 4.6, 4.6) + 3

    doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(22, 22, 22)
    doc.text(shown, VX, y + 4.6)
    y += rh

    doc.setDrawColor(238, 238, 238).setLineWidth(0.2).line(M, y, W - M, y)
    y += 2
  }

  // Label:value row with a tinted background on the value side (for summary blocks)
  function blockRow(label, text, bg = [245, 245, 245], tc = [30, 30, 30]) {
    if (!text) return
    doc.setFont('helvetica', 'normal').setFontSize(8.5)
    const lines = doc.splitTextToSize(text, VCW - 8)
    const shown = lines.slice(0, 8)
    const bh = shown.length * 4.6 + 7
    needsPage(bh + 10)

    lbl(label)
    doc.setFillColor(...bg).roundedRect(VX, y, VCW, bh, 1.5, 1.5, 'F')
    doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...tc)
    doc.text(shown, VX + 4, y + 5.5)
    y += bh + 4

    doc.setDrawColor(238, 238, 238).setLineWidth(0.2).line(M, y, W - M, y)
    y += 2
  }

  // Label:URL row — shows "View attached file →" as clickable hyperlink
  function linkRow(label, url) {
    if (!url) return
    needsPage(12)
    const lblLen = lbl(label)
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(30, 100, 200)
    doc.textWithLink('View attached file >', VX, y + 4.6, { url })
    const rh = Math.max(lblLen * 3.5, 4.6) + 3

    y += rh
    doc.setDrawColor(238, 238, 238).setLineWidth(0.2).line(M, y, W - M, y)
    y += 2
  }

  // Signature row: image or italic text on the value side
  function sigRow(label, sigUrl) {
    needsPage(28)
    lbl(label)
    if (sigUrl.startsWith('data:')) {
      try { doc.addImage(sigUrl, 'PNG', VX, y, 50, 16) }
      catch {
        doc.setFont('helvetica', 'italic').setFontSize(12).setTextColor(22, 22, 22)
        doc.text(sigUrl, VX, y + 8)
      }
    } else {
      doc.setFont('helvetica', 'italic').setFontSize(12).setTextColor(22, 22, 22)
      doc.text(sigUrl, VX, y + 8)
    }
    y += 22
    doc.setDrawColor(238, 238, 238).setLineWidth(0.2).line(M, y, W - M, y)
    y += 2
  }

  // ── Sections 01–06: flow naturally across pages ──────────────────────────────

  secHead('01', 'General Information')
  row('Ownership', g.ownership)
  row('Factory Type', g.factory_type)
  row('Year Established', g.year_established)
  row('Total Production Area', g.total_production_area)
  subHead('Workforce')
  row('Total Employees', g.total_employees)
  row('Permanent Employees', g.permanent_employees)
  row('Contract Employees', g.contract_employees)
  subHead('Working Schedule')
  row('Working Days', g.working_days)
  row('Working Hours', g.working_hours)

  y += 8

  secHead('02', 'Manufacturing Information')
  row('Main Products', mfg.main_products)
  row('Manufacturing Processes', mfg.manufacturing_processes)
  subHead('Capacity')
  row('Number of Production Lines', mfg.number_of_production_lines)
  linkRow('Production Line Images', mfg.production_lines_images_url)
  row('Major Machinery Name', mfg.major_machinery_name)
  linkRow('Machinery Images', mfg.machinery_images_url)
  row('Monthly Production Capacity (Units/Containers)', mfg.monthly_production_capacity)
  row('Current Capacity Utilization (Units/Containers)', mfg.current_capacity_utilization)
  row('Average Lead Time (Days)', mfg.average_lead_time)
  row('Peak Season', mfg.peak_season)
  linkRow('Organisation Chart', mfg.organization_chart_url)

  y += 8

  secHead('03', 'Infrastructure Assessment')
  row('Production Layout', inf.production_layout)
  linkRow('Production Layout (Copy)', inf.production_layout_url)
  row('Material Flow', inf.material_flow)
  linkRow('Material Flow (Copy)', inf.material_flow_url)
  row('Incoming Material Storage (SQ Ft./SQ Mtr.)', inf.incoming_material_storage)
  row('Production Area (SQ Ft./SQ Mtr.)', inf.production_area)
  row('Finishing & Packing Area (SQ Ft./SQ Mtr.)', inf.finishing_packing_area)
  row('Chemical Storage (SQ Ft./SQ Mtr.)', inf.chemical_storage)
  row('Finished Goods Storage (SQ Ft./SQ Mtr.)', inf.finished_goods_storage)
  row('Container Parking', inf.container_parking)
  row('Housekeeping', inf.housekeeping)
  linkRow('Washroom Images', inf.washroom_images_url)

  y += 8

  secHead('04', 'Quality Management')
  linkRow('Incoming Material Inspection', qm.incoming_material_inspection)
  linkRow('In-Process Inspection', qm.in_process_inspection)
  linkRow('Final Inspection', qm.final_inspection)
  linkRow('Testing Equipment', qm.testing_equipment)
  linkRow('Calibration System', qm.calibration_system)
  linkRow('Quality Records', qm.quality_records)
  linkRow('Corrective Action System', qm.corrective_action_system)

  y += 8

  secHead('05', 'Production Capacity Review')
  row('Current Monthly Orders', cap.current_monthly_orders)
  row('Available Capacity', cap.available_capacity)
  row('Maximum Monthly Capacity', cap.maximum_monthly_capacity)
  row('Production Planning System', cap.production_planning_system)
  row('Subcontracting', cap.subcontracting)
  row('Production Constraints', cap.production_constraints)

  y += 8

  secHead('06', 'Compliance & Safety')
  row('Factory License', com.factory_license)
  row('Machine Safety', com.machine_safety)
  row('Fire Safety Arrangements', com.fire_safety_arrangements)
  linkRow('Fire Safety Images & NOC', com.fire_safety_images_url)
  linkRow('Emergency Exits', com.emergency_exits)
  linkRow('PPE Usage', com.ppe_usage)
  linkRow('Chemical Management', com.chemical_management)
  row('Waste Disposal', com.waste_disposal)

  // ── Section 07 always starts on a fresh page ─────────────────────────────────

  doc.addPage(); y = 18

  secHead('07', 'Summary & Sign-off')
  blockRow('Factory Strengths', sum.factory_strengths, [245, 248, 245], [30, 80, 30])
  blockRow('Areas Requiring Improvement', sum.areas_requiring_improvement, [255, 251, 235], [92, 45, 0])
  row('Capability Assessment by Auditor', sum.capability_assessment)
  row('Capacity Assessment by Auditor', sum.capacity_assessment)

  if (sum.auditor_signature_url) sigRow('Auditor Signature', sum.auditor_signature_url)
  if (audit.factory_representative) row('Factory Representative', audit.factory_representative)

  // ── Footer on all pages ───────────────────────────────────────────────────────

  const total = doc.getNumberOfPages()
  for (let i = 1; i <= total; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(180, 180, 180)
    doc.text(`${sn}  ·  Factory Audit  ·  ${fmtDate(audit.assessment_date)}`, M, PH - 8)
    doc.text(`${i} / ${total}`, W - M, PH - 8, { align: 'right' })
  }

  doc.save(`factory-audit-${sn.toLowerCase().replace(/\s+/g, '-')}-${audit.assessment_date ?? 'draft'}.pdf`)
}