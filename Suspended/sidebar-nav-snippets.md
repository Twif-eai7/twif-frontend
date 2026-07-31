# Suspended tabs — restoration reference

This folder holds the code for 6 sidebar tabs that were suspended (not deleted) from the
Twif Merchant Portal. Everything here mirrors its original path under `src/` — to restore a tab,
move its files back to the matching path under `src/` and paste the snippets below back into
`src/App.jsx` / `src/components/ui/Sidebar.jsx`.

## Moved files
- Flow Management System: `pages/Dashboard/sections/FmsSection.jsx`, `components/flowManagement/FmsTracker.jsx`
- Quality & Compliance: `pages/Dashboard/sections/QualitySection.jsx`, `pages/Dashboard/sections/QualityManual.jsx`, `components/qualityCompliance/*.jsx`
- Travel: `pages/Dashboard/sections/ToolsSection.jsx`, `hooks/useTravelExpense.js`
- Issue Tracker: `pages/Dashboard/sections/IssuesSection.jsx`, `components/issues/*`
- HR One Portal / Tech Enhancement Request: no files (link-only tabs) — see JSX snippets below.

## `src/App.jsx` — imports to restore (were near the top import block)
```jsx
import FmsSection       from './pages/Dashboard/sections/FmsSection'
import QualitySection   from './pages/Dashboard/sections/QualitySection'
import ToolsSection     from './pages/Dashboard/sections/ToolsSection'
import IssuesSection    from './pages/Dashboard/sections/IssuesSection'
import QualityManual from './pages/Dashboard/sections/QualityManual'
```

## `src/App.jsx` — routes to restore (inside the `/dashboard` nested `<Route>` block)
```jsx
<Route path="fms"       element={<FmsSection />} />
<Route path="quality"   element={<QualitySection />} />
<Route path="tools"     element={<ToolsSection />} />
<Route path="issues"    element={<IssuesSection />} />
```

## `src/App.jsx` — top-level route to restore (sibling of `/dashboard`, near `/plm/accept`)
```jsx
<Route path="/qa-manual" element={<RequireAuth><QualityManual /></RequireAuth>} />
```

## `src/components/ui/Sidebar.jsx` — NavCategory blocks to restore (inside the Merchant role branch)

Flow Management System (was directly after the "Order Management" `NavCategory`):
```jsx
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
```

Quality & Compliance (was directly after Flow Management System, before "Financial"):
```jsx
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
```

HR One Portal, Travel, Issue Tracker, Tech Enhancement Request (were, in this order, directly
after the "Logistics" `NavCategory`, before the closing `</>` of the Merchant nav tree):
```jsx
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
```

## Not touched (left as-is, follow-up if you want full cleanup)
- `src/config/modules.js` still lists `fms`, `quality`, `tools`, `issues` as toggleable module
  keys in the Admin → Members permission editor. They're now inert (nothing in the UI reads
  them) but still visible there.
- `IconFlow` definition in `Sidebar.jsx` (only used by the FMS block) was left in place, unused.
