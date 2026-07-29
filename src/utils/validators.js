export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function isValidUrl(url) {
  return /^https?:\/\/.+\..+/.test(url)
}

export function extractDomain(email) {
  return email.split('@')[1]?.toLowerCase() || ''
}

export const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
  'icloud.com', 'live.com', 'aol.com', 'protonmail.com',
  'mail.com', 'yandex.com', 'gmx.com',
])

export function isFreeEmailDomain(email) {
  return FREE_EMAIL_DOMAINS.has(extractDomain(email))
}