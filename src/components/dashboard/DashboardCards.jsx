import React from 'react'

function KpiCard({ id, title, value, change, status }) {
  const isPositive = status === 'positive'
  const isNegative = status === 'negative'
  return (
    <div
      className="flex flex-col p-4 rounded-xl border border-gray-200 bg-white shadow-sm min-h-[120px] hover:border-[#3a83f0] hover:shadow-md transition-all"
      data-card-id={id}
    >
      <div className="flex items-center justify-between mb-2 text-xs text-gray-500">
        <h2 className="font-medium text-gray-800">{title}</h2>
        {change && (
          <span className="text-[11px] text-blue-700 font-medium">{change}</span>
        )}
      </div>
      <div className="flex-1 flex flex-col justify-between">
        <div className="text-xl sm:text-2xl font-semibold text-gray-900">{value}</div>
        {change && (
          <div
            className={`mt-1 flex items-center gap-1 text-xs font-medium ${
              isPositive ? 'text-green-600' : isNegative ? 'text-red-600' : 'text-gray-500'
            }`}
          >
            {isPositive && <span>▲</span>}
            {isNegative && <span>▼</span>}
            <span>{change}</span>
          </div>
        )}
      </div>
    </div>
  )
}

function BuyerDetailsCard({ buyerDetails }) {
  if (!buyerDetails?.current) return null
  const { name, email, role, page, totalPages } = buyerDetails.current
  return (
    <div className="flex flex-col p-4 rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between mb-2 text-xs text-gray-500">
        <h2 className="font-medium text-gray-800">Buyer&apos;s Details</h2>
        <span className="text-blue-700 text-[11px]">View All</span>
      </div>
      <div className="flex flex-col gap-3 text-sm mt-1">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-semibold text-gray-600">
            {name
              ?.split(' ')
              .map((p) => p[0])
              .join('')
              .toUpperCase()
              .slice(0, 2)}
          </div>
          <div>
            <div className="text-sm font-medium text-gray-900">{name}</div>
            <div className="text-xs text-gray-500">{role}</div>
          </div>
        </div>
        <div className="text-xs">
          <div className="text-gray-500 mb-0.5">Email</div>
          <div className="text-gray-800">{email}</div>
        </div>
      </div>
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-[11px] text-gray-500">
          <button
            type="button"
            disabled={page <= 1}
            onClick={buyerDetails.onPrev}
            className="px-2 py-1 rounded border border-gray-200 disabled:text-gray-300 disabled:border-gray-100 disabled:cursor-not-allowed"
          >
            Prev
          </button>
          <span>
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={buyerDetails.onNext}
            className="px-2 py-1 rounded border border-gray-200 disabled:text-gray-300 disabled:border-gray-100 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}

export default function DashboardCards({ kpis, role, buyerDetails }) {
  const cards = [
    kpis?.total_spend,
    kpis?.on_time_delivery,
    kpis?.quality_score,
    kpis?.avg_lead_time,
    kpis?.po_acceptance,
    kpis?.avg_order_value,
  ].filter(Boolean)

  return (
    <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => (
        <KpiCard key={c.id} {...c} />
      ))}
      {role === 'Merchant' && buyerDetails?.current && (
        <BuyerDetailsCard buyerDetails={buyerDetails} />
      )}
    </div>
  )
}
