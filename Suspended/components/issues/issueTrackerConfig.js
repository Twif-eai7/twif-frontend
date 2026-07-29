/**
 * Issue Tracker Google Sheet config.
 *
 * URL format:
 *   https://docs.google.com/spreadsheets/d/<sheetId>/edit#gid=<gid>
 *
 * Flags:
 *   showToolbar          – show/hide the top toolbar (title + zoom/refresh/download/open)
 *   allowFullscreen      – include a fullscreen toggle button in the toolbar
 *   lazyLoad             – defer iframe `src` until it scrolls near the viewport
 *   enableBuyerSwitcher  – reserved for future per-buyer sheet switching
 *   viewMode             – Google Sheets URL segment: 'edit' | 'preview' | 'pubhtml'
 */
export const ISSUE_TRACKER_SHEET = {
  sheetId: '1EklUEcqk0j3yrzP6555b4fqks5PB-pEbVw0iUZnw0T8',
  gid: 1479330029,
  title: 'Issue Tracker',
  height: '700px',
  width: '100%',
  enableBuyerSwitcher: false,
  showToolbar: true,
  allowFullscreen: true,
  lazyLoad: true,
  viewMode: 'edit',
}
