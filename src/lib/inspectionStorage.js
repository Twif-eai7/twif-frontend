import { supabase } from './supabase'

const BUCKET = 'inspection-reports'

// Uploads a file to the inspection-reports bucket under the given prefix and
// returns the bucket-relative path. Throws on error.
export async function uploadToInspectionBucket(file, prefix) {
  if (!file) return null
  const path = `${prefix}/${crypto.randomUUID()}/${file.name}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file)
  if (error) throw error
  return path
}

// Deterministic path (not a random UUID prefix like uploadToInspectionBucket)
// so a resubmit overwrites the same object instead of accumulating orphans.
// contentType defaults to a plain PDF; a too-large-for-one-PDF export that
// got split into a zip of part-PDFs (see exportSplitInspectionReportPdfs)
// passes 'application/zip' through the same upload path instead.
export async function uploadInspectionReportPdf(blob, reportId, filename, contentType = 'application/pdf') {
  const path = `reports/${reportId}/${filename}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { upsert: true, contentType })
  if (error) throw error
  return path
}

// `options.transform` (e.g. { width, quality }) routes the URL through
// Supabase Storage's image-transform endpoint, which resizes/re-encodes the
// image server-side instead of serving the original - callers that only
// need a small preview (PDF export, thumbnails) can skip downloading and
// client-side downscaling a multi-MB phone photo entirely.
// Best-effort delete of one or more objects from the inspection-reports
// bucket - used where a DB row referencing a storage object is itself being
// removed (an edited-out or deleted callout photo), so the object doesn't
// sit around forever with nothing pointing to it. Never throws: a failed
// storage cleanup shouldn't block the DB change that triggered it.
export async function removeFromInspectionBucket(paths) {
  const list = (paths || []).filter(Boolean)
  if (!list.length) return
  try {
    await supabase.storage.from(BUCKET).remove(list)
  } catch {
    // best-effort - an orphaned object is a lesser problem than blocking
    // the caller's own delete/edit over a storage hiccup.
  }
}

export function getInspectionFileUrl(path, options) {
  if (!path) return null
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path, options)
  return data?.publicUrl ?? null
}

// SHA-256 hex digest of the sorted, comma-joined id list - the fixed-length,
// order-independent key inspection_report_batches.report_ids_key uses (see
// that migration's own comment for why SHA-256, not MD5: it's what the
// browser's SubtleCrypto exposes natively, no extra dependency needed).
async function hashReportIds(reportIds) {
  const sorted = [...reportIds].sort().join(',')
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sorted))
  return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('')
}

// Gets (or, the first time this exact set of reports is exported, creates)
// the combined-document reference number for a batch PDF - see
// supabase/migrations/20260917_create_inspection_report_batches.sql for the
// full reasoning. Every current caller only ever batches reports from one
// PO into one document - `poId` is recorded as-is, so a future caller that
// ever violated that would just record whichever po was passed in, not
// crash, but batches spanning more than one PO were never a case this was
// designed for.
//
// Idempotent: re-exporting the identical set of reports (Preview, then
// Download, then Send Mail later) always returns the same batch_no. A
// concurrent duplicate insert (two tabs exporting the same set at once) is
// resolved via `on conflict ... do nothing` + a fallback select, rather
// than assuming whichever insert runs first is the one that wins.
//
// Returns null (never throws) for degenerate input or any Supabase error -
// callers must treat this as best-effort and fall back to their own
// placeholder text, the same "a secondary feature must never block the
// primary export" rule already applied to PDF-attachment failures
// elsewhere in this app.
export async function getOrCreateBatchReportNo(reportIds, poId, createdBy) {
  if (!reportIds?.length) return null
  try {
    const key = await hashReportIds(reportIds)
    const { data: existing } = await supabase
      .from('inspection_report_batches').select('batch_no').eq('report_ids_key', key).maybeSingle()
    if (existing?.batch_no) return existing.batch_no

    // upsert + ignoreDuplicates is PostgREST's own "insert ... on conflict
    // (report_ids_key) do nothing" - on a conflict it just returns no row
    // (not an error), which the fallback select below then resolves.
    const { data: inserted, error: insertError } = await supabase
      .from('inspection_report_batches')
      .upsert({ report_ids_key: key, report_ids: reportIds, po_id: poId ?? null, created_by: createdBy ?? null }, { onConflict: 'report_ids_key', ignoreDuplicates: true })
      .select('batch_no')
      .maybeSingle()
    if (inserted?.batch_no) return inserted.batch_no
    if (insertError) throw insertError

    // Lost the insert race to a concurrent identical export - the winning
    // row is there now, so this always finds it.
    const { data: afterRace } = await supabase
      .from('inspection_report_batches').select('batch_no').eq('report_ids_key', key).maybeSingle()
    return afterRace?.batch_no ?? null
  } catch {
    return null
  }
}

export const INSPECTION_BUCKET = BUCKET
