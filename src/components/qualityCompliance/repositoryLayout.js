import { getPo, getBuyerName, getVendorName, getSkuRef, getInspectorDisplayName, getTargetDate, getOrderQty, getExFactoryDate, getBatchNos } from '../../utils/qcReportReaders'
import { reportEffectiveDate } from '../../utils/reportEffectiveDate'
import { getStageRollup, wasStageRejected } from './inspectionReport/stageStatus'

const STAGE_ORDER = { inline: 0, midline: 1, final: 2 }
const STAGE_NAME_BY_ORDER = ['inline', 'midline', 'final']

// Same PO -> SKU grouping/collapsing rule as QcReportsSummary.jsx's
// GeneratedReportsModal (groups useMemo): every SKU collapsed to only its
// own furthest stage's report, tie-broken by round so a rejected-then-
// reinspected SKU shows once (its current result), not twice.
export function groupReports(rows) {
  const byPo = new Map()
  for (const r of rows) {
    const po = getPo(r)
    if (!po) continue
    if (!byPo.has(po.id)) byPo.set(po.id, { poId: po.id, poNumber: po.po_number, buyerName: getBuyerName(r), vendorName: getVendorName(r), exFactoryDate: getExFactoryDate(r), reports: [] })
    byPo.get(po.id).reports.push(r)
  }
  return [...byPo.values()].map(g => {
    const bySku = new Map()
    for (const r of g.reports) {
      const skuKey = r.po_line_item_id
      if (!bySku.has(skuKey)) bySku.set(skuKey, { skuKey, skuRef: getSkuRef(r), targetDate: getTargetDate(r), orderQty: getOrderQty(r), reports: [] })
      bySku.get(skuKey).reports.push(r)
    }
    const skuGroups = [...bySku.values()].map(sg => {
      const highestStage = Math.max(...sg.reports.map(r => STAGE_ORDER[r.inspection_type] ?? -1))
      const atHighestStage = sg.reports.filter(r => (STAGE_ORDER[r.inspection_type] ?? -1) === highestStage)
      const highestRound = Math.max(...atHighestStage.map(r => r.round ?? 1))
      const reports = atHighestStage.filter(r => (r.round ?? 1) === highestRound)
      // What was actually covered at the highest stage - cumulative across
      // every submitted round there, not just orderQty (the SKU's static
      // order total) - a SKU whose latest round reads "accepted" can still
      // only have covered part of the order if an earlier round covered the
      // rest (see InspectionForm.jsx's auto-reschedule). Falls back to
      // orderQty only when nothing numeric was ever recorded (an overall-
      // result-only submission).
      const highestStageName = STAGE_NAME_BY_ORDER[highestStage]
      const rollup = highestStageName ? getStageRollup(sg.reports, sg.skuKey, highestStageName) : { cumulativeAccepted: 0, cumulativeAvailable: 0 }
      const coveredQty = rollup.cumulativeAccepted > 0 ? rollup.cumulativeAccepted : (rollup.cumulativeAvailable > 0 ? rollup.cumulativeAvailable : sg.orderQty)
      return { ...sg, reports, highestStage, rejected: reports.some(r => r.inspection_result === 'rejected'), coveredQty }
    }).sort((a, b) => b.highestStage - a.highestStage)
    // One skuGroups list per stage, for RepositoryPoDrawer.jsx's Inline/
    // Midline/Final tabs - a SKU that's gone all the way to Final still
    // shows up under Midline and Inline too, since it genuinely submitted a
    // report at each (same edge case QcReportsSummary.jsx's own
    // GeneratedReportsModal was corrected on: collapsing to one "furthest"
    // stage per SKU made Midline/Final tabs silently drop SKUs that had
    // already moved on, and made the stage counts come out non-monotonic).
    // Only the latest round per stage represents that stage's current
    // state, same reasoning as skuGroups above, just applied independently
    // per stage instead of across the whole SKU.
    const byStage = { inline: new Map(), midline: new Map(), final: new Map() }
    for (const r of g.reports) {
      const bucket = byStage[r.inspection_type]
      if (!bucket) continue
      const skuKey = r.po_line_item_id
      const existing = bucket.get(skuKey)
      if (!existing || (r.round ?? 1) > (existing.round ?? 1)) bucket.set(skuKey, r)
    }
    const skuGroupsByStage = {}
    for (const stage of Object.keys(byStage)) {
      const rows = []
      for (const r of byStage[stage].values()) {
        // Cumulative across every submitted round of this stage, not just
        // the single latest one held in `reports` above - so a SKU whose
        // leftover was covered by a later round (see InspectionForm.jsx's
        // auto-reschedule) correctly stops reading as "partial" once the
        // full order is actually covered, instead of forever comparing
        // only its most recent round's own number against the total.
        const { cumulativeAccepted, cumulativeAvailable } = getStageRollup(g.reports, r.po_line_item_id, stage)
        // rowKey (React key / render identity) is separate from skuKey (the
        // real po_line_item_id) - selection/export both key off skuKey alone,
        // so checking either of a SKU's two rows (current + historical
        // rejection, below) selects the same underlying SKU for export, not
        // two different things.
        rows.push({
          skuKey: r.po_line_item_id, rowKey: r.po_line_item_id, skuRef: getSkuRef(r), reports: [r],
          highestStage: STAGE_ORDER[stage], rejected: r.inspection_result === 'rejected', cumulativeAccepted, cumulativeAvailable,
        })
        // The latest round here can silently erase an earlier rejection from
        // view once a fresh re-inspection round supersedes it (this loop only
        // ever keeps one row per SKU per stage) - wasStageRejected looks past
        // that fresh round on purpose, so add its own row whenever the
        // current round itself isn't the rejection - "what happened, and
        // what's next," not just "what's next." Same pairing
        // PoInspectionComments.jsx's sidebar (SkuListRow split cards)
        // already shows.
        if (r.inspection_result !== 'rejected') {
          const rejectedRound = wasStageRejected(g.reports, r.po_line_item_id, stage)
          if (rejectedRound && rejectedRound.id !== r.id) {
            rows.push({
              skuKey: r.po_line_item_id, rowKey: `${r.po_line_item_id}:rejected`, skuRef: getSkuRef(rejectedRound),
              reports: [rejectedRound], highestStage: STAGE_ORDER[stage], rejected: rejectedRound.inspection_result === 'rejected',
              cumulativeAccepted: 0, cumulativeAvailable: 0, historicalRejection: true,
            })
          }
        }
      }
      skuGroupsByStage[stage] = rows.sort((a, b) => (a.skuRef || '').localeCompare(b.skuRef || ''))
    }
    // PO-level summary fields for the Repository table row: every distinct
    // QA who touched any of this PO's SKUs (usually just one), and the most
    // recent inspection_date across them all - "when this PO was last
    // worked on," matching how Scheduled POs elsewhere on this page reduces
    // to a single date per PO.
    const qaNames = [...new Set(g.reports.map(r => getInspectorDisplayName(r)).filter(Boolean))]
    // Every report row for this PO carries the same embedded batch list
    // (getBatchNos reads off the shared purchase_orders relation), so this
    // is just deduping that redundancy down to one list per PO - not a
    // second fetch/join, the data's already sitting right here.
    const batchNos = [...new Set(g.reports.flatMap(r => getBatchNos(r)))]
    const lastInspectionDate = g.reports.reduce((latest, r) => (
      reportEffectiveDate(r) && (!latest || reportEffectiveDate(r) > latest) ? reportEffectiveDate(r) : latest
    ), null)
    // Highest stage reached by ANY SKU on this PO (0=inline/1=midline/2=final,
    // same STAGE_ORDER skuGroups' own highestStage already uses) - drives the
    // Repository table's Stage column, a single at-a-glance number for how
    // far along this PO's furthest SKU has gotten, regardless of where every
    // other SKU on it individually stands.
    const highestPoStage = skuGroups.length ? Math.max(...skuGroups.map(sg => sg.highestStage)) : -1
    // PO-wide totals for the Repository table's Target Date/Order Qty
    // columns - summed/earliest across every distinct SKU that has a
    // report here (a SKU with zero reports at all isn't reflected, same
    // "only what this report-derived data actually covers" limitation
    // skuGroups itself already has).
    const orderQty = skuGroups.reduce((sum, sg) => sum + (sg.orderQty || 0), 0)
    const targetDates = skuGroups.map(sg => sg.targetDate).filter(Boolean)
    const targetDate = targetDates.length ? targetDates.reduce((min, d) => (d < min ? d : min)) : null
    // Repository table's "Submitted SKUs" column needs to match what
    // "Stage" says next to it: how many SKUs have actually reached and
    // submitted at that furthest stage specifically - not every SKU with
    // ANY submitted report regardless of which stage it's individually at
    // (that's skuGroups.length/orderQty above, still used as-is for export
    // enablement, which should stay "has anything submitted at all").
    const skuGroupsAtHighestStage = skuGroups.filter(sg => sg.highestStage === highestPoStage)
    const submittedAtHighestStageCount = skuGroupsAtHighestStage.length
    // coveredQty (what was actually accepted/available, cumulative across
    // rounds), not orderQty - "Submitted Qty" should read what was actually
    // submitted, same reasoning as RepositoryPoDrawer.jsx's own QTY column.
    const submittedAtHighestStageQty = skuGroupsAtHighestStage.reduce((sum, sg) => sum + (sg.coveredQty || 0), 0)
    return {
      ...g, skuGroups, skuGroupsByStage, hasRejected: skuGroups.some(sg => sg.rejected), qaNames, lastInspectionDate,
      highestPoStage, orderQty, targetDate, submittedAtHighestStageCount, submittedAtHighestStageQty, batchNos,
    }
  })
}

// Synthesizes a stub PO group - same shape groupReports() returns above,
// just with no report data at all - for every scheduled PO not already in
// excludePoIds (POs that already have at least one submitted report, and
// so already get a real group from groupReports()). Lets "Scheduled POs"
// show every scheduled PO in the Repository table, not just the subset
// that's since had something submitted - a scheduled-but-not-yet-inspected
// PO otherwise has no report row to build a group from at all.
export function groupSchedulesOnly(schedules, excludePoIds) {
  const byPo = new Map()
  for (const s of schedules) {
    const po = s.purchase_orders
    if (!po?.id || excludePoIds.has(po.id)) continue
    if (!byPo.has(po.id)) {
      byPo.set(po.id, {
        poId: po.id, poNumber: po.po_number,
        buyerName: po.buyer_supplier_links?.buyer?.display_name ?? null,
        vendorName: po.buyer_supplier_links?.supplier?.display_name ?? null,
        exFactoryDate: po.exceptional_ex_factory_date ?? po.ex_factory_date ?? null,
        qaNames: new Set(),
      })
    }
    if (s.organization_members?.full_name) byPo.get(po.id).qaNames.add(s.organization_members.full_name)
  }
  return [...byPo.values()].map(g => ({
    poId: g.poId, poNumber: g.poNumber, buyerName: g.buyerName, vendorName: g.vendorName,
    exFactoryDate: g.exFactoryDate,
    reports: [], skuGroups: [], skuGroupsByStage: { inline: [], midline: [], final: [] },
    hasRejected: false, qaNames: [...g.qaNames], lastInspectionDate: null, highestPoStage: -1,
    orderQty: 0, targetDate: null, submittedAtHighestStageCount: 0, submittedAtHighestStageQty: 0,
  }))
}

// Same stub-group idea as groupSchedulesOnly above, but for a PO that has
// nothing at all yet - no schedule entry, no submitted report - so the
// Repository table can show every currently-open PO, not just the ones
// something has already happened on. `openPoRows` is purchase_orders rows
// (QcReportsSummary.jsx's own openPoTrendRows query, not inspection_reports-
// rooted like groupReports() above); `excludePoIds` should already union
// both reported AND scheduled PO ids, so a PO never shows up twice across
// groupReports()/groupSchedulesOnly()/this one.
export function groupOpenPosOnly(openPoRows, excludePoIds) {
  return openPoRows
    .filter(po => po?.id && !excludePoIds.has(po.id))
    .map(po => {
      // Earliest target_date across this PO's own line items - same
      // "earliest wins" convention groupReports() above already uses for
      // its own targetDate. These stubs used to hardcode this to null
      // regardless (the query feeding openPoRows didn't even select
      // target_date at all), which made every open PO's own Target Date
      // column read "-" even when the PO genuinely has one on every line
      // item - fixed by selecting it (QcReportsSummary.jsx's own
      // openPoTrendRows query) and rolling it up the same way here.
      const targetDates = (po.po_line_items || []).map(li => li.target_date).filter(Boolean)
      const targetDate = targetDates.length ? targetDates.reduce((min, d) => (d < min ? d : min)) : null
      return {
        poId: po.id, poNumber: po.po_number,
        buyerName: po.buyer_supplier_links?.buyer?.display_name ?? null,
        vendorName: po.buyer_supplier_links?.supplier?.display_name ?? null,
        exFactoryDate: po.exceptional_ex_factory_date ?? po.ex_factory_date ?? null,
        reports: [], skuGroups: [], skuGroupsByStage: { inline: [], midline: [], final: [] },
        hasRejected: false, qaNames: [], lastInspectionDate: null, highestPoStage: -1,
        orderQty: (po.po_line_items || []).reduce((sum, li) => sum + (li.quantity_ordered || 0), 0),
        targetDate, submittedAtHighestStageCount: 0, submittedAtHighestStageQty: 0,
      }
    })
}
