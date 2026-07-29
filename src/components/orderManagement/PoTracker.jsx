import GoogleSheetEmbed from './GoogleSheetEmbed'
import { PO_TRACKER_SHEET_GID, PO_TRACKER_SHEET_ID } from './poTrackerConfig'

/** Order Management → PO Tracker: embedded Google Sheet (same UI/behavior as legacy Liquid embed). */
export default function PoTracker() {
  return (
    <div className="bg-white px-6 py-6">
      <GoogleSheetEmbed
        sheetId={PO_TRACKER_SHEET_ID}
        gid={PO_TRACKER_SHEET_GID}
        title="Purchase Orders"
        height="700px"
        width="100%"
        showToolbar
        allowFullscreen
        lazyLoad
        viewMode="edit"
        enableBuyerSwitcher={false}
      />
    </div>
  )
}
