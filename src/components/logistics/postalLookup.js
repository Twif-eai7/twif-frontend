const INDIA_PIN_RE = /\b[1-9]\d{5}\b/
const UK_POSTCODE_RE = /\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b/i
const US_ZIP_RE = /\b\d{5}(?:-\d{4})?\b/
const PT_POSTCODE_RE = /\b\d{4}-\d{3}\b/
const EU_ZIP_4_RE = /\b\d{4}\b/

export function extractIndiaPincode(text) {
  const match = text?.match(INDIA_PIN_RE)
  return match ? match[0] : ''
}

export function extractPostalCode(text, mode = 'india') {
  if (!text) return ''
  if (mode === 'india') return extractIndiaPincode(text)
  const uk = text.match(UK_POSTCODE_RE)
  if (uk) return uk[0].toUpperCase().replace(/\s+/g, ' ').trim()
  const pt = text.match(PT_POSTCODE_RE)
  if (pt) return pt[0]
  const us = text.match(US_ZIP_RE)
  if (us) return us[0]
  const india = extractIndiaPincode(text)
  if (india) return india
  const eu = text.match(EU_ZIP_4_RE)
  return eu ? eu[0] : ''
}

export async function lookupIndiaPincode(pincode) {
  const pin = String(pincode || '').replace(/\D/g, '')
  if (!/^[1-9]\d{5}$/.test(pin)) return null

  try {
    const res = await fetch(`https://api.postalpincode.in/pincode/${pin}`)
    const json = await res.json()
    const data = Array.isArray(json) ? json[0] : json
    if (data?.Status !== 'Success' || !data.PostOffice?.length) return null

    const po = data.PostOffice[0]
    const parts = [po.Name, po.District, po.State, po.Country || 'India'].filter(Boolean)
    return { pincode: pin, address: parts.join(', ') }
  } catch {
    return null
  }
}

function guessCountryCodes(addressHint = '') {
  const hint = addressHint.toLowerCase()
  if (/\b(uk|united kingdom|england|scotland|wales|london|devon|manchester)\b/.test(hint)) {
    return ['gb', 'in', 'us']
  }
  if (/\b(usa|united states|america)\b/.test(hint)) return ['us', 'gb', 'in']
  if (/\b(india|gurgaon|haryana|mumbai|delhi|bangalore|chennai|kolkata)\b/.test(hint)) {
    return ['in', 'gb', 'us']
  }
  return ['gb', 'us', 'in']
}

async function lookupZippopotam(country, postalCode) {
  const code = String(postalCode).replace(/\s+/g, '')
  if (!code) return null

  try {
    const res = await fetch(`https://api.zippopotam.us/${country}/${encodeURIComponent(code)}`)
    if (!res.ok) return null
    const data = await res.json()
    const place = data.places?.[0]
    if (!place) return null

    const parts = [
      place['place name'],
      place.state || place['state abbreviation'],
      data.country,
    ].filter(Boolean)

    return {
      pincode: data['post code'] || postalCode.trim(),
      address: parts.join(', '),
    }
  } catch {
    return null
  }
}

export async function lookupInternationalZip(zip, addressHint = '') {
  const trimmed = String(zip || '').trim()
  if (!trimmed) return null

  const digits = trimmed.replace(/\D/g, '')
  if (/^[1-9]\d{5}$/.test(digits) && digits.length === 6) {
    return lookupIndiaPincode(digits)
  }

  const attempts = [trimmed.replace(/\s+/g, '')]
  if (UK_POSTCODE_RE.test(trimmed)) {
    const outward = trimmed.split(/\s+/)[0]
    if (!attempts.includes(outward)) attempts.push(outward)
  }

  for (const country of guessCountryCodes(addressHint)) {
    for (const code of attempts) {
      const result = await lookupZippopotam(country, code)
      if (result) return { ...result, pincode: trimmed }
    }
  }
  return null
}

export async function lookupPostalCode(code, mode = 'india', addressHint = '') {
  if (mode === 'india') return lookupIndiaPincode(code)
  return lookupInternationalZip(code, addressHint)
}
