/**
 * dashboard-mappers.js
 *
 * Pure mapping functions that transform raw API data into
 * display-ready shapes for Dashboard components.
 *
 * The fetch functions that were here have been removed —
 * all data fetching now goes through useDashboardData hook
 * which calls the /dashboard/* backend routes.
 */

import { formatCurrency } from '../utils/formatters'

export function mapHeaderStatsFromSummary(summary, role) {
  if (!summary) return { statItems: [] }
  const totalOrdersValue = summary.totalOrdersFormatted ?? formatCurrency(summary.totalOrders ?? 0)

  if (role === 'Buyer') {
    return {
      statItems: [
        { id: 'total-pos',      label: 'Total POs',         value: totalOrdersValue || '--' },
        { id: 'shipped-pos-ytd',label: 'Shipped POs YTD',   value: summary.shippedPosYTD ?? '--' },
        { id: 'open-pos',       label: 'PO Tracker',        value: summary.openPosYTD ?? '--' },
        { id: 'otif',           label: 'On-time Delivery',  value: summary.otifRate ?? '--' },
      ],
    }
  }

  return {
    statItems: [
      { id: 'buyer',           label: 'Active Buyer',            value: summary.currentBuyerLabel ?? 'All' },
      { id: 'total-pos',       label: 'Total POs',               value: totalOrdersValue || '--' },
      { id: 'total-pos-count', label: 'Total POs count',         value: summary.numberOfPos ?? '--' },
      { id: 'skus',            label: 'SKUs generating revenue',  value: summary.totalConvertedSKUs ?? '--' },
    ],
  }
}

export function mapKpisFromSummary(summary) {
  if (!summary) return {}
  const totalOrdersValue = summary.totalOrdersFormatted ?? formatCurrency(summary.totalOrders ?? 0)
  return {
    total_spend: {
      id: 'total_spend', title: 'Total Spend (YTD)', value: totalOrdersValue || '$0.00',
      change: summary.totalOrdersChange ?? null, status: summary.totalOrdersChangeStatus ?? null,
    },
    on_time_delivery: {
      id: 'on_time_delivery', title: 'On-Time Delivery', value: summary.otifRate ?? '0%',
      change: summary.otifChange ?? null, status: summary.otifChangeStatus ?? null,
    },
    quality_score: {
      id: 'quality_score', title: 'Quality Score', value: summary.qualityScore ?? '0%',
      change: summary.qualityChange ?? null, status: summary.qualityChangeStatus ?? null,
    },
    avg_lead_time: {
      id: 'avg_lead_time', title: 'Avg. Lead Time', value: summary.avgLeadTimeLabel ?? '0 Days',
      change: summary.avgLeadTimeChange ?? null, status: summary.avgLeadTimeChangeStatus ?? null,
    },
    po_acceptance: {
      id: 'po_acceptance', title: 'PO Acceptance Rate', value: summary.poAcceptanceRate ?? '0%',
      change: null, status: null,
    },
    avg_order_value: {
      id: 'avg_order_value', title: 'Avg. Order Value', value: summary.avgOrderValueFormatted ?? '$0',
      change: null, status: null,
    },
  }
}

export function mapSpendOverTime(raw) {
  if (!raw?.length) return []
  return raw.map(d => ({
    label: d.label,
    value: d.value,
    tooltipText: d.tooltipText || d.valueFormatted || `$${d.value?.toLocaleString?.() ?? d.value}`,
  }))
}

export function mapRecentOrders(raw) {
  if (!raw?.length) return { items: [], pageSize: 4 }
  return {
    items: raw.map(o => ({
      id: o.id,
      value: o.valueFormatted ?? o.value,
      status: o.statusLabel ?? o.status,
      delivery: o.deliveryLabel ?? o.delivery,
      date: o.dateLabel ?? o.date,
    })),
    pageSize: 4,
  }
}

export function mapBuyerDetails(raw) {
  if (!raw?.buyers?.length) return null
  return { buyers: raw.buyers }
}