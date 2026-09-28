import { finalInspectionLabel, finalInspectionBadgeClass } from '../../utils/finalInspectionStatus'

// Read-only "Final: <verdict>" pill — shared by the shipment-planning
// modals (informational only, planning itself isn't gated on this) and the
// Record Shipment wizard (where it sits next to the actual hard gate).
export default function FinalInspectionBadge({ report }) {
  return (
    <span className={`inline-block px-1.5 py-px rounded-full text-[9px] font-semibold whitespace-nowrap ${finalInspectionBadgeClass(report)}`}>
      Final: {finalInspectionLabel(report)}
    </span>
  )
}
