/**
 * Destination for Supabase Auth magic-link / OTP emails.
 * Must be listed under Authentication → URL Configuration → Redirect URLs.
 */
export function getSiteUrl() {
  const fromEnv = import.meta.env.VITE_SITE_URL?.trim()?.replace(/\/$/, '')
  if (fromEnv) return fromEnv
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin.replace(/\/$/, '')
  }
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
