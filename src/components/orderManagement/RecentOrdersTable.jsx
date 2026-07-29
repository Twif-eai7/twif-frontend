import React from 'react'

function StatusBadge({ status }) {
  const n = (status || '').toLowerCase().replace(/\s/g, '-')
  let cls = 'inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-medium'
  if (n === 'shipped') cls += ' bg-blue-50 text-blue-700'
  else if (n === 'on-time') cls += ' bg-green-50 text-green-700'
  else if (n === 'delayed') cls += ' bg-amber-50 text-amber-700'
  else cls += ' bg-gray-100 text-gray-600'
  return <span className={cls}>{status}</span>
}

export default function RecentOrdersTable({ recent }) {
  const [page, setPage] = React.useState(1)
  const items = recent?.items ?? []
  const pageSize = recent?.pageSize ?? 4
  const totalPages = items.length ? Math.ceil(items.length / pageSize) : 1
  const start = (page - 1) * pageSize
  const pageItems = items.slice(start, start + pageSize)

  const prev = () => setPage((p) => Math.max(1, p - 1))
  const next = () => setPage((p) => Math.min(totalPages, p + 1))

  if (!items.length) {
    return (
      <div className="text-xs text-gray-500 py-4 text-center">No recent orders.</div>
    )
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs border-collapse">
          <thead>
            <tr className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
              <th className="px-3 py-2 text-left font-medium border-b border-gray-200">PO ID</th>
              <th className="px-3 py-2 text-left font-medium border-b border-gray-200">Value</th>
              <th className="px-3 py-2 text-left font-medium border-b border-gray-200">Status</th>
              <th className="px-3 py-2 text-left font-medium border-b border-gray-200">Delivery</th>
              <th className="px-3 py-2 text-left font-medium border-b border-gray-200">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {pageItems.map((o) => (
              <tr key={o.id} className="text-[13px]">
                <td className="px-3 py-2 whitespace-nowrap text-gray-900">{o.id}</td>
                <td className="px-3 py-2 whitespace-nowrap text-gray-900">{o.value}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <StatusBadge status={o.status} />
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <StatusBadge status={o.delivery} />
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-gray-700">{o.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-between text-[11px] text-gray-500">
        <button
          type="button"
          onClick={prev}
          disabled={page <= 1}
          className="px-2 py-1 rounded border border-gray-200 disabled:text-gray-300 disabled:cursor-not-allowed"
        >
          Prev
        </button>
        <span>
          Page {page} of {totalPages}
        </span>
        <button
          type="button"
          onClick={next}
          disabled={page >= totalPages}
          className="px-2 py-1 rounded border border-gray-200 disabled:text-gray-300 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </>
  )
}
