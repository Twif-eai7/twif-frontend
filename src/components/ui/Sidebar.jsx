import { Link, useMatch, useResolvedPath, useLocation } from 'react-router-dom'
import { useState } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { useProfileStore } from '../../stores/profileStore'
import { canAccessJnmPlFeatures } from '../../utils/jnmAccess'

const LOGO_URL = 'https://cdn.shopify.com/s/files/1/0494/0922/8958/files/logo.png?v=1614315516'

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

  const chevron = !collapsed && (
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

      {!collapsed && isOpen && (
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
  const isActive = location.pathname === toPath &&
    (!toQuery || new URLSearchParams(location.search).toString() === new URLSearchParams(toQuery).toString())

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

  // Determine active: path matches AND (no query expected OR query matches)
  const [toPath, toQuery] = (to || '').split('?')
  const isActive = location.pathname === toPath &&
    (!toQuery || new URLSearchParams(location.search).toString() === new URLSearchParams(toQuery).toString())

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

  const userEmail = useAuthStore((s) => s.session?.user?.email)
  const orgMembership = useProfileStore((s) => s.orgMembership)
  const hasJnmPlAccess = canAccessJnmPlFeatures(userEmail, orgMembership)

  // Close mobile drawer on navigation
  const closeMobile = mobileOpen ? onMobileClose : undefined

  const content = role === 'Buyer' ? (
    <>
      <NavCategory title="New Product Development" icon={<IconNPD />} href="#" collapsed={collapsed}>
        <NavLink to="/plm" onNavigate={closeMobile}>PD Tracker</NavLink>
      </NavCategory>
      {/* Coming soon — uncomment as sections are built out for buyers
      <NavCategory title="Product Catalogs" icon={<IconGrid />} to="/dashboard/catalogs" collapsed={collapsed}>
        <NavLink href="/collections/home-decor" onNavigate={closeMobile}>Home Decor</NavLink>
        <NavLink href="/collections/furniture" onNavigate={closeMobile}>Furniture</NavLink>
        <NavLink href="/collections/bed-linens" onNavigate={closeMobile}>Textile</NavLink>
        <NavLink href="/collections/" onNavigate={closeMobile}>All Catalogues</NavLink>
      </NavCategory>
      <NavCategory title="Order Management" icon={<IconOrder />} to="/dashboard/orders" collapsed={collapsed}>
        <NavLink to="/dashboard/orders?tab=open-pos" onNavigate={closeMobile}>Open POs</NavLink>
        <NavLink to="/dashboard/orders?tab=shipped-pos" onNavigate={closeMobile}>Shipped POs</NavLink>
        <NavLink to="/dashboard/orders?tab=po-file-records" onNavigate={closeMobile}>PO File Records</NavLink>
      </NavCategory>
      <NavCategory title="Quality & Compliance" icon={<IconCheck />} to="/dashboard/quality" collapsed={collapsed}>
        <NavLink to="/dashboard/quality?tab=qa-reports" onNavigate={closeMobile}>QA Reports</NavLink>
        <NavLink href="https://docs.google.com/forms/d/e/1FAIpQLSfK1cahk57yU9Y7u9VJO23Nyz_LYuPMd-L3ZLp10kqCwOqt5w/viewform?usp=dialog" external>IRF</NavLink>
      </NavCategory>
      <NavCategory title="Financial" icon={<IconDollar />} to="/dashboard/financial" collapsed={collapsed}>
        <NavLink to="/dashboard/financial" onNavigate={closeMobile}>Invoices</NavLink>
        <NavLink to="/dashboard/financial" onNavigate={closeMobile}>Payment History</NavLink>
        <NavLink to="/dashboard/financial" onNavigate={closeMobile}>Claims</NavLink>
      </NavCategory>
      <NavCategory title="Support & Resources" icon={<IconSupport />} to="/dashboard/support" collapsed={collapsed}>
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
      return (
        <>
          <NavCategory title="My Dashboard" icon={<IconChart />} to="/dashboard" collapsed={collapsed}>
            <NavLink to="/dashboard" onNavigate={closeMobile}>Metrics &amp; KPI</NavLink>
          </NavCategory>
          {showModule('npd') && (
            <NavCategory title="New Product Development" icon={<IconNPD />} href="#" defaultOpen={true} collapsed={collapsed}>
              <NavLink to="/plm" onNavigate={closeMobile}>PD Tracker</NavLink>
            </NavCategory>
          )}
          {showModule('orders') && (
            <NavCategory title="Order Management" icon={<IconOrder />} to="/dashboard/orders" collapsed={collapsed}>
              {showTab('orders', 'po-table') && <NavLink to="/dashboard/orders?tab=po-table" onNavigate={closeMobile}>Daily PO and PI records</NavLink>}
              {showTab('orders', 'otif-exception') && <NavLink to="/dashboard/orders?tab=otif-exceptions" onNavigate={closeMobile}>On-Time Exception</NavLink>}
              {showTab('orders', 'po-file-records') && <NavLink to="/dashboard/orders?tab=po-file-records" onNavigate={closeMobile}>PO File Records</NavLink>}
              {showTab('orders', 'pct') && <NavLink to="/pct-beta" onNavigate={closeMobile}>Production Tracker <span className="ml-1 text-[9px] text-blue-600">BETA</span></NavLink>}
              {/* {showTab('orders', 'recent-po') && <NavLink to="/dashboard/orders?tab=recent-po" onNavigate={closeMobile}>PO Tracker</NavLink>} */}
              {showTab('orders', 'inspection-pending-dispatch') && <NavLink to="/dashboard/orders?tab=inspection-pending-dispatch" onNavigate={closeMobile}>Inspection Pending Dispatch</NavLink>}
            </NavCategory>
          )}
          {showModule('fms') && (
            <NavCategory title="Flow Management System" icon={<IconFlow />} to="/dashboard/fms" collapsed={collapsed}>
              {showTab('fms', 'fms-dashboard-1') && <NavLink href="https://script.google.com/a/macros/jnitin.com/s/AKfycbx_KTOxCKsUDurCnlnF7BrLi_HdHyoVunDseN05k5-66AT578HvAlC6_NnSxElMk6KubA/exec" external>FMS 1 Dashboard</NavLink>}
              {showTab('fms', 'fms-dashboard-2') && <NavLink href="https://script.google.com/a/macros/jnitin.com/s/AKfycbz4f4S5tWeMVxkJLvik1_7WiabT9Emdn3mYOtd8oDZzsO1OmRBhc3Cq8d1GLg7pw6E/exec" external>FMS 2 Dashboard</NavLink>}
              {showTab('fms', 'fms-form') && <NavLink href="https://docs.google.com/forms/d/e/1FAIpQLSfyVHf8Y4b2kfstZmeMdddGTxqiMYvQ4uzqZ491YCckFZqnPg/viewform" external>FMS1 Form</NavLink>}
              {showTab('fms', 'fms1') && <NavLink to="/dashboard/fms?tab=fms1" onNavigate={closeMobile}>FMS1 tracker</NavLink>}
              {showTab('fms', 'fms2') && <NavLink to="/dashboard/fms?tab=fms2" onNavigate={closeMobile}>FMS2 tracker</NavLink>}
              {showTab('fms', 'fms3') && <NavLink to="/dashboard/fms?tab=fms3" onNavigate={closeMobile}>FMS3 tracker</NavLink>}
              {showTab('fms', 'fms4') && <NavLink to="/dashboard/fms?tab=fms4" onNavigate={closeMobile}>FMS4 tracker</NavLink>}
            </NavCategory>
          )}
          {showModule('quality') && (
            <NavCategory title="Quality & Compliance" icon={<IconCheck />} to="/dashboard/quality" collapsed={collapsed}>
              {showTab('quality', 'audit-summary') && <NavLink to="/dashboard/quality?tab=audit-summary" onNavigate={closeMobile}>QA Reports</NavLink>}
              <NavLink to="/qa-manual">QA Manual</NavLink>
              {showTab('quality', 'ftpr-summary') && <NavLink to="/dashboard/quality?tab=ftpr-summary" onNavigate={closeMobile}>FTPR Summary</NavLink>}
              {showTab('quality', 'po-inspection') && <NavLink to="/dashboard/quality?tab=po-inspection" onNavigate={closeMobile}>PO Inspection</NavLink>}
              {showTab('quality', 'factory-audit') && <NavLink to="/dashboard/quality?tab=factory-audit" onNavigate={closeMobile}>Factory Audits</NavLink>}
              {showTab('quality', 'irf') && <NavLink href="https://docs.google.com/forms/d/e/1FAIpQLSfK1cahk57yU9Y7u9VJO23Nyz_LYuPMd-L3ZLp10kqCwOqt5w/viewform?usp=dialog" external>IRF</NavLink>}
            </NavCategory>
          )}
          {showModule('financial') && (
            <NavCategory title="Financial" icon={<IconDollar />} to="/dashboard/financial" collapsed={collapsed}>
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
          {showModule('logistics') && (
            <NavCategory title="Logistics" icon={<IconShip />} to="/dashboard/logistics" collapsed={collapsed}>
              {showTab('logistics', 'reports') && <NavLink to="/dashboard/logistics?tab=reports" onNavigate={closeMobile}>Reports</NavLink>}
              {showTab('logistics', 'courier-logs-domestic') && <NavLink to="/dashboard/logistics?tab=courier-logs-domestic" onNavigate={closeMobile}>Domestic Outward <span className="ml-1 text-[9px] text-blue-600">BETA</span></NavLink>}
              {showTab('logistics', 'courier-logs-international') && <NavLink to="/dashboard/logistics?tab=courier-logs-international" onNavigate={closeMobile}>International Export <span className="ml-1 text-[9px] text-blue-600">BETA</span></NavLink>}
              {showTab('logistics', 'shipment-containers') && <NavLink to="/dashboard/logistics?tab=shipment-containers" onNavigate={closeMobile}>Logistics MIS</NavLink>}
            </NavCategory>
          )}
          <NavCategory title="HR One Portal" icon={<IconGrid />} href="#" collapsed={collapsed}>
            <NavLink href="https://app.hrone.cloud/app" external>Access Hr One</NavLink>
          </NavCategory>
          {showModule('tools') && (
            <NavCategory title="Travel" icon={<IconOrder />} to="/dashboard/tools" collapsed={collapsed}>
              {showTab('tools', 'travel-form') && <NavLink href="https://docs.google.com/forms/d/e/1FAIpQLSdTKuHSCJvHrVQzz8ezjFKV7zLzOudcIYdbp_35uV_VhEESVg/viewform?urp=gmail_link" external>Place a request</NavLink>}
              {showTab('tools', 'travel-bill') && <NavLink to="/dashboard/tools?tab=travel-bill" onNavigate={closeMobile}>Upload Travel Bill</NavLink>}
            </NavCategory>
          )}
          {showModule('issues') && (
            <NavCategory title="Issue Tracker" icon={<IconCheck />} to="/dashboard/issues" collapsed={collapsed}>
              {showTab('issues', 'issue-tracker') && <NavLink to="/dashboard/issues?tab=issue-tracker" onNavigate={closeMobile}>Issue Tracker</NavLink>}
              {showTab('issues', 'jit-dashboard') && <NavLink href="https://app.powerbi.com/links/Fc41FXMkSw?ctid=5f2b49b9-47dc-4f69-a85d-6053b60cf04c&pbi_source=linkShare" external>JIT dashboard</NavLink>}
              {showTab('issues', 'merchant-performance') && <NavLink href="https://app.powerbi.com/links/HWRkvWtfhF?ctid=5f2b49b9-47dc-4f69-a85d-6053b60cf04c&pbi_source=linkShare" external>Merchant Performance</NavLink>}
            </NavCategory>
          )}
          <NavCategory title="Tech Enhancement Request" icon={<IconOrder />} href="#" collapsed={collapsed}>
            <NavLink href="https://docs.google.com/forms/d/1YTCIZjYhHzGNmIxj4xjTmTp1Km-Vc73ySI4JhaS-XLY/viewform?edit_requested=true" external>Tech Requirements (TER)</NavLink>
          </NavCategory>
        </>
      )
    })()
  ) : (
    <>
      <NavCategory title="New Product Development" icon={<IconNPD />} href="#" collapsed={collapsed}>
        <NavLink to="/plm" onNavigate={closeMobile}>PD Tracker</NavLink>
      </NavCategory>
      {/* Coming soon — uncomment as sections are built out for suppliers
      <NavCategory title="My Dashboard" icon={<IconChart />} to="/dashboard" collapsed={collapsed}>
        <NavLink to="/dashboard" onNavigate={closeMobile}>Overview</NavLink>
      </NavCategory>
      <NavCategory title="Order Management" icon={<IconOrder />} to="/dashboard/orders" collapsed={collapsed}>
        <NavLink to="/dashboard/orders" onNavigate={closeMobile}>Orders</NavLink>
      </NavCategory>
      <NavCategory title="Quality & Compliance" icon={<IconCheck />} to="/dashboard/quality" collapsed={collapsed}>
        <NavLink to="/dashboard/quality" onNavigate={closeMobile}>QA Reports</NavLink>
        <NavLink href="https://docs.google.com/forms/d/e/1FAIpQLSfK1cahk57yU9Y7u9VJO23Nyz_LYuPMd-L3ZLp10kqCwOqt5w/viewform?usp=dialog" external>IRF</NavLink>
      </NavCategory>
      <NavCategory title="Financial" icon={<IconDollar />} to="/dashboard/financial" collapsed={collapsed}>
        <NavLink to="/dashboard/financial" onNavigate={closeMobile}>Invoices</NavLink>
      </NavCategory>
      <NavCategory title="Support" icon={<IconSupport />} to="/dashboard/support" collapsed={collapsed}>
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
          className="fixed top-2 left-2 z-[101] flex h-10 w-10 lg:hidden items-center justify-center rounded-xl border border-gray-200 bg-white shadow-lg"
          onClick={() => onMobileOpen?.()}
          aria-label="Open Menu"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
          collapsed ? 'w-14' : 'w-[220px]'
        } ${mobileOpen ? 'fixed inset-y-0 left-0' : 'relative'} lg:sticky lg:top-0 lg:block ${!mobileOpen ? 'hidden lg:flex' : 'flex'}`}
      >
        <div className="flex items-center justify-between px-3 py-3 bg-black text-white border-b border-white/10">
          <div className="flex items-center gap-2">
            <img src={LOGO_URL} alt="Logo" className="w-7 h-7 rounded-md bg-white p-0.5 object-contain flex-shrink-0" />
            {!collapsed && <span className="font-semibold text-sm leading-tight">{title}</span>}
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
        <nav className="flex-1 py-2 px-1.5">{content}</nav>
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
