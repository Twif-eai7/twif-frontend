import { isValidEmail, isValidUrl } from './validators'
import { isValidPhoneNumber } from 'libphonenumber-js'

// ── Format patterns ──────────────────────────────────────────
export const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/
export const CIN_RE = /^[LUu]\d{5}[A-Za-z]{2}\d{4}[A-Za-z]{3}\d{6}$/
export const UDYAM_RE = /^UDYAM-[A-Z]{2}-\d{2}-\d{7}$/i
export const IEC_RE = /^[0-9A-Za-z]{10}$/
export const IFSC_RE = /^[A-Za-z]{4}0[A-Za-z0-9]{6}$/
export const SWIFT_RE = /^[A-Za-z]{6}[A-Za-z0-9]{2}([A-Za-z0-9]{3})?$/
export const BANK_ACCT_RE = /^\d{9,18}$/
export const INDIA_PIN_RE = /^[1-9]\d{5}$/
// Only used when no country is selected yet.
export const PHONE_LOOSE_RE = /^\+?[0-9][0-9\s-]{6,18}[0-9]$/

// Country name -> ISO2. Mirror of shopify-backend/routes/onBoardCustomers.js
// `countryToPhoneCode`. Keep in sync if either list changes.
export const COUNTRY_TO_ISO2 = {
  'United States': 'US', 'Canada': 'CA', 'United Kingdom': 'GB', 'Germany': 'DE',
  'France': 'FR', 'Australia': 'AU', 'Japan': 'JP', 'India': 'IN', 'China': 'CN',
  'Brazil': 'BR', 'Mexico': 'MX', 'Other': 'US',
}

// Short advisory messages (no em dashes).
export const FORMAT_MESSAGES = {
  registration: "This doesn't look like a valid GST number",
  cin: "This doesn't look like a valid CIN",
  udyam: "This doesn't look like a valid Udyam number",
  iec: 'IEC codes are 10 characters',
  bankIfsc: "This doesn't look like a valid IFSC or SWIFT code",
  bankAccountNumber: 'Account numbers are 9 to 18 digits',
  pincode: 'Enter a valid 6-digit pincode',
  phone: "This doesn't look like a valid phone number",
  website: 'Website must start with https://',
  ownerEmail: "This doesn't look like a valid email address",
}

function phoneError(value, country) {
  const iso2 = COUNTRY_TO_ISO2[country]
  if (!country || !iso2) {
    return PHONE_LOOSE_RE.test(value) ? '' : FORMAT_MESSAGES.phone
  }
  try {
    return isValidPhoneNumber(value, iso2) ? '' : `Not a valid phone number for ${country}`
  } catch {
    return `Not a valid phone number for ${country}`
  }
}

/**
 * Advisory format check for a single field.
 * Returns '' when the value is empty (emptiness is the required-field logic's
 * job) or well-formed, otherwise a short message.
 *
 * @param {string} name  form key (e.g. 'bankIfsc')
 * @param {string} value current value
 * @param {{ country?: string }} ctx
 */
export function formatErrorFor(name, value, ctx = {}) {
  const v = (value ?? '').trim()
  if (!v) return ''
  switch (name) {
    case 'registration': return GSTIN_RE.test(v.toUpperCase()) ? '' : FORMAT_MESSAGES.registration
    case 'cin': return CIN_RE.test(v) ? '' : FORMAT_MESSAGES.cin
    case 'udyam': return UDYAM_RE.test(v) ? '' : FORMAT_MESSAGES.udyam
    case 'iec': return IEC_RE.test(v) ? '' : FORMAT_MESSAGES.iec
    case 'bankIfsc': return (IFSC_RE.test(v) || SWIFT_RE.test(v)) ? '' : FORMAT_MESSAGES.bankIfsc
    case 'bankAccountNumber': return BANK_ACCT_RE.test(v) ? '' : FORMAT_MESSAGES.bankAccountNumber
    case 'pincode': return INDIA_PIN_RE.test(v) ? '' : FORMAT_MESSAGES.pincode
    case 'phone':
    case 'ownerPhone': return phoneError(v, ctx.country)
    case 'website': return isValidUrl(v) ? '' : FORMAT_MESSAGES.website
    case 'ownerEmail': return isValidEmail(v) ? '' : FORMAT_MESSAGES.ownerEmail
    default: return ''
  }
}
