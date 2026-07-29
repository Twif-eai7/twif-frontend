import { useState, useEffect, Fragment } from "react";
import { useNavigate } from 'react-router-dom';

// ── Static Data ───────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { id: "qm-purpose",     label: "1. Purpose"           },
  { id: "qm-scope",       label: "2. Scope"             },
  { id: "qm-profile",     label: "3. Company Profile"   },
  { id: "qm-policy",      label: "4. Quality Policy"    },
  { id: "qm-structure",   label: "5. Org Structure"     },
  { id: "qm-processes",   label: "6. QMS Processes"     },
  { id: "qm-objectives",  label: "7. Quality Objectives"},
  { id: "qm-docs",        label: "8. Documented Info"   },
  { id: "qm-operations",  label: "9. Operations"        },
  { id: "qm-performance", label: "10. Performance"      },
  { id: "qm-improvement", label: "11. Improvement"      },
];

const HERO_META = [
  { label: "Document No.", value: "JNG/QMS/QM/001" },
  { label: "Revision",     value: "00"             },
  { label: "Effective",    value: "1 Oct 2025"     },
];

const SCOPE_TAGS = [
  "Furniture", "Lighting", "Tableware", "Kitchenware", "Photo Frames",
  "Mirrors", "Vases & Planters", "Soft Furnishing", "Storage",
  "Decorative Accessories", "Jewelry", "Lanterns & T-lights",
  "Christmas Decorations", "Upholstery Furniture", "Apparels",
];

const COMPANY_INFO = [
  { label: "Location", value: "Gurugram, Haryana – 122001, India" },
  { label: "Standard", value: "ISO 9001:2015"                     },
];

const PROCESS_STEPS = [
  "Inquiry", "Vendor Selection", "Sampling", "Order",
  "Production", "Inspection", "Shipment", "Feedback",
];

const OBJECTIVES = [
  {
    title:     "Customer Satisfaction",
    objective: "Ensure customer satisfaction through reliable service and quality",
    kpi:       "≥ 90%",
    kpiNote:   "positive feedback in customer evaluations",
    method:    "Customer feedback form / review",
    frequency: "Quarterly – QA Head",
  },
  {
    title:     "Supplier Performance",
    objective: "Maintain supplier performance and product quality",
    kpi:       "≥ 95%",
    kpiNote:   "of shipments accepted without major non-conformity",
    method:    "Supplier performance report, inspection summary",
    frequency: "Monthly – Sourcing & QA Team",
  },
  {
    title:     "On-time Shipments",
    objective: "Improve on-time shipment performance",
    kpi:       "≥ 95%",
    kpiNote:   "shipments dispatched within agreed timeline",
    method:    "Shipment tracking and delivery report",
    frequency: "Monthly – Merchandising Team",
  },
  {
    title:     "Complaint Reduction",
    objective: "Reduce customer complaints and non-conformities",
    kpi:       "≤ 2",
    kpiNote:   "customer complaints per quarter",
    method:    "NCR log and corrective action review",
    frequency: "Quarterly – QA & Compliance",
  },
  {
    title:     "Employee Training",
    objective: "Enhance employee competence and awareness",
    kpi:       "100%",
    kpiNote:   "of employees trained annually on QMS and product standards",
    method:    "Training records, attendance sheets",
    frequency: "Annual – HR & QA Team",
  },
  {
    title:     "Continual Improvement",
    objective: "Ensure continual improvement of the Quality Management System",
    kpi:       "Min 2",
    kpiNote:   "process improvements per year",
    method:    "Management Review / Internal Audit",
    frequency: "Annual – Top Management",
  },
];

// ── Small SVG helpers ─────────────────────────────────────────────────────────

const ArrowRight = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth="2">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

const MenuIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
       stroke="currentColor" strokeWidth="2">
    <line x1="3" y1="6"  x2="21" y2="6"  />
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="3" y1="18" x2="21" y2="18" />
  </svg>
);

// ── Section wrapper component ─────────────────────────────────────────────────

function Section({ id, number, title, children }) {
  return (
    <section id={id} className="mb-12 scroll-mt-6">
      <p className="text-[11px] font-bold tracking-widest text-gray-400 mb-1 uppercase">
        {number}
      </p>
      <h2 className="text-xl font-bold text-[#111] tracking-tight mb-4">{title}</h2>
      {children}
    </section>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function QualityManual() {
  const [activeId,      setActiveId]      = useState("qm-purpose");
  const [mobileTocOpen, setMobileTocOpen] = useState(false);
  const navigate = useNavigate();

  // Scroll spy
  useEffect(() => {
    const sections = document.querySelectorAll("[data-qm-section]");
    if (!sections.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveId(entry.target.id);
        });
      },
      { rootMargin: "-20% 0px -70% 0px" }
    );

    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, []);

  const scrollTo = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setMobileTocOpen(false);
  };

  const navLinkClass = (id) =>
    `text-left text-xs font-medium px-3 py-1.5 rounded-md border-l-2 transition-all duration-150 w-full block
     ${activeId === id
       ? "text-[#111] font-semibold border-[#1a1a1a] bg-gray-100"
       : "text-gray-500 border-transparent hover:text-[#111] hover:bg-gray-100"
     }`;

  return (
    <div className="font-sans text-[#333] leading-relaxed">

      {/* ── HERO ── */}
      <section className="bg-[#1a1a1a] text-white py-14 px-6 text-center">
        <div className="flex justify-end flex-wrap gap-2 mt-2 items-center">
        <button type="button" type="button"
                onClick={() => navigate('/dashboard')} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[ #101010] bg-white text-xs font-semibold text-black cursor-pointer shadow-sm hover:bg-[#101010] hover:text-white transition-colors"
                >← Back TO Dashboard</button></div>
        <div className="max-w-xl mx-auto">
          <span className="inline-block text-[11px] font-bold tracking-widest uppercase
                           bg-white/15 border border-white/25 px-4 py-1 rounded-full mb-5">
            ISO 9001:2015
          </span>
          <h1 className="text-4xl font-extrabold tracking-tight mb-2 leading-tight">
            Quality Manual
          </h1>
          <p className="text-base text-white/70 mb-7 font-normal">
            Jnitin Global · Buying House &amp; Sourcing Solutions
          </p>

          {/* Meta strip */}
          <div className="inline-flex items-center gap-4 bg-white/10 px-6 py-3 rounded-xl
                          flex-wrap justify-center">
            {HERO_META.map(({ label, value }, i) => (
              <Fragment key={label}>
                {i > 0 && (
                  <div className="w-px h-7 bg-white/15 hidden sm:block" />
                )}
                <div className="flex flex-col gap-0.5 text-left">
                  <span className="text-[9px] font-semibold uppercase tracking-wider text-white/50">
                    {label}
                  </span>
                  <span className="text-xs font-semibold text-white">{value}</span>
                </div>
              </Fragment>
            ))}
          </div>
        </div>
      </section>

      {/* ── LAYOUT ── */}
      <div className="flex gap-0 px-6 max-md:px-5">

        {/* ── SIDEBAR (desktop) ── */}
        <nav className="hidden md:flex flex-col gap-0.5 w-[200px] flex-shrink-0
                        sticky top-6 self-start pt-8 pb-8">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400
                        mb-3 pl-3">
            Contents
          </p>
          {NAV_ITEMS.map(({ id, label }) => (
            <button key={id} onClick={() => scrollTo(id)} className={navLinkClass(id)}>
              {label}
            </button>
          ))}
        </nav>

        {/* ── SIDEBAR (mobile overlay) ── */}
        {mobileTocOpen && (
          <div
            className="fixed inset-0 bg-white z-50 flex flex-col px-6 pt-14 pb-6
                       overflow-y-auto gap-1 md:hidden"
            onClick={(e) => e.target === e.currentTarget && setMobileTocOpen(false)}
          >
            <button
              onClick={() => setMobileTocOpen(false)}
              className="absolute top-4 right-5 text-gray-400 text-2xl leading-none
                         hover:text-gray-700 transition-colors"
            >
              ✕
            </button>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400
                          mb-3 pl-1">
              Contents
            </p>
            {NAV_ITEMS.map(({ id, label }) => (
              <button key={id} onClick={() => scrollTo(id)} className={navLinkClass(id)}>
                {label}
              </button>
            ))}
          </div>
        )}

        {/* ── MAIN CONTENT ── */}
        <main className="flex-1 min-w-0 py-10 pb-20 md:pl-12
                         md:border-l md:border-gray-200 max-md:pt-8">

          {/* 1 — Purpose */}
          <section id="qm-purpose" data-qm-section className="mb-12 scroll-mt-6">
            <SectionHead number="01" title="Purpose" />
            <p className="text-sm text-gray-500 leading-relaxed">
              The purpose of this Quality Manual is to define and describe the Quality Management
              System (QMS) implemented by Jnitin Global, a Buying House engaged in sourcing, vendor
              management, quality assurance, and shipment coordination for international and domestic
              customers. This manual ensures compliance with ISO 9001:2015 and provides a framework
              for consistent quality performance.
            </p>
          </section>

          {/* 2 — Scope */}
          <section id="qm-scope" data-qm-section className="mb-12 scroll-mt-6">
            <SectionHead number="02" title="Scope" />
            <p className="text-sm text-gray-500 leading-relaxed mb-4">
              This Quality Manual applies to all activities related to sourcing, inspection, and
              delivery of the following product categories:
            </p>
            <div className="flex flex-wrap gap-2 max-w-2xl">
              {SCOPE_TAGS.map((tag) => (
                <span key={tag}
                      className="text-xs font-medium text-[#333] bg-white border border-gray-200
                                 px-3 py-1 rounded-md">
                  {tag}
                </span>
              ))}
            </div>
          </section>

          {/* 3 — Company Profile */}
          <section id="qm-profile" data-qm-section className="mb-12 scroll-mt-6">
            <SectionHead number="03" title="Company Profile" />
            <p className="text-sm text-gray-500 leading-relaxed mb-4">
              Jnitin Global, established in Gurugram, Haryana, serves as a professional buying house
              connecting international buyers with verified Indian manufacturers. The company
              specialises in end-to-end sourcing solutions — from vendor selection and sampling to
              production follow-up, inspection, and shipment coordination.
            </p>
            <div className="max-w-sm bg-white border border-gray-200 rounded-lg px-5 py-1">
              {COMPANY_INFO.map(({ label, value }, i) => (
                <div key={label}
                     className={`flex justify-between py-2.5 ${i > 0 ? "border-t border-gray-100" : ""}`}>
                  <span className="text-xs font-semibold text-gray-400">{label}</span>
                  <span className="text-xs font-medium text-[#333]">{value}</span>
                </div>
              ))}
            </div>
          </section>

          {/* 4 — Quality Policy */}
          <section id="qm-policy" data-qm-section className="mb-12 scroll-mt-6">
            <SectionHead number="04" title="Quality Policy" />
            <blockquote className="border-l-[3px] border-[#1a1a1a] bg-gray-100 rounded-r-lg
                                   px-6 py-5 max-w-2xl space-y-3">
              <p className="text-sm text-[#333] leading-relaxed">
                At Jnitin Global, we are committed to providing professional sourcing, quality
                assurance, and compliance services that consistently meet our customers' requirements
                and expectations.
              </p>
              <p className="text-sm text-[#333] leading-relaxed">
                Our mission is to deliver reliable products and services through effective vendor
                management, transparent communication, and continuous quality improvement across all
                stages of product development and supply chain execution.
              </p>
            </blockquote>
          </section>

          {/* 5 — Org Structure */}
          <section id="qm-structure" data-qm-section className="mb-12 scroll-mt-6">
            <SectionHead number="05" title="Organizational Structure" />
            <p className="text-sm text-gray-500 leading-relaxed">
              Top Management ensures resources, communicates the quality policy, and drives
              continual improvement.
            </p>
          </section>

          {/* 6 — QMS Processes */}
          <section id="qm-processes" data-qm-section className="mb-12 scroll-mt-6">
            <SectionHead number="06" title="QMS Processes" />
            <p className="text-sm text-gray-500 leading-relaxed mb-5">
              The QMS process follows a structured flow to ensure quality at every stage:
            </p>

            {/* Desktop: horizontal */}
            <div className="hidden sm:flex items-center gap-1 flex-wrap">
              {PROCESS_STEPS.map((step, i) => (
                <Fragment key={step}>
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-white
                                  border border-gray-200 rounded-lg">
                    <StepBubble n={i + 1} />
                    <span className="text-xs font-semibold text-[#333] whitespace-nowrap">
                      {step}
                    </span>
                  </div>
                  {i < PROCESS_STEPS.length - 1 && (
                    <span className="text-gray-400"><ArrowRight /></span>
                  )}
                </Fragment>
              ))}
            </div>

            {/* Mobile: vertical */}
            <div className="flex flex-col items-center gap-0 sm:hidden">
              {PROCESS_STEPS.map((step, i) => (
                <Fragment key={step}>
                  <div className="flex items-center gap-3 px-6 py-2.5 bg-white
                                  border border-gray-200 rounded-lg w-full justify-center">
                    <StepBubble n={i + 1} />
                    <span className="text-xs font-semibold text-[#333]">{step}</span>
                  </div>
                  {i < PROCESS_STEPS.length - 1 && (
                    <div className="text-gray-400 rotate-90 py-0.5"><ArrowRight /></div>
                  )}
                </Fragment>
              ))}
            </div>
          </section>

          {/* 7 — Quality Objectives */}
          <section id="qm-objectives" data-qm-section className="mb-12 scroll-mt-6">
            <SectionHead number="07" title="Quality Objectives" />

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto mt-4 border border-gray-200
                            rounded-xl">
              <table className="w-full text-sm border-collapse min-w-[640px]">
                <thead className="bg-gray-50">
                  <tr>
                    {["#", "Quality Objective", "Target / KPI",
                      "Monitoring Method", "Frequency / Responsibility"].map((h) => (
                      <th key={h}
                          className="text-left text-[11px] font-semibold uppercase tracking-wide
                                     text-gray-400 px-4 py-3 border-b border-gray-200">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {OBJECTIVES.map((obj, i) => (
                    <tr key={obj.title}
                        className="hover:bg-gray-50 border-b border-gray-100 last:border-b-0
                                   transition-colors">
                      <td className="px-4 py-3 text-center text-gray-400 font-semibold">
                        {i + 1}
                      </td>
                      <td className="px-4 py-3 text-[#333] leading-snug">{obj.objective}</td>
                      <td className="px-4 py-3 text-[#333]">
                        <span className="font-bold text-green-600">{obj.kpi}</span>
                        {" "}{obj.kpiNote}
                      </td>
                      <td className="px-4 py-3 text-[#333]">{obj.method}</td>
                      <td className="px-4 py-3 text-[#333]">{obj.frequency}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="flex flex-col gap-3 mt-4 md:hidden">
              {OBJECTIVES.map((obj, i) => (
                <div key={obj.title}
                     className="bg-white border border-gray-200 rounded-lg px-4 py-3">
                  <div className="flex items-center gap-2.5 mb-2">
                    <StepBubble n={i + 1} />
                    <span className="text-sm font-semibold text-[#111]">{obj.title}</span>
                  </div>
                  <p className="text-sm text-[#333] mb-1">
                    <span className="font-bold text-green-600">{obj.kpi}</span>
                    {" "}{obj.kpiNote}
                  </p>
                  <p className="text-xs text-gray-400">{obj.frequency}</p>
                </div>
              ))}
            </div>
          </section>

          {/* 8 — Documented Information */}
          <section id="qm-docs" data-qm-section className="mb-12 scroll-mt-6">
            <SectionHead number="08" title="Documented Information" />
            <p className="text-sm text-gray-500 leading-relaxed">
              Documents and records are controlled per ISO 9001:2015 Clause 7.5. Obsolete documents
              are promptly removed.
            </p>
          </section>

          {/* 9 — Operations */}
          <section id="qm-operations" data-qm-section className="mb-12 scroll-mt-6">
            <SectionHead number="09" title="Operation & Control" />
            <p className="text-sm text-gray-500 leading-relaxed">
              Operations are monitored through regular inspections, vendor evaluations, and shipment
              reviews.
            </p>
          </section>

          {/* 10 — Performance */}
          <section id="qm-performance" data-qm-section className="mb-12 scroll-mt-6">
            <SectionHead number="10" title="Performance Evaluation" />
            <p className="text-sm text-gray-500 leading-relaxed">
              Performance is reviewed through audits, management reviews, and feedback analysis.
            </p>
          </section>

          {/* 11 — Improvement */}
          <section id="qm-improvement" data-qm-section className="mb-12 scroll-mt-6">
            <SectionHead number="11" title="Improvement" />
            <p className="text-sm text-gray-500 leading-relaxed">
              Nonconformities are recorded, root causes analysed, and corrective actions implemented
              for continual improvement.
            </p>
          </section>

          {/* Document footer */}
          <div className="flex items-center gap-2 pt-8 mt-12 border-t border-gray-200
                          text-[11px] text-gray-400 flex-wrap">
            <span>JNG-QMS-QM-2025-001-REV00</span>
            <span>·</span>
            <span>Jnitin Global</span>
            <span>·</span>
            <span>Effective 1 Oct 2025</span>
          </div>

        </main>
      </div>

      {/* ── Mobile TOC button ── */}
      <button
        onClick={() => setMobileTocOpen(true)}
        className="fixed bottom-5 right-5 w-12 h-12 bg-[#1a1a1a] text-white rounded-full
                   flex items-center justify-center shadow-lg z-50 md:hidden
                   hover:bg-[#333] transition-colors"
        aria-label="Table of contents"
      >
        <MenuIcon />
      </button>

    </div>
  );
}

// ── Tiny shared sub-components ────────────────────────────────────────────────

function SectionHead({ number, title }) {
  return (
    <>
      <p className="text-[11px] font-bold tracking-widest text-gray-400 mb-1 uppercase">
        {number}
      </p>
      <h2 className="text-xl font-bold text-[#111] tracking-tight mb-4">{title}</h2>
    </>
  );
}

function StepBubble({ n }) {
  return (
    <span className="w-[22px] h-[22px] bg-[#1a1a1a] text-white rounded-full
                     flex items-center justify-center text-[11px] font-bold flex-shrink-0">
      {n}
    </span>
  );
}