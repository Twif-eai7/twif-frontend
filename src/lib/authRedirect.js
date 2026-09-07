/**
 * Destination for Supabase Auth magic-link / OTP emails.
 * Must be listed under Authentication → URL Configuration → Redirect URLs.
 */
export function getSiteUrl() {
  const fromEnv = import.meta.env.VITE_SITE_URL?.trim()?.replace(/\/$/, '')
  const origin = typeof window !== 'undefined' ? window.location?.origin?.replace(/\/$/, '') : ''
  const isLocal = (url) => /localhost|127\.0\.0\.1/.test(url || '')

  // Production builds must never fall back to localhost (Supabase Site URL default).
  if (import.meta.env.PROD) {
    if (fromEnv && !isLocal(fromEnv)) return fromEnv
    if (origin && !isLocal(origin)) return origin
    return 'https://plm.eai7.com'
  }

  if (origin) return origin
  if (fromEnv) return fromEnv
  return 'https://plm.eai7.com'
}

export function getAuthRedirectUrl(path = '/auth') {
  const normalised = path.startsWith('/') ? path : `/${path}`
  return `${getSiteUrl()}${normalised}`
}

export function otpEmailOptions({ shouldCreateUser = false, path = '/auth' } = {}) {
  return {
    shouldCreateUser: !!shouldCreateUser,
    emailRedirectTo: getAuthRedirectUrl(path),
  }
}
