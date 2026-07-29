export const DOMESTIC_COURIERS = [
  'BlueDart',
  'DTDC',
  'Delhivery',
  'Ecom Express',
  'Xpressbees',
  'Ekart Logistics',
  'Shadowfax',
  'FedEx',
  'DHL',
  'India Post',
  'Professional Couriers',
  'Safexpress',
  'Trackon Couriers',
  'Maruti Courier',
]

export const INTERNATIONAL_COURIERS = [
  'DHL',
  'UPS',
  'FedEx International',
]

export function invoicePrefix(type, date = new Date()) {
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const yy = String(date.getFullYear()).slice(-2)
  return `${type === 'international' ? 'I' : 'D'}${dd}${mm}${yy}`
}

export function nextInvoiceNumber(logs, type, date = new Date()) {
  const prefix = invoicePrefix(type, date)
  let maxSerial = -1
  for (const log of logs) {
    const inv = log.invoice_number
    if (!inv?.startsWith(prefix)) continue
    const serial = parseInt(inv.slice(prefix.length), 10)
    if (!Number.isNaN(serial) && serial > maxSerial) maxSerial = serial
  }
  return prefix + String(maxSerial + 1).padStart(2, '0')
}
