// SignaturePad's own mode keys ('type'/'draw'/'upload') vs. the storage
// convention used everywhere signatures are persisted ('typed'/'drawn'/'uploaded').
// Callers must translate at the API boundary — never send `mode` straight through.
export const MODE_TO_STORAGE = { type: 'typed', draw: 'drawn', upload: 'uploaded' }
export const STORAGE_TO_MODE = { typed: 'type', drawn: 'draw', uploaded: 'upload' }
