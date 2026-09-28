import { supabase } from './supabase'

const BUCKET = 'irf-attachments'

export async function uploadToIrfBucket(file, prefix) {
  if (!file) return null
  const path = `${prefix}/${crypto.randomUUID()}/${file.name}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file)
  if (error) throw error
  return path
}

export function getIrfFileUrl(path) {
  if (!path) return null
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return data?.publicUrl ?? null
}

export const IRF_BUCKET = BUCKET
