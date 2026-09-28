import { Link, useMatch, useResolvedPath, useLocation } from 'react-router-dom'
import { useState } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { useProfileStore } from '../../stores/profileStore'
import { canAccessJnmPlFeatures } from '../../utils/jnmAccess'
import LogoMark from './LogoMark'

const ChevronDown = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 4l4 4 4-4" />
  </svg>
)
const ChevronRight = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 2l4 4-4 4" />
  </svg>
)

// NavCategory — navigates to `to`, auto-expands when that route is active
function NavCategory({ title, icon, to, href, children, collapsed }) {
  // hooks must always be called — handle missing `to` gracefully
  const resolved = useResolvedPath(to || '')
  const match    = useMatch({ path: resolved.pathname, end: true })
  const isActive = !!to && !!match

  // for external / no-route categories, use local open state
  const [localOpen, setLocalOpen] = useState(false)
  const isOpen = to ? isActive : localOpen

  const inner = (
    <span className="flex items-center gap-2">
      <span className={`flex-shrink-0 w-4 h-4 flex items-center justify-center
                        ${isOpen ? 'text-gray-700' : 'text-gray-400'}`}>
        {icon}
      </span>
      {!collapsed && <span>{title}</span>}
    </span>
  )

  const baseClass = `w-full flex items-center justify-between px-2.5 py-2 rounded-lg
                     text-xs font-semibold transition-colors
                     ${isOpen ? 'bg-gray-100 text-gray-900' : 'text-gray-700 hover:bg-gray-50'}
                     ${collapsed ? 'justify-center' : ''}`

  const chevron = !collapsed && children && (
    <span className={isOpen ? 'text-gray-500' : 'text-gray-300'}>
      {isOpen ? <ChevronDown /> : <ChevronRight />}
    </span>
  )

  return (
    <div className="mb-1">
      {/* external href — plain button that toggles children */}
      {href ? (
        <button
          type="button"
          onClick={() => setLocalOpen((v) => !v)}
          className={baseClass}
        >
          {inner}
          {chevron}
        </button>
      ) : (
        /* internal route — Link as before */
        <Link to={to} className={baseClass}>
          {inner}
          {chevron}
        </Link>
      )}

      {!collapsed && isOpen && children && (
        <div className="ml-4 pl-3 border-l border-gray-200 mt-0.5">
          {children}
        </div>
      )}
    </div>
  )
}

// NavSubLink — nested tab under a parent nav item
function NavSubLink({ to, children, onNavigate }) {
  const location = useLocation()
  const [toPath, toQuery] = (to || '').split('?')
  // Match on the params `to` actually specifies (e.g. `tab=`), not the full
  // query string — pages that mirror extra state into the URL (Inspection
  // Schedule appends `&date=...`) would otherwise never match here and the
  // link would never highlight as active.
  const toParams = new URLSearchParams(toQuery)
  const locParams = new URLSearchParams(location.search)
  const isActive = location.pathname === toPath &&
    (!toQuery || [...toParams].every(([k, v]) => locParams.get(k) === v))

  return (
    <Link
      to={to}
      onClick={onNavigate}
      className={`block py-1.5 px-2 text-[11px] rounded-md transition-colors
        ${isActive ? 'bg-blue-50 text-[rgba(17,0,255,1)] font-semibold' : 'text-gray-500 hover:bg-blue-50 hover:text-blue-600'}`}
    >
      {children}
    </Link>
  )
}

// NavLink — internal tab link (sets ?tab= param) or external anchor
function NavLink({ to, href, children, external, onNavigate }) {
  const location = useLocation()

  if (external || (!to && href)) {
    return (
      <a
        href={href}
        target={external ? '_blank' : undefined}
        rel={external ? 'noopener noreferrer' : undefined}
        className="block py-1.5 px-2 text-[11.5px] text-gray-500 hover:bg-blue-50 hover:text-blue-600 rounded-md transition-colors"
      >
        {children}
      </a>
    )
  }

  // Determine active: path matches AND (no query expected OR the params
  // `to` specifies are present in the current URL). Checking just those
  // params — not the full query string — matters for pages like Inspection
  // Schedule that mirror extra state (`&date=...`) into the URL; an exact
  // full-string match would never fire for them.
  const [toPath, toQuery] = (to || '').split('?')
  const toParams = new URLSearchParams(toQuery)
  const locParams = new URLSearchParams(location.search)
  const isActive = location.pathname === toPath &&
    (!toQuery || [...toParams].every(([k, v]) => locParams.get(k) === v))

  return (
    <Link
      to={to}
      onClick={onNavigate}
      className={`block py-2 px-2 text-[11.5px] rounded-md transition-colors
        ${isActive ? 'bg-blue-50 text-[rgba(17,0,255,1)] font-semibold' : 'text-gray-500 hover:bg-blue-50 hover:text-blue-600'}`}
    >
      {children}
    </Link>
  )
}

const IconGrid = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="7" height="7" />
    <rect x="14" y="3" width="7" height="7" />
    <rect x="3" y="14" width="7" height="7" />
    <rect x="14" y="14" width="7" height="7" />
  </svg>
)
const IconChart = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
  </svg>
)
const IconOrder = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M9 2L9 12L15 12L15 2" />
    <path d="M12 9L19 2L19 22L5 22L5 2L12 9Z" />
  </svg>
)
const IconFlow = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="4" r="2"></circle>
    <circle cx="6" cy="12" r="2"></circle>
    <circle cx="18" cy="12" r="2"></circle>
    <circle cx="12" cy="20" r="2"></circle>
    <path d="M12 6V10"></path>
    <path d="M12 10L6 12"></path>
    <path d="M12 10L18 12"></path>
    <path d="M6 14L12 18"></path>
    <path d="M18 14L12 18"></path>
  </svg>
)
const IconCheck = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M9 11L12 14L22 4" />
    <path d="M21 12V19A2 2 0 0 1 19 21H5A2 2 0 0 1 3 19V5A2 2 0 0 1 5 3H16" />
  </svg>
)
const IconDollar = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="12" y1="1" x2="12" y2="23" />
    <path d="M17 5H9.5A3.5 3.5 0 0 0 6 8.5A3.5 3.5 0 0 0 9.5 12H14.5A3.5 3.5 0 0 1 18 15.5A3.5 3.5 0 0 1 14.5 19H6" />
  </svg>
)
const IconShip = () => (
  <svg
    className="w-4 h-4"
    viewBox="0 0 512 512"
    fill="currentColor"       // ← inherits text color like other icons
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M496,288h-17v-96c0-8.836-6.164-16-15-16H240.001c-8.836,0-17.001,7.164-17.001,16v96h-32V144c0-8.836-6.163-16-14.999-16 H143V80c0-8.836-7.164-16-16-16s-16,7.164-16,16v48H96.001C87.165,128,79,135.164,79,144v48H48.001C39.165,192,31,199.164,31,208v80 H16.001c-5.313,0-10.273,2.633-13.25,7.031c-2.977,4.398-3.578,9.984-1.609,14.914l29.828,74.555l-14.148,42.437 c-1.625,4.883-0.805,10.243,2.203,14.414c3.008,4.18,7.836,6.649,12.977,6.649H368c79.398,0,144-64.602,144-144 C512,295.164,504.836,288,496,288z M255,208h192v80h-48v-48h16v-16h-32v64h-32v-48h16v-16h-32v64h-32v-48h16v-16h-32v64h-32V208z M63,224h33.001c8.836,0,14.999-7.164,14.999-16v-48h48v128H63V224z M368,416H54.197l8.984-26.938 c1.195-3.594,1.078-7.492-0.32-11.008L39.634,320h8.367h128h64H464h14.859C471.07,374,424.328,416,368,416z" />
  </svg>
)
const IconSupport = () => (
  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16V12" />
    <path d="M12 8H12.01" />
  </svg>
)
const IconNPD = () => (
  <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="10"></circle>
    <path d="M14.31 8l.89-2.17a1 1 0 0 0-1.79-1.11l-1.4 1.95"></path>
    <path d="M9.69 8l-.89-2.17a1 1 0 0 1 1.79-1.11l1.4 1.95"></path>
    <circle cx="12" cy="12" r="3"></circle>
    <path d="M12 15v-3"></path>
    <path d="M12 9v-.01"></path>
  </svg>
)

export default function Sidebar({ role, allowedModules, collapsed, onCollapseChange, mobileOpen, onMobileOpen, onMobileClose }) {
  const title =
    role === 'Buyer' ? 'Buyer Portal' : role === 'Merchant' ? 'Merchant Portal' : 'Supplier Portal'

  // `collapsed` is a desktop-only preference (the "← Collapse" toggle at
  // the bottom, hidden lg:flex below) - it used to leak straight into the
  // mobile drawer too, rendering it as the same icon-only w-14 strip
  // desktop shows when collapsed, with no labels and no "Merchant Portal"
  // title, instead of the full-width drawer with text a mobile user
  // actually needs (there's no room to tap-expand an icon-only item on a
  // phone the way desktop's hover/wider layout allows). The mobile drawer
  // is already its own overlay the user opens/closes outright, so
  // "collapsed" has no meaningful equivalent there - always full width
  // while open, regardless of whatever the desktop preference happens to
  // be.
  const effectiveCollapsed = collapsed && !mobileOpen

  const userEmail = useAuthStore((s) => s.session?.user?.email)
  const orgMembership = useProfileStore((s) => s.orgMembership)
  const hasJnmPlAccess = canAccessJnmPlFeatures(userEmail, orgMembership)

  // Temporary, hard-coded restriction — Item Master / SKU Import are still
  // being actively rebuilt, so tech-dept-only for now regardless of
  // department defaults, no admin/owner bypass. Allows erp (not just tech)
  // too — erp is one of the two departments that get "batch ready to
  // review" alerts, so they need to actually be able to reach this page.
  const canSeeStyleLibrary = orgMembership?.department === 'tech' || orgMembership?.department === 'erp'
  // Close mobile drawer on navigation
  const closeMobile = mobileOpen ? onMobileClose : undefined

  const content = role === 'Buyer' ? (
    <>
      <NavCategory title="New Product Development" icon={<IconNPD />} href="#" collapsed={effectiveCollapsed}>
        {/* Kaptr (SKU capture) intentionally omitted for buyers — buyer self-create isn't wired yet. */}
        <NavLink to="/plm" onNavigate={closeMobile}>PD Tracker</NavLink>
      </NavCategory>
      {/* Coming soon — uncomment as sections are built out for buyers
      <NavCategory title="Product Catalogs" icon={<IconGrid />} to="/dashboard/catalogs" collapsed={effectiveCollapsed}>
        <NavLink href="/collections/home-decor" onNavigate={closeMobile}>Home Decor</NavLink>
        <NavLink href="/collections/furniture" onNavigate={closeMobile}>Furniture</NavLink>
        <NavLink href="/collections/bed-linens" onNavigate={closeMobile}>Textile</NavLink>
        <NavLink href="/collections/" onNavigate={closeMobile}>All Catalogues</NavLink>
      </NavCategory>
      <NavCategory title="Order Management" icon={<IconOrder />} to="/dashboard/orders" collapsed={effectiveCollapsed}>
        <NavLink to="/dashboard/orders?tab=open-pos" onNavigate={closeMobile}>Open POs</NavLink>
        <NavLink to="/dashboard/orders?tab=shipped-pos" onNavigate={closeMobile}>Shipped POs</NavLink>
        <NavLink to="/dashboard/orders?tab=po-file-records" onNavigate={closeMobile}>PO File Records</NavLink>
      </NavCategory>
      <NavCategory title="Quality & Compliance" icon={<IconCheck />} to="/dashboard/quality" collapsed={effectiveCollapsed}>
        <NavLink to="/dashboard/quality?tab=qa-reports" onNavigate={closeMobile}>QA Reports</NavLink>
        <NavLink href="https://docs.google.com/forms/d/e/1FAIpQLSfK1cahk57yU9Y7u9VJO23Nyz_LYuPMd-L3ZLp10kqCwOqt5w/viewform?usp=dialog" external>IRF</NavLink>
      </NavCategory>
      <NavCategory title="Financial" icon={<IconDollar />} to="/dashboard/financial" collapsed={effectiveCollapsed}>
        <NavLink to="/dashboard/financial" onNavigate={closeMobile}>Invoices</NavLink>
        <NavLink to="/dashboard/financial" onNavigate={closeMobile}>Payment History</NavLink>
        <NavLink to="/dashboard/financial" onNavigate={closeMobile}>Claims</NavLink>
      </NavCategory>
      <NavCategory title="Support & Resources" icon={<IconSupport />} to="/dashboard/support" collapsed={effectiveCollapsed}>
        <NavLink to="/dashboard/support" onNavigate={closeMobile}>Buyer Support</NavLink>
        <NavLink to="/dashboard/support" onNavigate={closeMobile}>Shipping Information</NavLink>
        <NavLink to="/dashboard/support" onNavigate={closeMobile}>Claims & Returns</NavLink>
        <NavLink to="/dashboard/support" onNavigate={closeMobile}>FAQs</NavLink>
      </NavCategory>
      */}
    </>
  ) : role === 'Merchant' ? (
    (() => {
      // allowedModules: null = full access; object = { [moduleKey]: null | string[] }
      const showModule = (key) => !allowedModules || key in allowedModules
      const showTab = (moduleKey, tabKey) => {
        if (!allowedModules) return true
        const tabs = allowedModules[moduleKey]
        return tabs === null || (Array.isArray(tabs) && tabs.includes(tabKey))
      }
      // A module can be "included" in allowedModules (its top checkbox
      // ticked in the Members admin panel) with every individual tab under
      // it unchecked - `allowedModules[key]` an empty array, not null/absent.
      // showModule(key) alone reads that as visible (the key IS present),
      // so the whole category used to render with nothing selectable inside
      // it - a dead end. Gates the category on having at least one real,
      // reachable tab instead - `showModule` already covers "not included
      // at all"; this adds "included but nothing under it is allowed" as
      // the same kind of invisible.
      const showAnyTab = (moduleKey, tabKeys) => showModule(moduleKey) && tabKeys.some(t => showTab(moduleKey, t))
      // 'dashboard' used to have no access gate at all - every Merchant
      // member always saw "My Dashboard" unconditionally, regardless of
      // allowedModules. Now that it's a real, admin-toggleable module (see
      // config/modules.js), a plain showModule/showTab check would silently
      // hide it for every already-existing member whose restricted
      // allowedModules object predates this module and so has no
      // 'dashboard' key at all - showModule('dashboard') on ITS OWN reads a
      // missing key as "not allowed", which is backwards for a module that
      // was always-on until now. Falls back to visible when the key is
      // genuinely absent (a legacy row, or an unrestricted null); once an
      // admin actually uses the new checkbox for a member, 'dashboard'
      // exists in their stored object and the normal showTab check takes
      // over from there.
      const showDashboard = !allowedModules || !('dashboard' in allowedModules) || showTab('dashboard', 'kpi-mis')
      return (
        <>
          {/* MIS (the read-only SKU summary) has no nav link and no route in
              production (see App.jsx, "mis" route commented out) — local-use
              only, re-enabled by hand when needed. */}
          {showDashboard && (
            <NavCategory title="My Dashboard" icon={<IconChart />} to="/dashboard" collapsed={effectiveCollapsed}>
              <NavLink to="/dashboard" onNavigate={closeMobile}>KPI &amp; MIS</NavLink>
            </NavCategory>
          )}
          {showAnyTab('npd', ['kaptr', 'pd-tracker', 'style-library']) && (
            <NavCategory title="New Product Development" icon={<IconNPD />} href="#" defaultOpen={true} collapsed={effectiveCollapsed}>
              {showTab('npd', 'kaptr') && <NavLink to="/plm?kaptr=1" onNavigate={closeMobile}>Kaptr</NavLink>}
              {showTab('npd', 'pd-tracker') && <NavLink to="/plm" onNavigate={closeMobile}>PD Tracker</NavLink>}
              {showTab('npd', 'style-library') && canSeeStyleLibrary && <NavLink to="/dashboard/npd?tab=style-library" onNavigate={closeMobile}>Item Master</NavLink>}
            </NavCategory>
          )}
          {showAnyTab('orders', ['po-table', 'otif-exceptions', 'po-file-records', 'pct']) && (
            <NavCategory title="Order Management" icon={<IconOrder />} to="/dashboard/orders" collapsed={effectiveCollapsed}>
              {showTab('orders', 'po-table') && <NavLink to="/dashboard/orders?tab=po-table" onNavigate={closeMobile}>Daily PO and PI records</NavLink>}
              {showTab('orders', 'otif-exceptions') && <NavLink to="/dashboard/orders?tab=otif-exceptions" onNavigate={closeMobile}>Exception Requests</NavLink>}
              {showTab('orders', 'po-file-records') && <NavLink to="/dashboard/orders?tab=po-file-records" onNavigate={closeMobile}>PO File Records</NavLink>}
              {showTab('orders', 'pct') && <NavLink to="/pct-beta" onNavigate={closeMobile}>Production Tracker <span className="ml-1 text-[9px] text-blue-600">BETA</span></NavLink>}
              {/* {showTab('orders', 'recent-po') && <NavLink to="/dashboard/orders?tab=recent-po" onNavigate={closeMobile}>PO Tracker</NavLink>} */}
            </NavCategory>
          )}
          {/* QC Reports (kept first, then IRF, Inspection Schedule, PO
              Inspection, FTPR Summary, Factory Audits, QA Manual, per
              request) - QC Reports and QA Manual are deliberately reachable
              by every Merchant user
              regardless of their allowedModules permissions - every other
              tab here keeps the exact same showModule+showTab gating it had
              before, just written explicitly per-tab now that the category
              itself is no longer gated as a whole. QC Reports' own data is
              still scoped to each viewer's own buyers via
              useMerchantPoBuyersAccess() inside QcReportsSummary.jsx - this
              only changes who can reach the page, not what they see once
              there. */}
          <NavCategory title="Quality & Compliance" icon={<IconCheck />} to="/dashboard/quality" collapsed={effectiveCollapsed}>
            <NavLink to="/dashboard/quality?tab=qc-reports" onNavigate={closeMobile}>QC Reports</NavLink>
            {showModule('quality') && showTab('quality', 'irf') && <NavLink to="/dashboard/quality?tab=irf" onNavigate={closeMobile}>IRF</NavLink>}
            {showModule('quality') && showTab('quality', 'inspection-schedule') && <NavLink to="/dashboard/quality?tab=inspection-schedule" onNavigate={closeMobile}>Inspection Schedule</NavLink>}
            {showModule('quality') && showTab('quality', 'po-inspection') && <NavLink to="/dashboard/quality?tab=po-inspection" onNavigate={closeMobile}>PO Inspection</NavLink>}
            {showModule('quality') && showTab('quality', 'ftpr-summary') && <NavLink to="/dashboard/quality?tab=ftpr-summary" onNavigate={closeMobile}>FTPR Summary</NavLink>}
            {showModule('quality') && showTab('quality', 'factory-audit') && <NavLink to="/dashboard/quality?tab=factory-audit" onNavigate={closeMobile}>Factory Audits</NavLink>}
            <NavLink to="/dashboard/quality?tab=qa-manual" onNavigate={closeMobile}>QA Manual</NavLink>
          </NavCategory>
          {showAnyTab('financial', ['invoice-list', 'claims', 'weekly-po']) && (
            <NavCategory title="Financial" icon={<IconDollar />} to="/dashboard/financial" collapsed={effectiveCollapsed}>
              {showTab('financial', 'invoice-list') && <NavLink to="/dashboard/financial?tab=invoice-list" onNavigate={closeMobile}>Invoices</NavLink>}
              {showTab('financial', 'claims') && <NavLink to="/dashboard/financial?tab=claims" onNavigate={closeMobile}>Claims</NavLink>}
              {showTab('financial', 'weekly-po') && (
                <>
                  <NavLink to="/dashboard/financial?tab=weekly-po" onNavigate={closeMobile}>P&L Data</NavLink>
                  {hasJnmPlAccess && (
                    <div className="ml-4 pl-3 border-l border-gray-200 mt-0.5 mb-1">
                      <NavSubLink to="/dashboard/financial?tab=pl-weekly" onNavigate={closeMobile}>Weekly</NavSubLink>
                      <NavSubLink to="/dashboard/financial?tab=pl-monthly" onNavigate={closeMobile}>Monthly</NavSubLink>
                      <NavSubLink to="/dashboard/financial?tab=expenses-ebidta" onNavigate={closeMobile}>Expences &amp; EBIDTA</NavSubLink>
                      <NavSubLink to="/dashboard/financial?tab=expenses-ebidta-summary" onNavigate={closeMobile}>Summary</NavSubLink>
                    </div>
                  )}
                </>
              )}
            </NavCategory>
          )}
          {showAnyTab('logistics', ['shipment-containers', 'shipment-invoices', 'courier-logs-domestic', 'courier-logs-international', 'shipping-docs', 'inspection-pending-dispatch', 'reports']) && (
            <NavCategory title="Logistics" icon={<IconShip />} to="/dashboard/logistics" collapsed={effectiveCollapsed}>
              {showTab('logistics', 'shipment-containers') && <NavLink to="/dashboard/logistics?tab=shipment-containers" onNavigate={closeMobile}>Shipment &amp; Planning</NavLink>}
              {showTab('logistics', 'shipment-invoices') && <NavLink to="/dashboard/logistics?tab=shipment-invoices" onNavigate={closeMobile}>Shipment Invoices</NavLink>}
              {showTab('logistics', 'courier-logs-domestic') && <NavLink to="/dashboard/logistics?tab=courier-logs-domestic" onNavigate={closeMobile}>Domestic Outward <span className="ml-1 text-[9px] text-blue-600">BETA</span></NavLink>}
              {showTab('logistics', 'courier-logs-international') && <NavLink to="/dashboard/logistics?tab=courier-logs-international" onNavigate={closeMobile}>International Export <span className="ml-1 text-[9px] text-blue-600">BETA</span></NavLink>}
              {showTab('logistics', 'shipping-docs') && <NavLink to="/dashboard/logistics?tab=shipping-docs" onNavigate={closeMobile}>Shipping Docs Listings</NavLink>}
              {showTab('logistics', 'inspection-pending-dispatch') && <NavLink to="/dashboard/logistics?tab=inspection-pending-dispatch" onNavigate={closeMobile}>Inspection Pending Dispatch</NavLink>}
              {showTab('logistics', 'reports') && <NavLink to="/dashboard/logistics?tab=reports" onNavigate={closeMobile}>Reports</NavLink>}
            </NavCategory>
          )}
        </>
      )
    })()
  ) : (
    <>
      <NavCategory title="New Product Development" icon={<IconNPD />} href="#" collapsed={effectiveCollapsed}>
        {/* Kaptr hidden for suppliers for now — supplier SKU capture isn't in use yet. */}
        <NavLink to="/plm" onNavigate={closeMobile}>PD Tracker</NavLink>
      </NavCategory>
      <NavCategory title="Signed Agreement" icon={<IconCheck />} to="/dashboard/signed-agreement" collapsed={effectiveCollapsed} />
      {/* In-app Inspection Request Form (IrfSection.jsx -> InspectionRequestForm.jsx's
          own isSupplier branch) - no external Google Form, no sub-tabs, same
          plain direct-link category "Signed Agreement" right above uses. */}
      <NavCategory title="IRF" icon={<IconCheck />} to="/dashboard/irf" collapsed={effectiveCollapsed} />
      {/* Read-only view of this supplier's own inspection results (see
          QcReportsSection.jsx/SupplierQcReports.jsx) - IRF above only lets
          them REQUEST an inspection, never shows the result. */}
      <NavCategory title="QC Reports" icon={<IconCheck />} to="/dashboard/qc-reports" collapsed={effectiveCollapsed} />
      {/* Coming soon — uncomment as sections are built out for suppliers
      <NavCategory title="My Dashboard" icon={<IconChart />} to="/dashboard" collapsed={effectiveCollapsed}>
        <NavLink to="/dashboard" onNavigate={closeMobile}>Overview</NavLink>
      </NavCategory>
      <NavCategory title="Order Management" icon={<IconOrder />} to="/dashboard/orders" collapsed={effectiveCollapsed}>
        <NavLink to="/dashboard/orders" onNavigate={closeMobile}>Orders</NavLink>
      </NavCategory>
      <NavCategory title="Quality & Compliance" icon={<IconCheck />} to="/dashboard/quality" collapsed={effectiveCollapsed}>
        <NavLink to="/dashboard/quality" onNavigate={closeMobile}>QA Reports</NavLink>
        <NavLink href="https://docs.google.com/forms/d/e/1FAIpQLSfK1cahk57yU9Y7u9VJO23Nyz_LYuPMd-L3ZLp10kqCwOqt5w/viewform?usp=dialog" external>IRF</NavLink>
      </NavCategory>
      <NavCategory title="Financial" icon={<IconDollar />} to="/dashboard/financial" collapsed={effectiveCollapsed}>
        <NavLink to="/dashboard/financial" onNavigate={closeMobile}>Invoices</NavLink>
      </NavCategory>
      <NavCategory title="Support" icon={<IconSupport />} to="/dashboard/support" collapsed={effectiveCollapsed}>
        <NavLink to="/dashboard/support" onNavigate={closeMobile}>Support</NavLink>
      </NavCategory>
      */}
    </>
  )

  return (
    <>
      {/* Mobile toggle — only show when sidebar is closed */}
      {!mobileOpen && (
        <button
          type="button"
          className="fixed top-2 left-2 z-[101] flex h-9 w-9 lg:hidden items-center justify-center rounded-xl border border-gray-200 bg-white shadow-lg"
          onClick={() => onMobileOpen?.()}
          aria-label="Open Menu"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      )}

      {/* Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-99 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => onMobileClose?.()}
          aria-hidden
        />
      )}

      <aside
        className={`bg-white border-r border-gray-200 h-screen flex flex-col transition-all duration-200 z-100 ${
          effectiveCollapsed ? 'w-14' : 'w-[220px]'
        } ${mobileOpen ? 'fixed inset-y-0 left-0' : 'relative'} lg:sticky lg:top-0 lg:block ${!mobileOpen ? 'hidden lg:flex' : 'flex'}`}
      >
        <div className="flex items-center justify-between px-3 py-3 bg-black text-white border-b border-white/10">
          <div className="flex items-center gap-2">
            <LogoMark size={28} dark={false} />
            {!effectiveCollapsed && <span className="font-semibold text-sm leading-tight">{title}</span>}
          </div>
          <button
            type="button"
            className="lg:hidden text-white text-xl leading-none"
            onClick={() => onMobileClose?.()}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        {/* min-h-0 is required alongside flex-1 for a flex child to actually
            scroll internally instead of overflowing past the sidebar's own
            h-screen box — same pattern Dashboard.jsx's own scroll root uses.
            Without it, an expanded category on a short viewport (~786px)
            pushes later categories and the collapse button off-screen with
            no way to reach them. */}
        <nav className="flex-1 min-h-0 overflow-y-auto py-2 px-1.5">{content}</nav>
        <button
          type="button"
          className="hidden lg:flex items-center justify-center py-1.5 text-[11px] text-gray-400 border-t border-gray-100 hover:text-gray-600 transition-colors"
          onClick={() => onCollapseChange?.(!collapsed)}
        >
          {collapsed ? '→' : '← Collapse'}
        </button>
      </aside>
    </>
  )
}
