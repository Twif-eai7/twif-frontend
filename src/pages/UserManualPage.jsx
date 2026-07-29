import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";

// ─── Hook ────────────────────────────────────────────────────────────────────

function useManual(sectionIds, scrollRef) {
  const [activeId, setActiveId] = useState(sectionIds[0]);
  const [scrolled, setScrolled] = useState(false);
  const observerRef = useRef(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => setScrolled(el.scrollTop > 12);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [scrollRef]);

  useEffect(() => {
    observerRef.current?.disconnect();
    const root = scrollRef.current;
    if (!root) return;
    const handler = (entries) => {
      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible.length) setActiveId(visible[0].target.id);
    };
    observerRef.current = new IntersectionObserver(handler, {
      root,
      rootMargin: "-15% 0px -65% 0px",
      threshold: 0,
    });
    sectionIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observerRef.current.observe(el);
    });
    return () => observerRef.current?.disconnect();
  }, [sectionIds, scrollRef]);

  const scrollTo = useCallback(
    (id) => {
      const container = scrollRef.current;
      const el = document.getElementById(id);
      if (!el || !container) return;
      const offset = el.offsetTop - 80;
      container.scrollTo({ top: offset, behavior: "smooth" });
    },
    [scrollRef]
  );

  return { activeId, scrolled, scrollTo };
}

// ─── Primitives ──────────────────────────────────────────────────────────────

function Badge({ variant = "black", children }) {
  const styles = {
    black: "bg-neutral-900 text-white",
    gray: "bg-neutral-200 text-neutral-600",
    admin: "bg-neutral-700 text-white",
  };
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded-sm text-[10px] font-mono font-bold tracking-wider uppercase ${styles[variant]}`}>
      {children}
    </span>
  );
}

function Note({ children }) {
  return (
    <div className="bg-neutral-100 border-l-[3px] border-neutral-500 pl-4 pr-4 py-3 text-sm text-neutral-600 leading-relaxed rounded-r my-3">
      {children}
    </div>
  );
}

function AlertBox({ children }) {
  return (
    <div className="bg-neutral-900 text-white px-4 py-3 text-sm leading-relaxed rounded my-3">
      {children}
    </div>
  );
}

function Steps({ items }) {
  return (
    <ol className="list-none p-0 m-0 space-y-2.5 mb-4">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3 items-start text-sm text-neutral-700 leading-relaxed">
          <span className="shrink-0 mt-0.5 w-5 h-5 rounded-full bg-neutral-200 text-neutral-600 flex items-center justify-center text-[11px] font-mono font-bold">
            {i + 1}
          </span>
          <span dangerouslySetInnerHTML={{ __html: item }} />
        </li>
      ))}
    </ol>
  );
}

function ManualTable({ headers, rows }) {
  return (
    <div className="overflow-x-auto my-3">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} className="bg-neutral-900 text-white text-left px-3.5 py-2.5 font-mono text-[11px] tracking-widest uppercase whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className={ri % 2 === 1 ? "bg-neutral-50" : ""}>
              {row.map((cell, ci) => (
                <td key={ci} className="px-3.5 py-2.5 border-b border-neutral-200 text-neutral-700 align-top leading-snug">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Subsection({ title, children }) {
  return (
    <div className="mt-5">
      <h3 className="text-[15px] font-bold text-neutral-900 mb-2.5">{title}</h3>
      {children}
    </div>
  );
}

function Section({ id, num, title, adminOnly, children }) {
  return (
    <div id={id} className="mb-12">
      <div className="flex items-center gap-3 mb-4 pb-3 border-b border-neutral-200">
        <span className="shrink-0 w-7 h-7 rounded-full bg-neutral-900 text-white flex items-center justify-center text-xs font-mono font-bold">
          {num}
        </span>
        <h2 className="text-lg font-bold text-neutral-900 tracking-tight flex items-center gap-2 m-0">
          {title}
          {adminOnly && <Badge variant="admin">Admin Only</Badge>}
        </h2>
      </div>
      <div className="text-sm text-neutral-700 leading-relaxed space-y-2">{children}</div>
    </div>
  );
}

// ─── Sidebar TOC ─────────────────────────────────────────────────────────────

const TOC_ITEMS = [
  { id: "s-login",     label: "Logging In & Access Levels" },
  { id: "s-dashboard", label: "My Dashboard" },
  { id: "s-npd",       label: "New Product Developments" },
  { id: "s-orders",    label: "Order Management (PO & PI)" },
  { id: "s-fms",       label: "Flow Management System" },
  { id: "s-qa",        label: "Quality & Compliance" },
  { id: "s-financial", label: "Financial" },
  { id: "s-logistics", label: "Logistics" },
  { id: "s-hr",        label: "HR One Portal" },
  { id: "s-travel",    label: "Travel Requests & Bills" },
  { id: "s-issues",    label: "Issue Tracker" },
  { id: "s-alerts",    label: "Alerts" },
];

const SECTION_IDS = TOC_ITEMS.map((t) => t.id);

// Sidebar — matches the screenshot style: vertical list, active item highlighted
function Sidebar({ activeId, scrollTo }) {
  return (
    <aside className="w-56 shrink-0 border-r border-neutral-200 bg-white h-full overflow-y-auto">
      <div className="px-5 pt-6 pb-4">
        <p className="text-[10px] font-mono text-neutral-400 uppercase tracking-[0.18em] mb-3 select-none">
          Contents
        </p>
        <nav>
          <ol className="list-none m-0 p-0 space-y-0.5">
            {TOC_ITEMS.map(({ id, label }, i) => {
              const isActive = activeId === id;
              return (
                <li key={id}>
                  <button
                    onClick={() => scrollTo(id)}
                    className={`w-full text-left px-3 py-2 rounded-md text-[13px] leading-snug transition-colors flex items-start gap-2 group
                      ${isActive
                        ? "bg-neutral-900 text-white font-semibold"
                        : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                      }`}
                  >
                    <span className={`shrink-0 font-mono text-[11px] mt-0.5 tabular-nums ${isActive ? "text-neutral-400" : "text-neutral-400 group-hover:text-neutral-500"}`}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span>{label}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
      </div>
    </aside>
  );
}

// ─── Sections ────────────────────────────────────────────────────────────────

function S1Login() {
  return (
    <Section id="s-login" num="1" title="Logging In & Access Levels">
      <p>Access the Merchant Portal through the JNG website. You must have an approved merchant account to log in. New accounts are placed under review until verified by an administrator.</p>
      <Subsection title="Account States">
        <ManualTable
          headers={["State", "What You See"]}
          rows={[
            ["Profile incomplete", "Redirected to profile setup page automatically."],
            ["Pending verification", '"Account Under Review" screen. No portal access until approved.'],
            ["Verified merchant", "Full portal access based on your role and admin status."],
          ]}
        />
      </Subsection>
      <Subsection title="Access Tiers">
        <ManualTable
          headers={["Feature", "All Merchants", "Admin Only"]}
          rows={[
            ["Dashboard, NPD, Order Management, FMS, QA, HR, Travel, Issues", "✓", "✓"],
            ["PLM (beta), FMS Trackers", "—", "✓"],
          ]}
        />
      </Subsection>
      <Note><strong className="text-neutral-900">Note:</strong> System views and access are customised based on user roles and intended usage. Visibility of data and features may vary accordingly.</Note>
    </Section>
  );
}

function S2Dashboard() {
  return (
    <Section id="s-dashboard" num="2" title="My Dashboard">
      <p>The dashboard is the first section you see after logging in. It shows high-level performance metrics relevant to your account — active buyers, total PO value, total PO count, and SKUs generating revenue.</p>
      <p>These figures are pulled live from the portal's backend. If values show "--", the data is still loading or not yet available for your account.</p>
      <p>The <strong>Metrics & KPI</strong> sub-section under My Dashboard provides a more detailed analytics view including order trends and buyer performance over time.</p>
    </Section>
  );
}

function S3NPD() {
  return (
    <Section id="s-npd" num="3" title="New Product Developments">
      <p>This section tracks product development across seasons. Each season has its own tracker showing sample status, approvals, and development progress for SKUs being developed for your buyers.</p>
      <Subsection title="Available Trackers">
        <ManualTable
          headers={["Item", "Description"]}
          rows={[
            ["AW 26", "Autumn/Winter 2026 product development tracker."],
            ["SS 27", "Spring/Summer 2027 product development tracker."],
            [<span className="flex items-center gap-1.5">PLM <Badge variant="gray">Beta</Badge> <Badge variant="admin">Admin</Badge></span>,
             "Product Lifecycle Management tool. Currently in beta. Admin access only."],
          ]}
        />
      </Subsection>
      <Note><strong className="text-neutral-900">Note:</strong> Trackers are embedded Google Sheets. Use the buyer switcher (if available) to filter data by a specific buyer account.</Note>
    </Section>
  );
}

function S4Orders() {
  return (
    <Section id="s-orders" num="4" title="Order Management (PO & PI)">
      <p>This is the core of the merchant portal. Purchase Orders (POs) and Proforma Invoices (PIs) are managed here. The system tracks every order from receipt through PI confirmation and beyond.</p>
      <Subsection title="Sub-sections">
        <ManualTable
          headers={["Section", "Purpose"]}
          rows={[
            ["Daily PO & PI Records", "Live view of all current POs and their PI status. Upload new POs and PIs from here."],
            ["FY25 PO Records", "Historical read-only records for financial year 2025."],
            ["FY26 PO Records", "Historical read-only records for financial year 2026."],
            ["PO Tracker", "An embedded Google Sheet showing open POs. Buyer switcher available if you manage multiple buyers."],
          ]}
        />
      </Subsection>
      <Subsection title="Uploading a New PO">
        <Steps items={[
          "Go to <strong>Order Management → Daily PO & PI Records</strong>.",
          "Click the <strong>Upload PO</strong> button.",
          "Fill in buyer, supplier, PO number, date received, quantity, and value.",
          "Attach the PO document (PDF or Excel accepted).",
          "Submit. The system creates the record and sends an alert to the admin team.",
        ]} />
        <Note><strong className="text-neutral-900">Excel files:</strong> If you upload an Excel (.xlsx, .xls, .csv) file, the system automatically converts it to PDF and stores both versions. No action needed from your side.</Note>
      </Subsection>
      <Subsection title="Uploading a PI (Proforma Invoice)">
        <Steps items={[
          "Locate the PO in <strong>Daily PO & PI Records</strong>.",
          "Click <strong>Upload PI</strong> on the relevant PO row.",
          "Enter PI received date and ex-factory date.",
          "Attach the PI document.",
          "Submit. The PO is marked as PI confirmed, and an alert is sent to the admin team.",
        ]} />
      </Subsection>
      <Subsection title="Editing a PO (Before PI Confirmation)">
        <Steps items={[
          "Find the PO in <strong>Daily PO & PI Records</strong>.",
          "Click <strong>Edit</strong> on the PO row.",
          "Update any field — quantity, amount, date, buyer/supplier, or replace the PO file.",
          "Save. The system updates the record, logs a version snapshot, and marks related alerts as <strong>PO Updated</strong>.",
        ]} />
        <Note><strong className="text-neutral-900">File movement:</strong> If you change the PO date or PO number, the system automatically moves the stored file to a new folder path matching the updated details. You do not need to re-upload the file.</Note>
      </Subsection>
      <Subsection title="Revising a Confirmed PO (After PI Confirmation)">
        <p>Once a PO has been PI confirmed, it cannot be edited through the regular edit flow. Use the <strong>Revise</strong> action instead.</p>
        <Steps items={[
          "Find the PI-confirmed PO in <strong>Daily PO & PI Records</strong>.",
          "Click <strong>Revise</strong>.",
          "Update fields as needed — you may also replace the PO or PI file.",
          "Submit. A version snapshot is saved, existing alerts are promoted to <strong>PO Revised</strong>, and the admin team receives an email notification listing exactly what changed.",
        ]} />
        <AlertBox><strong className="font-mono tracking-wide">REVISION EMAIL:</strong> Admins receive an email summarising every field that changed (e.g., "Quantity: 500 → 600, PI Date: March-10-2026 → March-15-2026"). This email is sent automatically — no manual notification required.</AlertBox>
      </Subsection>
      <Subsection title="PO Lifecycle Summary">
        <ManualTable
          headers={["Stage", "Alert Type", "Email Sent?"]}
          rows={[
            ["PO uploaded",              <Badge>PO Upload</Badge>,  "Yes"],
            ["PO edited (pre-PI)",        <Badge>PO Updated</Badge>, "No"],
            ["PI uploaded & confirmed",   <Badge>PI Upload</Badge>,  "Yes"],
            ["PO revised (post-PI)",      <Badge>PO Revised</Badge>, "Yes"],
            ["PI delay reason submitted", <Badge>PI Delay</Badge>,   "Yes"],
            ["PO deleted",               <Badge>PO Deleted</Badge>, "Yes"],
          ]}
        />
      </Subsection>
      <Subsection title="PI Confirmation Deadline">
        <p>The portal tracks the number of days since each PO was received. If a PI is not confirmed within 5 days, the admin team is automatically notified with a PI Overdue alert. You will also see a reminder notification appear in the Alerts panel.</p>
        <p>If your PI is delayed, use the <strong>State Delay Reason</strong> option on the PO. This converts the overdue alert to a PI Delay alert and notifies the admin team of your reason.</p>
      </Subsection>
    </Section>
  );
}

function S5FMS() {
  return (
    <Section id="s-fms" num="5" title="Flow Management System (FMS)">
      <p>The Flow Management System tracks production and shipment milestones for each order. It operates across four stages (FMS 1–4), each covering a different phase of the production-to-delivery journey.</p>
      <ManualTable
        headers={["Stage", "Coverage", "Access"]}
        rows={[
          ["FMS 1 Form",    "Submit production update data via Google Form.",                "All Merchants"],
          ["FMS 1 Tracker", "View submitted FMS 1 entries in a consolidated tracker.",       "Admin only"],
          ["FMS 2 Tracker", "Production-to-ready tracker for active orders.",                "Admin only"],
          ["FMS 3",         "Embedded Google Sheet — shipment scheduling.",                  "All Merchants"],
          ["FMS 4",         "Embedded Google Sheet — delivery and clearance tracking.",      "All Merchants"],
        ]}
      />
      <Note><strong className="text-neutral-900">How to submit an FMS 1 update:</strong> Click <strong>FMS1 Form</strong> in the sidebar. This opens a Google Form in a new tab. Fill in the required production milestone details and submit. Your submission will appear in the FMS1 Tracker (admin view).</Note>
    </Section>
  );
}

function S6QA() {
  return (
    <Section id="s-qa" num="6" title="Quality & Compliance">
      <p>This section provides access to quality documentation, inspection reports, and compliance tools relevant to your buyer relationships.</p>
      <ManualTable
        headers={["Item", "Description"]}
        rows={[
          ["QA Manual",              "The full quality assurance manual applicable to your production. Reference this for inspection criteria and quality standards."],
          ["QA Score Card",          "Coming soon — will show QA scores by order and supplier."],
          ["FTPR Summary",           "First Time Pass Rate summary for your orders. Tracks how many inspections pass on the first attempt."],
          ["Supplier Audit Summary", "Results of audits conducted at supplier factories."],
          ["IRF",                    "Inspection Request Form — submit a request for a product inspection via Google Form (opens in new tab)."],
        ]}
      />
    </Section>
  );
}

function S7Financial() {
  return (
    <Section id="s-financial" num="7" title="Financial" adminOnly>
      <p>Financial tools are available to admin-level merchants only (excluding restricted logins).</p>
      <ManualTable
        headers={["Section", "Description"]}
        rows={[
          ["Invoices",        "View and download consultancy and trade invoices related to your account."],
          ["Payment History", "Coming soon."],
          ["Claims",          "Track and manage quality claims raised against orders."],
        ]}
      />
    </Section>
  );
}

function S8Logistics() {
  return (
    <Section id="s-logistics" num="8" title="Logistics" adminOnly>
      <p>The Logistics section provides a consolidated shipment and delivery report for orders in transit. Available to admin-level merchants only.</p>
      <p>Use this report to track which orders have been dispatched, estimated arrival dates, and shipping milestones.</p>
    </Section>
  );
}

function S9HR() {
  return (
    <Section id="s-hr" num="9" title="HR One Portal">
      <p>This is a direct link to the <strong>HROne</strong> HR management platform used by JNG. Clicking <strong>Access HR One</strong> opens the HROne app in a new tab using your existing HROne credentials.</p>
      <Note><strong className="text-neutral-900">Note:</strong> Your JNG Website login and your HROne login are separate. Contact HR if you need your HROne credentials.</Note>
    </Section>
  );
}

function S10Travel() {
  return (
    <Section id="s-travel" num="10" title="Travel Requests & Bill Uploads">
      <Subsection title="Placing a Travel Request">
        <Steps items={[
          "Go to <strong>Travel Request Form → Place a Request</strong> in the sidebar.",
          "A Google Form opens in a new tab.",
          "Fill in travel details — destination, dates, purpose, and estimated cost.",
          "Submit. Your request is routed to the approving manager.",
        ]} />
      </Subsection>
      <Subsection title="Uploading a Travel Bill">
        <Steps items={[
          "Go to <strong>Travel Bill Upload → Upload Bill</strong> in the sidebar.",
          "The upload form appears in the main content area.",
          "Enter the travel request reference, travel date, and total amount.",
          "Attach the bill or receipt (PDF or image).",
          "Submit. The bill is logged against your travel record for reimbursement processing.",
        ]} />
      </Subsection>
    </Section>
  );
}

function S11Issues() {
  return (
    <Section id="s-issues" num="11" title="Issue Tracker">
      <p>Use the Issue Tracker to log, track, and follow up on operational issues — production delays, communication gaps, quality problems, or anything requiring cross-team attention.</p>
      <ManualTable
        headers={["Tool", "Description"]}
        rows={[
          ["Issue Tracker",       "Internal portal for logging and managing open issues. Add a new issue, assign it, and track its resolution status."],
          ["JIT Dashboard",       "Power BI dashboard showing Just-In-Time production and delivery metrics. Opens in a new tab."],
          ["Merchant Performance","Power BI dashboard tracking merchant-level performance metrics across buyers and seasons. Opens in a new tab."],
        ]}
      />
      <Note><strong className="text-neutral-900">Note:</strong> Issue Tracker is not available for the suresh@jnitin.com and inspection@jnitin.com accounts.</Note>
    </Section>
  );
}

function S12Alerts() {
  return (
    <Section id="s-alerts" num="12" title="Alerts">
      <p>The <strong>Alerts</strong> button in the top header opens your notification drawer. It shows a real-time feed of activity across all POs and PIs your account manages. A red badge displays the count of unread alerts.</p>
      <Subsection title="Alert Types">
        <ManualTable
          headers={["Alert", "Triggered When"]}
          rows={[
            [<Badge>PO Upload</Badge>,  "A new Purchase Order is received and uploaded."],
            [<Badge>PO Updated</Badge>, "A PO (pre-PI confirmation) is edited — quantity, amount, date, or file changed."],
            [<Badge>PO Revised</Badge>, "A PI-confirmed PO is revised. An email is also sent to the admin team."],
            [<Badge>PI Upload</Badge>,  "A Proforma Invoice is uploaded and PI is confirmed."],
            [<Badge>PI Delay</Badge>,   "A delay reason is submitted for a PI that is overdue."],
            [<Badge>PO Deleted</Badge>, "A purchase order is removed from the system."],
          ]}
        />
      </Subsection>
      <Subsection title="How Alerts Work">
        <p>Each alert contains a snapshot of the PO at the time of the event — including buyer, supplier, PO number, file links, and any changes made. When a PO is revised or updated, the existing alert for that PO is updated in place and moves to the top of your feed so you always see the latest status first.</p>
        <p>The alert feed shows your most recent 300 alerts. Alerts are marked as read once you open them.</p>
      </Subsection>
      <Note><strong className="text-neutral-900">Email notifications:</strong> For key events (new PO, PI confirmed, PO revised, PI delay), the admin team also receives a formatted email with full order details. You do not need to manually notify anyone — the system handles this automatically.</Note>
    </Section>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function UserManualPage() {
  const scrollRef = useRef(null);
  const { activeId, scrolled, scrollTo } = useManual(SECTION_IDS, scrollRef);

  return (
    // ① Full-height flex column — header on top, sidebar+content below
    <div className="h-screen flex flex-col bg-white text-neutral-900" style={{ fontFamily: "Georgia, serif" }}>

      {/* ── Sticky header (unchanged) ── */}
      <header className={`shrink-0 z-30 bg-white transition-all duration-200 ${scrolled ? "shadow-[0_1px_0_#e5e5e5]" : ""}`}>
        <div className="max-w-none px-6 flex items-center justify-between py-3.5 border-b-2 border-neutral-900">
          <div>
            <h1 className="text-[38px] font-bold tracking-tight leading-none mb-0.5" style={{ fontFamily: "Figtree, serif" }}>
              Merchant Portal — User Manual
            </h1>
            <p className="text-[11px] font-mono text-neutral-500 tracking-widest uppercase m-0">
              JNG Website · Internal Reference · April 2026
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-1.5 px-2.5 py-1.5 border border-neutral-300 rounded text-xs font-sans font-medium text-neutral-700 hover:bg-neutral-50 transition-colors cursor-pointer bg-white">
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <rect x="3" y="3" width="7" height="7" rx="0.5" />
                <rect x="14" y="3" width="7" height="7" rx="0.5" />
                <rect x="3" y="14" width="7" height="7" rx="0.5" />
                <rect x="14" y="14" width="7" height="7" rx="0.5" />
              </svg>
              <Link className="hidden sm:inline" to="/dashboard">
                Dashboard
              </Link>
            </button>
          </div>
        </div>
      </header>

      {/* ② Body row — sidebar + scrollable content side by side */}
      <div className="flex flex-1 overflow-hidden">

        {/* ③ LEFT SIDEBAR — sticky, full-height, independently scrollable */}
        <Sidebar activeId={activeId} scrollTo={scrollTo} />

        {/* ④ MAIN CONTENT — scrollable, observer root */}
        <main
          ref={scrollRef}
          className="flex-1 overflow-y-auto"
        >
          <div className="mx-auto px-8 py-8">
            <S1Login />
            <S2Dashboard />
            <S3NPD />
            <S4Orders />
            <S5FMS />
            <S6QA />
            <S7Financial />
            <S8Logistics />
            <S9HR />
            <S10Travel />
            <S11Issues />
            <S12Alerts />

            {/* Footer */}
            <div className="border-t-2 border-neutral-900 pt-6 mt-4 flex items-center justify-between">
              <p className="text-xs font-mono text-neutral-400 uppercase tracking-widest m-0">JNG Website · Internal Reference Guide</p>
              <p className="text-xs font-mono text-neutral-400 m-0">Last updated April 2026</p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}