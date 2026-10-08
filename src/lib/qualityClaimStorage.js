import { supabase } from './supabase'

const BUCKET = 'quality-claim-attachments'

// Returns the full "bucket::path" ref poUtils.publicUrl() expects, not the
// bare path — same convention InvoiceCard.jsx/useInvoiceDetailsForm.js use
// for their own buckets, so callers can store the ref straight into
// po_quality_claims.proof_url without knowing the bucket name themselves.
export async function uploadQualityClaimProof(file, poId) {
  if (!file) return null
  const path = `${poId}/${crypto.randomUUID()}_${file.name}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file)
  if (error) throw error
  return `${BUCKET}::${path}`
}

export const QUALITY_CLAIM_BUCKET = BUCKET
