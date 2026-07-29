import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const supabasePub = import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY?.trim()

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePub)

/** Shown in UI when env is missing */
export const supabaseConfigMessage =
  'Missing Supabase configuration. Create a .env file with VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY (see .env.example).'

/**
 * Client instance, or null if env vars are missing.
 * Do not throw at import time — otherwise the whole app stays blank before React mounts.
 */
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabasePub)
  : null
