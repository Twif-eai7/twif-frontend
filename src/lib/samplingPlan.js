// ANSI/ASQ Z1.4 (MIL-STD-105E) single-sampling-plan lookup for Normal
// Inspection, scoped to this org's fixed defect policy: Critical = AQL 0
// (zero tolerance -- Ac=0/Re=1 for every code letter, unconditionally),
// Major = AQL 2.5, Minor = AQL 4.0. Transcribed from the three reference
// charts shared for this feature (lot size -> code letter, code letter ->
// sample size, code letter -> Ac/Re).

export const INSPECTION_LEVELS = [
  { value: 'G-I',   label: 'General I' },
  { value: 'G-II',  label: 'General II' },
  { value: 'G-III', label: 'General III' },
  { value: 'S-1',   label: 'Special S-1' },
  { value: 'S-2',   label: 'Special S-2' },
  { value: 'S-3',   label: 'Special S-3' },
  { value: 'S-4',   label: 'Special S-4' },
]

// Ascending upper bounds only -- a lot size resolves to the first bracket
// whose max it doesn't exceed. (The source chart's printed lower-bound
// labels have a small gap around the 151-500 boundary; reading by upper
// bound only, as these tables are meant to be read, avoids that gap.)
export const LOT_SIZE_BRACKETS = [
  { max: 8,        row: { 'G-I': 'A', 'G-II': 'A', 'G-III': 'B', 'S-1': 'A', 'S-2': 'A', 'S-3': 'A', 'S-4': 'A' } },
  { max: 15,       row: { 'G-I': 'A', 'G-II': 'B', 'G-III': 'C', 'S-1': 'A', 'S-2': 'A', 'S-3': 'A', 'S-4': 'A' } },
  { max: 25,       row: { 'G-I': 'B', 'G-II': 'C', 'G-III': 'D', 'S-1': 'A', 'S-2': 'A', 'S-3': 'B', 'S-4': 'B' } },
  { max: 50,       row: { 'G-I': 'C', 'G-II': 'D', 'G-III': 'E', 'S-1': 'A', 'S-2': 'B', 'S-3': 'B', 'S-4': 'C' } },
  { max: 90,       row: { 'G-I': 'C', 'G-II': 'E', 'G-III': 'F', 'S-1': 'B', 'S-2': 'B', 'S-3': 'C', 'S-4': 'C' } },
  { max: 150,      row: { 'G-I': 'D', 'G-II': 'F', 'G-III': 'G', 'S-1': 'B', 'S-2': 'B', 'S-3': 'C', 'S-4': 'D' } },
  { max: 280,      row: { 'G-I': 'E', 'G-II': 'G', 'G-III': 'H', 'S-1': 'B', 'S-2': 'C', 'S-3': 'D', 'S-4': 'E' } },
  { max: 500,      row: { 'G-I': 'F', 'G-II': 'H', 'G-III': 'J', 'S-1': 'B', 'S-2': 'C', 'S-3': 'D', 'S-4': 'E' } },
  { max: 1200,     row: { 'G-I': 'G', 'G-II': 'J', 'G-III': 'K', 'S-1': 'C', 'S-2': 'C', 'S-3': 'E', 'S-4': 'F' } },
  { max: 3200,     row: { 'G-I': 'H', 'G-II': 'K', 'G-III': 'L', 'S-1': 'C', 'S-2': 'D', 'S-3': 'E', 'S-4': 'G' } },
  { max: 10000,    row: { 'G-I': 'J', 'G-II': 'L', 'G-III': 'M', 'S-1': 'C', 'S-2': 'D', 'S-3': 'F', 'S-4': 'G' } },
  { max: 35000,    row: { 'G-I': 'K', 'G-II': 'M', 'G-III': 'N', 'S-1': 'C', 'S-2': 'D', 'S-3': 'F', 'S-4': 'H' } },
  { max: 150000,   row: { 'G-I': 'L', 'G-II': 'N', 'G-III': 'P', 'S-1': 'D', 'S-2': 'E', 'S-3': 'G', 'S-4': 'J' } },
  { max: 500000,   row: { 'G-I': 'M', 'G-II': 'P', 'G-III': 'Q', 'S-1': 'D', 'S-2': 'E', 'S-3': 'G', 'S-4': 'J' } },
  { max: Infinity, row: { 'G-I': 'N', 'G-II': 'Q', 'G-III': 'R', 'S-1': 'D', 'S-2': 'E', 'S-3': 'H', 'S-4': 'K' } },
]

export const SAMPLE_SIZE_BY_LETTER = {
  A: 2, B: 3, C: 5, D: 8, E: 13, F: 20, G: 32, H: 50,
  J: 80, K: 125, L: 200, M: 315, N: 500, P: 800, Q: 1250, R: 2000,
}

// Resolved (arrow-followed) Accept/Reject pairs for Normal Inspection at the
// org's two governed AQLs, read directly off the reference chart cell by
// cell with every arrow substitution already resolved (an earlier formula-
// based extrapolation of this table turned out wrong -- it assumed an
// unbounded +1-level-per-row staircase, when the real chart has double-steps
// at both ends and plateaus at 21/22 from letter N onward). Every code
// letter A-R resolves to a real value for both columns -- there are no
// gaps left to fall back on manual entry for.
export const AC_RE_MAJOR_2_5 = {
  A: [0, 1], B: [0, 1], C: [0, 1], D: [1, 2], E: [1, 2], F: [1, 2], G: [2, 3], H: [3, 4],
  J: [5, 6], K: [7, 8], L: [10, 11], M: [14, 15], N: [21, 22], P: [21, 22], Q: [21, 22], R: [21, 22],
}
export const AC_RE_MINOR_4_0 = {
  A: [0, 1], B: [0, 1], C: [0, 1], D: [1, 2], E: [1, 2], F: [2, 3], G: [3, 4], H: [5, 6],
  J: [7, 8], K: [10, 11], L: [14, 15], M: [21, 22], N: [21, 22], P: [21, 22], Q: [21, 22], R: [21, 22],
}

// { lotSize, inspectionLevel } -> { codeLetter, sampleSize, critical, major, minor }
// or null when lotSize/inspectionLevel is missing or out of the table's range.
export function resolveSamplingPlan({ lotSize, inspectionLevel }) {
  const n = Number(lotSize)
  if (!n || n < 2 || !inspectionLevel) return null

  const bracket = LOT_SIZE_BRACKETS.find(b => n <= b.max)
  const codeLetter = bracket?.row?.[inspectionLevel]
  if (!codeLetter) return null

  const sampleSize = SAMPLE_SIZE_BY_LETTER[codeLetter]
  const major = AC_RE_MAJOR_2_5[codeLetter]
  const minor = AC_RE_MINOR_4_0[codeLetter]

  return {
    codeLetter,
    sampleSize,
    critical: { ac: 0, re: 1 },
    major: major ? { ac: major[0], re: major[1] } : null,
    minor: minor ? { ac: minor[0], re: minor[1] } : null,
  }
}

// The plan for a SAMPLE actually inspected (Inspection Quantity), not for a lot
// size: Ac/Re depend on how many units were examined. Uses the code letter whose
// standard sample size equals `sampleQty`; a quantity between two standard sizes
// takes the next size DOWN (the stricter plan), so a smaller-than-planned sample
// never gets a looser allowance. Below the smallest standard sample -> null.
export function resolveSamplingPlanBySampleSize(sampleQty) {
  const n = Number(sampleQty)
  if (!n || n < 2) return null
  let letter = null
  for (const [l, size] of Object.entries(SAMPLE_SIZE_BY_LETTER)) {
    if (size <= n) letter = l
  }
  if (!letter) return null
  const major = AC_RE_MAJOR_2_5[letter]
  const minor = AC_RE_MINOR_4_0[letter]
  return {
    codeLetter: letter,
    sampleSize: SAMPLE_SIZE_BY_LETTER[letter],
    critical: { ac: 0, re: 1 },
    major: major ? { ac: major[0], re: major[1] } : null,
    minor: minor ? { ac: minor[0], re: minor[1] } : null,
  }
}
