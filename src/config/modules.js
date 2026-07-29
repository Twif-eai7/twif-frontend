export const MODULES = [
  {
    key: 'npd',
    label: 'New Product Development',
    tabs: [],
  },
  {
    key: 'orders',
    label: 'Order Management',
    tabs: [
      { key: 'po-table',                    label: 'Daily PO and PI records' },
      { key: 'po-file-records',             label: 'PO File Records' },
      { key: 'pct',                         label: 'PCT' },
      { key: 'recent-po',                   label: 'PO Tracker' },
      { key: 'inspection-pending-dispatch', label: 'Inspection Pending Dispatch' },
      { key: 'open-po-summary',             label: 'Open PO Summary' },
      { key: 'shipped-po-summary',          label: 'Shipped PO Summary' },
    ],
  },
  {
    key: 'fms',
    label: 'Flow Management System',
    tabs: [
      { key: 'fms-dashboard-1', label: 'FMS 1 Dashboard' },
      { key: 'fms-dashboard-2', label: 'FMS 2 Dashboard' },
      { key: 'fms-form',        label: 'FMS1 Form' },
      { key: 'fms1',            label: 'FMS1 tracker' },
      { key: 'fms2',            label: 'FMS2 tracker' },
      { key: 'fms3',            label: 'FMS3 tracker' },
      { key: 'fms4',            label: 'FMS4 tracker' },
    ],
  },
  {
    key: 'quality',
    label: 'Quality & Compliance',
    tabs: [
      { key: 'audit-summary',   label: 'QA Reports' },
      { key: 'ftpr-summary',   label: 'FTPR Summary' },
      { key: 'po-inspection',  label: 'PO Inspection' },
      { key: 'irf',            label: 'IRF' },
    ],
  },
  {
    key: 'financial',
    label: 'Financial',
    tabs: [
      { key: 'invoice-list', label: 'Invoices' },
      { key: 'claims',       label: 'Claims' },
      { key: 'weekly-po',    label: 'Weekly PO Schedule' },
      { key: 'pl-weekly',    label: 'P&L Weekly Summary' },
      { key: 'pl-monthly',   label: 'P&L Monthly Summary' },
    ],
  },
  {
    key: 'logistics',
    label: 'Logistics',
    tabs: [
      { key: 'reports',                      label: 'Reports' },
      { key: 'courier-logs-domestic',        label: 'Courier Logs (Domestic)' },
      { key: 'courier-logs-international',   label: 'Courier Logs (International)' },
      { key: 'shipment-containers',          label: 'Logistics MIS' },
    ],
  },
  {
    key: 'tools',
    label: 'Travel',
    tabs: [
      { key: 'travel-form', label: 'Place a request' },
      { key: 'travel-bill', label: 'Upload Travel Bill' },
    ],
  },
  {
    key: 'issues',
    label: 'Issue Tracker',
    tabs: [
      { key: 'issue-tracker',        label: 'Issue Tracker' },
      { key: 'jit-dashboard',        label: 'JIT Dashboard' },
      { key: 'merchant-performance', label: 'Merchant Performance' },
    ],
  },
]

const DEPT_MODULE_KEYS = {
  merchandising: ['npd', 'orders', 'quality'],
  logistics:     ['logistics', 'orders'],
  qa:            ['quality'],
  erp:           ['financial', 'fms'],
  it:            ['tools', 'issues'],
  tech:          ['tools', 'issues'],
}

/** Returns the object-format allowed_modules for a department, e.g. { orders: null, quality: null } */
export function defaultModulesForDept(department) {
  const keys = DEPT_MODULE_KEYS[department] || MODULES.map(m => m.key)
  return Object.fromEntries(keys.map(k => [k, null]))
}
