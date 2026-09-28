// A report's date for QC calendars, date-range filters, trends and FTPR: its Inspection Date
// when the QA typed one, otherwise the day it was submitted. Inspection Date is manual entry
// only (never filled in automatically), so a report submitted with it blank must still show up
// in date-filtered views instead of silently dropping out.

const pad = (n) => String(n).padStart(2, '0')

// Local calendar date (YYYY-MM-DD) of an ISO timestamp.
export function localDateOf(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function reportEffectiveDate(report) {
  if (report?.inspection_date) return report.inspection_date
  return report?.submitted_at ? localDateOf(report.submitted_at) : null
}

// PostgREST `.or()` filters for supabase-js queries on inspection_reports. The submitted_at
// bounds are the exact instants of local midnight / end of day, so they match the local-date
// bucketing above.
const startInstant = (day) => new Date(`${day}T00:00:00`).toISOString()
const endInstant = (day) => new Date(`${day}T23:59:59.999`).toISOString()

export function effectiveDateRangeFilter(startDay, endDay) {
  return `and(inspection_date.gte.${startDay},inspection_date.lte.${endDay}),`
    + `and(inspection_date.is.null,submitted_at.gte.${startInstant(startDay)},submitted_at.lte.${endInstant(endDay)})`
}

export function effectiveDateFromFilter(startDay) {
  return `inspection_date.gte.${startDay},and(inspection_date.is.null,submitted_at.gte.${startInstant(startDay)})`
}
