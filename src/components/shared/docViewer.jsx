import { useState, useEffect } from 'react'

export function getExtension(url) {
  const clean = url.split('?')[0].split('#')[0]
  const dot = clean.lastIndexOf('.')
  return dot === -1 ? '' : clean.slice(dot + 1).toLowerCase()
}

// Browsers have no native Excel viewer, so this parses the sheet client-side
// and renders it as a plain table - React escapes cell text automatically,
// unlike XLSX.utils.sheet_to_html which would inject raw, unescaped vendor
// content. `xlsx` is dynamically imported so it doesn't bloat the main
// bundle for the common case where this is never rendered.
export function SpreadsheetView({ url }) {
  const [sheets, setSheets]         = useState(null) // { names, data: { [name]: rows[][] } }
  const [activeSheet, setActiveSheet] = useState(null)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all([import('xlsx'), fetch(url).then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.arrayBuffer()
    })])
      .then(([XLSX, buf]) => {
        if (cancelled) return
        const wb = XLSX.read(buf, { type: 'array' })
        const data = {}
        wb.SheetNames.forEach(name => {
          data[name] = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', raw: false })
        })
        setSheets({ names: wb.SheetNames, data })
        setActiveSheet(wb.SheetNames[0])
      })
      .catch(err => { if (!cancelled) setError(err.message || 'Could not load this file') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [url])

  if (loading) return <div className="flex-1 flex items-center justify-center text-sm text-gray-400">Loading spreadsheet…</div>
  if (error) return (
    <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-6">
      <p className="text-sm text-gray-500">Couldn't preview this file ({error})</p>
      <a href={url} target="_blank" rel="noreferrer" className="text-xs font-medium text-gray-900 hover:underline">Download instead</a>
    </div>
  )

  const rows = sheets.data[activeSheet] || []

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {sheets.names.length > 1 && (
        <div className="flex items-center gap-1 px-3 py-2 border-b border-gray-100 overflow-x-auto flex-shrink-0">
          {sheets.names.map(name => (
            <button key={name} type="button" onClick={() => setActiveSheet(name)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors cursor-pointer
                ${activeSheet === name ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
              {name}
            </button>
          ))}
        </div>
      )}
      <div className="flex-1 overflow-auto">
        <table className="text-xs border-collapse">
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} className={ri === 0 ? 'bg-gray-50' : ''}>
                {row.map((cell, ci) => (
                  <td key={ci} className={`border border-gray-100 px-2 py-1 whitespace-nowrap ${ri === 0 ? 'font-semibold text-gray-700' : 'text-gray-600'}`}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
