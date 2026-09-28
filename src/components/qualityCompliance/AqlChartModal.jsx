import { LOT_SIZE_BRACKETS, SAMPLE_SIZE_BY_LETTER, AC_RE_MAJOR_2_5, AC_RE_MINOR_4_0 } from '../../lib/samplingPlan'

const LEVEL_COLUMNS = [
  { key: 'G-I',  label: 'General I' },
  { key: 'G-II', label: 'General II' },
  { key: 'G-III', label: 'General III' },
  { key: 'S-1', label: 'S-1' },
  { key: 'S-2', label: 'S-2' },
  { key: 'S-3', label: 'S-3' },
  { key: 'S-4', label: 'S-4' },
]

// Same brackets resolveSamplingPlan() reads - labelled as printed ranges
// ("2 to 8", "9 to 15", ...) rather than the raw upper-bound-only shape used
// for the lookup itself.
function lotSizeRows() {
  let lower = 2
  return LOT_SIZE_BRACKETS.map(b => {
    const label = b.max === Infinity ? `${lower.toLocaleString()} and over` : `${lower.toLocaleString()} to ${b.max.toLocaleString()}`
    lower = b.max + 1
    return { label, row: b.row }
  })
}

function acRe(map, letter) {
  const pair = map[letter]
  return pair ? `${pair[0]} / ${pair[1]}` : '-'
}

export default function AqlChartModal({ onClose }) {
  const codeLetters = Object.keys(SAMPLE_SIZE_BY_LETTER)

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh]">

        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="text-sm font-bold text-gray-900">AQL Charts</div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors cursor-pointer"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4 space-y-5 overflow-y-auto">
          <div>
            <div className="text-xs font-bold text-gray-900 mb-2">Sample Size Code Letters</div>
            <div className="border border-gray-200 rounded-lg overflow-x-auto">
              <table className="w-full text-xs whitespace-nowrap">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 text-[10px] uppercase tracking-wide">
                    <th className="text-left px-3 py-2 font-bold">Lot Size</th>
                    {LEVEL_COLUMNS.map(c => <th key={c.key} className="text-center px-2 py-2 font-bold">{c.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {lotSizeRows().map(({ label, row }) => (
                    <tr key={label} className="border-t border-gray-100">
                      <td className="px-3 py-1.5 text-gray-700">{label}</td>
                      {LEVEL_COLUMNS.map(c => (
                        <td key={c.key} className="px-2 py-1.5 text-center font-semibold text-gray-800">{row[c.key]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <div className="text-xs font-bold text-gray-900 mb-2">Acceptance Quality Levels (Normal Inspection)</div>
            <p className="text-[10px] text-gray-400 mb-2">
              Ac / Re shown for this org's governed AQLs only - Critical (AQL 0), Major (AQL 2.5), Minor (AQL 4.0) -
              matching what this app actually applies. Other AQL levels from the standard chart aren't used here.
            </p>
            <div className="border border-gray-200 rounded-lg overflow-x-auto">
              <table className="w-full text-xs whitespace-nowrap">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 text-[10px] uppercase tracking-wide">
                    <th className="text-left px-3 py-2 font-bold">Code Letter</th>
                    <th className="text-center px-2 py-2 font-bold">Sample Size</th>
                    <th className="text-center px-2 py-2 font-bold">Critical (Ac/Re)</th>
                    <th className="text-center px-2 py-2 font-bold">Major 2.5 (Ac/Re)</th>
                    <th className="text-center px-2 py-2 font-bold">Minor 4.0 (Ac/Re)</th>
                  </tr>
                </thead>
                <tbody>
                  {codeLetters.map(letter => (
                    <tr key={letter} className="border-t border-gray-100">
                      <td className="px-3 py-1.5 font-semibold text-gray-800">{letter}</td>
                      <td className="px-2 py-1.5 text-center text-gray-700">{SAMPLE_SIZE_BY_LETTER[letter]}</td>
                      <td className="px-2 py-1.5 text-center text-gray-700">0 / 1</td>
                      <td className="px-2 py-1.5 text-center text-gray-700">{acRe(AC_RE_MAJOR_2_5, letter)}</td>
                      <td className="px-2 py-1.5 text-center text-gray-700">{acRe(AC_RE_MINOR_4_0, letter)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
