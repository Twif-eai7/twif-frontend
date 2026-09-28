export const MODULES = [
  {
    key: 'dashboard',
    label: 'My Dashboard',
    tabs: [
      { key: 'kpi-mis', label: 'KPI & MIS' },
    ],
  },
  {
    key: 'npd',
    label: 'New Product Development',
    tabs: [
      { key: 'kaptr',         label: 'Kaptr' },
      { key: 'pd-tracker',    label: 'PD Tracker' },
      { key: 'style-library', label: 'Item Master' },
      { key: 'sku-import',    label: 'SKU Import' },
    ],
  },
  {
    key: 'orders',
    label: 'Order Management',
    tabs: [
      { key: 'po-table',                    label: 'Daily PO and PI records' },
      { key: 'otif-exceptions',             label: 'Exception Requests' },
      { key: 'po-file-records',             label: 'PO File Records' },
      { key: 'pct',                         label: 'PCT' },
      { key: 'recent-po',                   label: 'PO Tracker' },
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
      { key: 'factory-audit',  label: 'Factory Audits' },
      { key: 'ftpr-summary',   label: 'FTPR Summary' },
      { key: 'po-inspection',  label: 'PO Inspection' },
      { key: 'inspection-schedule', label: 'Inspection Schedule' },
      { key: 'qc-reports',     label: 'QC Reports' },
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
      { key: 'shipment-containers',          label: 'Shipment & Planning' },
      { key: 'shipment-invoices',            label: 'Shipment Invoices' },
      { key: 'courier-logs-domestic',        label: 'Courier Logs (Domestic)' },
      { key: 'courier-logs-international',   label: 'Courier Logs (International)' },
      { key: 'shipping-docs',                label: 'Shipping Docs Listings' },
      { key: 'inspection-pending-dispatch',   label: 'Inspection Pending Dispatch' },
      { key: 'reports',                      label: 'Reports' },
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

// 'dashboard' (My Dashboard / KPI & MIS) is included for every department -
// it had no access gate at all before this module existed (every Merchant
// member always saw it), so every new member still gets it by default here,
// same as before, just now as a real, admin-toggleable entry instead of an
// unconditional one.
// 'quality' (Quality & Compliance) is included for every department too, same
// reasoning as 'dashboard' above - it should be visible to every Merchant
// member regardless of department, not just merchandising/qa.
const DEPT_MODULE_KEYS = {
  merchandising: ['dashboard', 'npd', 'orders', 'quality'],
  logistics:     ['dashboard', 'logistics', 'orders', 'quality'],
  qa:            ['dashboard', 'quality'],
  erp:           ['dashboard', 'financial', 'fms', 'quality'],
  it:            ['dashboard', 'tools', 'issues', 'quality'],
  tech:          ['dashboard', 'tools', 'issues', 'quality'],
}

/** Returns the object-format allowed_modules for a department, e.g. { orders: null, quality: null } */
export function defaultModulesForDept(department) {
  const keys = DEPT_MODULE_KEYS[department] || MODULES.map(m => m.key)
  return Object.fromEntries(keys.map(k => [k, null]))
}
