// Shared between CatalogUploadModal (which writes/polls it) and PLMPage (which only needs to
// know whether to auto-reopen the modal on mount) — see the longer explanation next to its use
// in CatalogUploadModal.jsx. Kept out of that component file so mixing this with the default
// component export doesn't break Fast Refresh there (react-refresh/only-export-components).
export const UPLOAD_INFLIGHT_TTL_MS = 20 * 60 * 1000
export const uploadInflightKey = memberId => `plm_catalog_upload_inflight:${memberId}`
