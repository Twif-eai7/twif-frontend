import { supabase } from './supabase'

const BUCKET = 'tech-enhancement-attachments'

export async function uploadToTerBucket(file, prefix) {
  if (!file) return null
  const path = `${prefix}/${crypto.randomUUID()}/${file.name}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file)
  if (error) throw error
  return path
}

export function getTerFileUrl(path) {
  if (!path) return null
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return data?.publicUrl ?? null
}

export const TER_BUCKET = BUCKET
