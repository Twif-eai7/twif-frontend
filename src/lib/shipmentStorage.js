import { supabase } from './supabase'

const BUCKET = 'shipment-bls'

// Uploads a file to the shipment-bls bucket under the given prefix and
// returns the bucket-relative path. Throws on error.
// Used by InvoiceDetailsModal and useShipmentRecording to keep upload logic
// in one place.
export async function uploadToShipmentBucket(file, prefix) {
  if (!file) return null
  const path = `${prefix}/${crypto.randomUUID()}/${file.name}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file)
  if (error) throw error
  return path
}

export const SHIPMENT_BUCKET = BUCKET
