import { useState, useEffect, Fragment } from "react";
import {
  SEC03_POLICY_STATEMENT, SEC03_PRINCIPLES,
  SEC04_INTRO, SEC04_RISK_CLASSES, SEC04_CONTROL_PLAN_INTRO, SEC04_CONTROL_PLAN_ELEMENTS,
  SEC05_INTRO, SEC05_CONTRACT_ITEMS, SEC05_ORDER_REVIEW,
  SEC06_DESIGN_INPUTS, SEC06_DESIGN_REVIEW_ITEMS, SEC06_RISK_ASSESSMENT_INTRO,
  SEC06_DFMEA_COLUMNS, SEC06_DFMEA_ROWS, SEC06_GATE_REVIEWS,
  SEC07_INTRO, SEC07_SAMPLE_TYPES, SEC07_REVIEW_PROTOCOL,
  SEC08_INTRO, SEC08_TECH_FILE_CONTENT, SEC08_GOLDEN_SAMPLE,
  SEC09_INTRO, SEC09_QUALIFICATION_DOMAINS, SEC09_SUPPLIER_STATUS,
  SEC10_INTRO, SEC10_PPM_AGENDA, SEC10_CLOSING,
  SEC11_INTRO, SEC11_ITEMS, SEC11_MATERIAL_CONTROLS,
  SEC12_PROCESS_CONTROL_INTRO, SEC12_PROCESS_CONTROL_ITEMS, SEC12_INLINE_INTRO,
  SEC12_INLINE_AREAS, SEC12_CLOSING,
  SEC13_INTRO, SEC13_CHECKS, SEC13_CLOSING,
  SEC14_INTRO, SEC14_LOT_DEFINITION, SEC14_AQL_INTRO, SEC14_DEFECT_CLASSES,
  SEC14_ESCALATION_NOTE, SEC14_SEQUENCE, SEC14_RESULTS,
  SEC15_ITEMS, SEC15_CONCESSION_CONTENT,
  SEC16_INTRO, SEC16_STAGES, SEC16_NOTES,
  SEC17_INTRO, SEC17_CONTROLS, SEC17_CLOSING,
  SEC18_ITEMS, SEC18_EQUIPMENT,
  SEC19_INTEGRITY, SEC19_TRACEABILITY, SEC19_CHANGE_CONTROL, SEC19_CLOSING,
  SEC20_OBJECTIVES, SEC20_ESCALATION,
  SEC21_INTRO, SEC21_ITEMS, SEC21_SEVERITY,
  SEC22_ITEMS, SEC22_MODULES,
  SEC23_INTRO, SEC23_REVIEW_INPUTS, SEC23_CORE_OBJECTIVES,
  SEC24_INTRO, SEC24_CATEGORIES,
  SEC25_FORMS, SEC25_REPORT_FIELDS,
  SEC26_PHASES, SEC26_AUDIT_ITEMS,
} from "./QualityManual.data";

// ── Static Data ───────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { id: "qm-purpose",       label: "1. Purpose"                          },
  { id: "qm-scope",         label: "2. Scope"                            },
  { id: "qm-policy",        label: "3. Quality Policy & Principles"      },
  { id: "qm-risk",          label: "4. Risk-Based Quality Planning"      },
  { id: "qm-contract",      label: "5. Customer & Contract Review"       },
  { id: "qm-pd",            label: "6. Product Development QA"          },
  { id: "qm-sampling",      label: "7. Sample Development & Approval"    },
  { id: "qm-techfile",      label: "8. Technical Files & Golden Samples" },
  { id: "qm-supplier",      label: "9. Supplier Qualification"           },
  { id: "qm-ppm",           label: "10. Pre-Production Readiness (PPM)"  },
  { id: "qm-rawmaterial",   label: "11. Raw Material & Component QC"     },
  { id: "qm-inline",        label: "12. Production QC & In-Line"         },
  { id: "qm-midline",       label: "13. Midline Inspection"               },
  { id: "qm-final",         label: "14. Final Inspection & Release"       },
  { id: "qm-nonconforming", label: "15. Nonconforming & Concession"       },
  { id: "qm-capa",          label: "16. CAPA & Root Cause Analysis"       },
  { id: "qm-compliance",    label: "17. Testing & Regulatory Compliance"  },
  { id: "qm-calibration",   label: "18. Calibration & Lab Equipment"      },
  { id: "qm-records",       label: "19. Quality Records & Change Control" },
  { id: "qm-escalation",    label: "20. Supplier Performance & Escalation"},
  { id: "qm-complaints",    label: "21. Complaints & Recall Readiness"    },
  { id: "qm-training",      label: "22. Training & Ethical Conduct"       },
  { id: "qm-review",        label: "23. Management Review & KPIs"        },
  { id: "qm-categories",    label: "24. Category-Specific Control Plans" },
  { id: "qm-forms",         label: "25. Forms & Mandatory Records"       },
  { id: "qm-roadmap",       label: "26. Implementation Roadmap"          },
];

const HERO_META = [
  { label: "Document No.", value: "TWIF/QMS/QM/001" },
  { label: "Revision",     value: "00"             },
  { label: "Effective",    value: "1 Oct 2025"     },
];

const SCOPE_TAGS = [
  "Furniture", "Lighting", "Tableware", "Kitchenware", "Photo Frames",
  "Mirrors", "Vases & Planters", "Soft Furnishing", "Storage",
  "Decorative Accessories", "Jewelry", "Lanterns & T-lights",
  "Christmas Decorations", "Upholstery Furniture", "Apparels",
];

// ── Small SVG helpers ─────────────────────────────────────────────────────────

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
      {/* No "Back" control here anymore - this now renders inline inside
          the Quality & Compliance tab system (Dashboard's own sidebar stays
          visible the whole time), same as every sibling tab; leaving one
          would be redundant/inconsistent with how those switch tabs. */}
      <section className="bg-[#1a1a1a] text-white py-14 px-6 text-center">
        <div className="max-w-xl mx-auto">
          <span className="inline-block text-[11px] font-bold tracking-widest uppercase
                           bg-white/15 border border-white/25 px-4 py-1 rounded-full mb-5">
            ISO 9001:2015
          </span>
          <h1 className="text-4xl font-extrabold tracking-tight mb-2 leading-tight">
            Quality Manual
          </h1>
          <p className="text-base text-white/70 mb-7 font-normal">
            Twif Technologies · Buying House &amp; Sourcing Solutions
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
        <nav className="hidden md:flex flex-col gap-0.5 w-64 flex-shrink-0
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
              System (QMS) implemented by Twif Technologies, a Buying House engaged in sourcing, vendor
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

          {/* 3 — Quality Policy & Principles */}
          <section id="qm-policy" data-qm-section className="mb-12 scroll-mt-6">
            <SectionHead number="03" title="Quality Policy & Principles" />
            <Callout>
              <p className="text-sm text-[#333] leading-relaxed">{SEC03_POLICY_STATEMENT}</p>
            </Callout>
            <p className="text-sm font-semibold text-[#111] mt-6 mb-3">Non-Negotiable Principles</p>
            <BulletList items={SEC03_PRINCIPLES} />
          </section>

          {/* 4 — Risk-Based Quality Planning */}
          <section id="qm-risk" data-qm-section className="mb-12 scroll-mt-6">
            <SectionHead number="04" title="Risk-Based Quality Planning" />
            <p className="text-sm text-gray-500 leading-relaxed mb-2">{SEC04_INTRO}</p>
            <DataTable
              columns={[
                { key: "riskClass", label: "Risk class" },
                { key: "triggers", label: "Typical triggers" },
                { key: "controls", label: "Minimum controls" },
              ]}
              rows={SEC04_RISK_CLASSES}
            />
            <p className="text-sm font-semibold text-[#111] mt-8 mb-2">Product Quality Plan / Control Plan</p>
            <p className="text-sm text-gray-500 leading-relaxed mb-2">{SEC04_CONTROL_PLAN_INTRO}</p>
            <DataTable
              columns={[
                { key: "element", label: "Control-plan element" },
                { key: "content", label: "Required content" },
              ]}
              rows={SEC04_CONTROL_PLAN_ELEMENTS}
            />
          </section>

          {/* 5 — Customer Requirements & Contract Review */}
          <section id="qm-contract" data-qm-section className="mb-12 scroll-mt-6">
            <SectionHead number="05" title="Customer Requirements & Contract Review" />
            <p className="text-sm text-gray-500 leading-relaxed mb-4">{SEC05_INTRO}</p>
            <BulletList items={SEC05_CONTRACT_ITEMS} />
            <p className="text-sm font-semibold text-[#111] mt-6 mb-2">Order Review</p>
            <p className="text-sm text-gray-500 leading-relaxed max-w-2xl">{SEC05_ORDER_REVIEW}</p>
          </section>

          {/* 6 — Product Development QA */}
          <section id="qm-pd" data-qm-section className="mb-12 scroll-mt-6">
            <SectionHead number="06" title="Product Development QA" />
            <p className="text-sm font-semibold text-[#111] mb-2">Design Inputs</p>
            <p className="text-sm text-gray-500 leading-relaxed max-w-2xl mb-6">{SEC06_DESIGN_INPUTS}</p>

            <p className="text-sm font-semibold text-[#111] mb-3">Design-for-Quality Review</p>
            <BulletList items={SEC06_DESIGN_REVIEW_ITEMS} />

            <p className="text-sm font-semibold text-[#111] mt-8 mb-2">Design Risk Assessment</p>
            <p className="text-sm text-gray-500 leading-relaxed max-w-2xl mb-2">{SEC06_RISK_ASSESSMENT_INTRO}</p>
            <DataTable columns={SEC06_DFMEA_COLUMNS} rows={SEC06_DFMEA_ROWS} />

            <p className="text-sm font-semibold text-[#111] mt-8 mb-2">Development Gate Reviews</p>
            <DataTable
              columns={[
                { key: "gate", label: "Gate" },
                { key: "criteria", label: "Exit criteria" },
              ]}
              rows={SEC06_GATE_REVIEWS}
            />
          </section>

          {/* 7 — Sample Development & Approval */}
          <section id="qm-sampling" data-qm-section className="mb-12 scroll-mt-6">
            <SectionHead number="07" title="Sample Development & Approval Control" />
            <p className="text-sm text-gray-500 leading-relaxed mb-2">{SEC07_INTRO}</p>
            <DataTable
              columns={[
                { key: "type", label: "Sample type" },
                { key: "purpose", label: "Purpose" },
                { key: "requirements", label: "Minimum requirements" },
              ]}
              rows={SEC07_SAMPLE_TYPES}
            />
            <p className="text-sm font-semibold text-[#111] mt-8 mb-3">Sample Review Protocol</p>
            <BulletList items={SEC07_REVIEW_PROTOCOL} />
          </section>

          {/* 8 — Technical Files & Golden Samples */}
          <section id="qm-techfile" data-qm-section className="mb-12 scroll-mt-6">
            <SectionHead number="08" title="Technical Files, Specifications & Golden Samples" />
            <p className="text-sm text-gray-500 leading-relaxed mb-2">{SEC08_INTRO}</p>
            <DataTable
              columns={[
                { key: "content", label: "Mandatory technical-file content" },
                { key: "examples", label: "Examples" },
              ]}
              rows={SEC08_TECH_FILE_CONTENT}
            />
            <p className="text-sm font-semibold text-[#111] mt-8 mb-3">Golden Sample Control</p>
            <BulletList items={SEC08_GOLDEN_SAMPLE} />
          </section>

          {/* 9 — Supplier Qualification & Onboarding */}
          <section id="qm-supplier" data-qm-section className="mb-12 scroll-mt-6">
            <SectionHead number="09" title="Supplier Qualification & Onboarding" />
            <p className="text-sm text-gray-500 leading-relaxed mb-2">{SEC09_INTRO}</p>
            <DataTable
              columns={[
                { key: "domain", label: "Qualification domain" },
                { key: "evidence", label: "Minimum evidence" },
              ]}
              rows={SEC09_QUALIFICATION_DOMAINS}
            />
            <p className="text-sm font-semibold text-[#111] mt-8 mb-2">Supplier Status</p>
            <DataTable
              columns={[
                { key: "status", label: "Status" },
                { key: "meaning", label: "Meaning" },
                { key: "restrictions", label: "Restrictions" },
              ]}
              rows={SEC09_SUPPLIER_STATUS}
            />
          </section>

          {/* 10 — Pre-Production Readiness (PPM) */}
          <section id="qm-ppm" data-qm-section className="mb-12 scroll-mt-6">
            <SectionHead number="10" title="Pre-Production Readiness & PPM" />
            <p className="text-sm text-gray-500 leading-relaxed mb-2">{SEC10_INTRO}</p>
            <DataTable
              columns={[
                { key: "agenda", label: "PPM agenda" },
                { key: "evidence", label: "Required decision / evidence" },
              ]}
              rows={SEC10_PPM_AGENDA}
            />
            <p className="text-sm text-gray-500 leading-relaxed max-w-2xl mt-6">{SEC10_CLOSING}</p>
          </section>

          {/* 11 — Raw Material & Component QC */}
          <section id="qm-rawmaterial" data-qm-section className="mb-12 scroll-mt-6">
            <SectionHead number="11" title="Raw Material & Component Quality Control" />
            <p className="text-sm text-gray-500 leading-relaxed mb-4">{SEC11_INTRO}</p>
            <BulletList items={SEC11_ITEMS} />
            <p className="text-sm font-semibold text-[#111] mt-8 mb-2">Incoming Controls by Material Family</p>
            <DataTable
              columns={[
                { key: "family", label: "Material family" },
                { key: "controls", label: "Typical incoming controls" },
              ]}
              rows={SEC11_MATERIAL_CONTROLS}
            />
          </section>

          {/* 12 — Production QC & In-Line Inspection */}
          <section id="qm-inline" data-qm-section className="mb-12 scroll-mt-6">
            <SectionHead number="12" title="Production QC & In-Line Inspection" />
            <p className="text-sm font-semibold text-[#111] mb-2">Supplier Process Control</p>
            <p className="text-sm text-gray-500 leading-relaxed mb-4">{SEC12_PROCESS_CONTROL_INTRO}</p>
            <BulletList items={SEC12_PROCESS_CONTROL_ITEMS} />

            <p className="text-sm font-semibold text-[#111] mt-8 mb-2">Twif In-Line Inspection</p>
            <p className="text-sm text-gray-500 leading-relaxed mb-2">{SEC12_INLINE_INTRO}</p>
            <DataTable
              columns={[
                { key: "area", label: "Inspection area" },
                { key: "checks", label: "Checks" },
              ]}
              rows={SEC12_INLINE_AREAS}
            />
            <p className="text-sm text-gray-500 leading-relaxed max-w-2xl mt-6">{SEC12_CLOSING}</p>
          </section>

          {/* 13 — Midline Inspection */}
          <section id="qm-midline" data-qm-section className="mb-12 scroll-mt-6">
            <SectionHead number="13" title="Twif Midline Inspection" />
            <p className="text-sm text-gray-500 leading-relaxed mb-2">{SEC13_INTRO}</p>
            <DataTable
              columns={[
                { key: "area", label: "Inspection area" },
                { key: "checks", label: "Checks" },
              ]}
              rows={SEC13_CHECKS}
            />
            <p className="text-sm text-gray-500 leading-relaxed max-w-2xl mt-6">{SEC13_CLOSING}</p>
          </section>

          {/* 14 — Final Random Inspection & Release */}
          <section id="qm-final" data-qm-section className="mb-12 scroll-mt-6">
            <SectionHead number="14" title="Twif Final Random Inspection & Release" />
            <p className="text-sm text-gray-500 leading-relaxed mb-4">{SEC14_INTRO}</p>

            <p className="text-sm font-semibold text-[#111] mb-3">Lot Definition</p>
            <BulletList items={SEC14_LOT_DEFINITION} />

            <p className="text-sm font-semibold text-[#111] mt-8 mb-2">Sampling and AQL</p>
            <p className="text-sm text-gray-500 leading-relaxed mb-2">{SEC14_AQL_INTRO}</p>
            <DataTable
              columns={[
                { key: "defectClass", label: "Defect class" },
                { key: "approach", label: "Default acceptance approach" },
                { key: "examples", label: "Examples" },
              ]}
              rows={SEC14_DEFECT_CLASSES}
            />
            <p className="text-sm text-gray-500 leading-relaxed max-w-2xl mt-4">{SEC14_ESCALATION_NOTE}</p>

            <p className="text-sm font-semibold text-[#111] mt-8 mb-3">Mandatory Final Inspection Sequence</p>
            <NumberedList items={SEC14_SEQUENCE} />

            <p className="text-sm font-semibold text-[#111] mt-8 mb-2">Inspection Result</p>
            <DataTable
              columns={[
                { key: "result", label: "Result" },
                { key: "definition", label: "Definition" },
                { key: "release", label: "Release rule" },
              ]}
              rows={SEC14_RESULTS}
            />
          </section>

          {/* 15 — Nonconforming Product & Concession */}
          <section id="qm-nonconforming" data-qm-section className="mb-12 scroll-mt-6">
            <SectionHead number="15" title="Nonconforming Product, Rework & Concession" />
            <BulletList items={SEC15_ITEMS} />
            <p className="text-sm font-semibold text-[#111] mt-8 mb-2">Concession Request Content</p>
            <DataTable
              columns={[
                { key: "field", label: "Concession request content" },
                { key: "detail", label: "Minimum detail" },
              ]}
              rows={SEC15_CONCESSION_CONTENT}
            />
          </section>

          {/* 16 — CAPA & Root Cause Analysis */}
          <section id="qm-capa" data-qm-section className="mb-12 scroll-mt-6">
            <SectionHead number="16" title="Corrective & Preventive Action / Root Cause Analysis" />
            <p className="text-sm text-gray-500 leading-relaxed mb-2">{SEC16_INTRO}</p>
            <DataTable
              columns={[
                { key: "stage", label: "CAPA stage" },
                { key: "requirement", label: "Requirement" },
                { key: "timing", label: "Typical timing" },
              ]}
              rows={SEC16_STAGES}
            />
            <div className="mt-6">
              <BulletList items={SEC16_NOTES} />
            </div>
          </section>

          {/* 17 — Testing & Regulatory Compliance */}
          <section id="qm-compliance" data-qm-section className="mb-12 scroll-mt-6">
            <SectionHead number="17" title="Testing, Regulatory & Market Compliance" />
            <p className="text-sm text-gray-500 leading-relaxed mb-2">{SEC17_INTRO}</p>
            <DataTable
              columns={[
                { key: "control", label: "Compliance control" },
                { key: "requirement", label: "Requirement" },
              ]}
              rows={SEC17_CONTROLS}
            />
            <p className="text-sm text-gray-500 leading-relaxed max-w-2xl mt-6">{SEC17_CLOSING}</p>
          </section>

          {/* 18 — Calibration & Lab Equipment */}
          <section id="qm-calibration" data-qm-section className="mb-12 scroll-mt-6">
            <SectionHead number="18" title="Calibration, Inspection Equipment & Laboratories" />
            <BulletList items={SEC18_ITEMS} />
            <div className="mt-6">
              <DataTable
                columns={[
                  { key: "equipment", label: "Equipment" },
                  { key: "control", label: "Typical control" },
                ]}
                rows={SEC18_EQUIPMENT}
              />
            </div>
          </section>

          {/* 19 — Quality Records & Change Control */}
          <section id="qm-records" data-qm-section className="mb-12 scroll-mt-6">
            <SectionHead number="19" title="Quality Records, Traceability & Change Control" />
            <p className="text-sm font-semibold text-[#111] mb-3">Record Integrity</p>
            <BulletList items={SEC19_INTEGRITY} />

            <p className="text-sm font-semibold text-[#111] mt-8 mb-2">Traceability</p>
            <p className="text-sm text-gray-500 leading-relaxed max-w-2xl">{SEC19_TRACEABILITY}</p>

            <p className="text-sm font-semibold text-[#111] mt-8 mb-2">Change Control</p>
            <DataTable
              columns={[
                { key: "change", label: "Change requiring review" },
                { key: "examples", label: "Examples" },
              ]}
              rows={SEC19_CHANGE_CONTROL}
            />
            <p className="text-sm text-gray-500 leading-relaxed max-w-2xl mt-6">{SEC19_CLOSING}</p>
          </section>

          {/* 20 — Supplier Performance & Escalation */}
          <section id="qm-escalation" data-qm-section className="mb-12 scroll-mt-6">
            <SectionHead number="20" title="Supplier Performance, Audits & Escalation" />
            <DataTable
              columns={[
                { key: "objective", label: "Quality objective" },
                { key: "definition", label: "Definition / expectation" },
              ]}
              rows={SEC20_OBJECTIVES}
            />
            <p className="text-sm font-semibold text-[#111] mt-8 mb-2">Escalation Levels</p>
            <DataTable
              columns={[
                { key: "level", label: "Escalation level" },
                { key: "trigger", label: "Trigger" },
                { key: "controls", label: "Controls" },
              ]}
              rows={SEC20_ESCALATION}
            />
          </section>

          {/* 21 — Customer Complaints & Recall Readiness */}
          <section id="qm-complaints" data-qm-section className="mb-12 scroll-mt-6">
            <SectionHead number="21" title="Customer Complaints, Incidents & Recall Readiness" />
            <p className="text-sm text-gray-500 leading-relaxed mb-4">{SEC21_INTRO}</p>
            <BulletList items={SEC21_ITEMS} />
            <div className="mt-6">
              <DataTable
                columns={[
                  { key: "severity", label: "Severity" },
                  { key: "example", label: "Example" },
                  { key: "escalation", label: "Escalation" },
                ]}
                rows={SEC21_SEVERITY}
              />
            </div>
          </section>

          {/* 22 — Training & Ethical Conduct */}
          <section id="qm-training" data-qm-section className="mb-12 scroll-mt-6">
            <SectionHead number="22" title="Training, Competence & Ethical Conduct" />
            <BulletList items={SEC22_ITEMS} />
            <div className="mt-6">
              <DataTable
                columns={[
                  { key: "module", label: "Competence module" },
                  { key: "coverage", label: "Minimum coverage" },
                ]}
                rows={SEC22_MODULES}
              />
            </div>
          </section>

          {/* 23 — Management Review & KPIs */}
          <section id="qm-review" data-qm-section className="mb-12 scroll-mt-6">
            <SectionHead number="23" title="Management Review, KPIs & Continuous Improvement" />
            <p className="text-sm text-gray-500 leading-relaxed mb-2">{SEC23_INTRO}</p>
            <DataTable
              columns={[
                { key: "input", label: "Management review input" },
                { key: "examples", label: "Examples" },
              ]}
              rows={SEC23_REVIEW_INPUTS}
            />
            <p className="text-sm font-semibold text-[#111] mt-8 mb-2">Core Quality Objectives</p>
            <DataTable
              columns={[
                { key: "objective", label: "Core quality objective" },
                { key: "target", label: "Suggested target direction" },
              ]}
              rows={SEC23_CORE_OBJECTIVES}
            />
          </section>

          {/* 24 — Category-Specific Control Plans */}
          <section id="qm-categories" data-qm-section className="mb-12 scroll-mt-6">
            <SectionHead number="24" title="Category-Specific Minimum Control Plans" />
            <p className="text-sm text-gray-500 leading-relaxed mb-2">{SEC24_INTRO}</p>
            <DataTable
              columns={[
                { key: "category", label: "Category" },
                { key: "controls", label: "Minimum CTQs / controls" },
              ]}
              rows={SEC24_CATEGORIES}
            />
          </section>

          {/* 25 — Forms & Mandatory Records */}
          <section id="qm-forms" data-qm-section className="mb-12 scroll-mt-6">
            <SectionHead number="25" title="Forms, Checklists & Mandatory Records" />
            <DataTable
              columns={[
                { key: "formId", label: "Form ID" },
                { key: "record", label: "Controlled record" },
              ]}
              rows={SEC25_FORMS}
            />
            <p className="text-sm font-semibold text-[#111] mt-8 mb-3">Minimum Inspection Report Fields</p>
            <BulletList items={SEC25_REPORT_FIELDS} />
          </section>

          {/* 26 — Implementation Roadmap */}
          <section id="qm-roadmap" data-qm-section className="mb-12 scroll-mt-6">
            <SectionHead number="26" title="Implementation Roadmap & Audit Readiness" />
            <DataTable
              columns={[
                { key: "phase", label: "Phase" },
                { key: "timing", label: "Timing" },
                { key: "actions", label: "Priority actions" },
              ]}
              rows={SEC26_PHASES}
            />
            <p className="text-sm font-semibold text-[#111] mt-8 mb-3">Internal Audit Programme</p>
            <BulletList items={SEC26_AUDIT_ITEMS} />
          </section>

          {/* Document footer */}
          <div className="flex items-center gap-2 pt-8 mt-12 border-t border-gray-200
                          text-[11px] text-gray-400 flex-wrap">
            <span>TWIF-QMS-QM-2025-001-REV00</span>
            <span>·</span>
            <span>Twif Technologies</span>
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

// Generic responsive table: full table on desktop, stacked cards on mobile.
function DataTable({ columns, rows }) {
  return (
    <>
      <div className="hidden md:block overflow-x-auto mt-4 border border-gray-200 rounded-xl">
        <table className="w-full text-sm border-collapse min-w-[640px]">
          <thead className="bg-gray-50">
            <tr>
              {columns.map((col) => (
                <th key={col.key}
                    className="text-left text-[11px] font-semibold uppercase tracking-wide
                               text-gray-400 px-4 py-3 border-b border-gray-200">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}
                  className="hover:bg-gray-50 border-b border-gray-100 last:border-b-0
                             transition-colors">
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3 text-[#333] leading-snug align-top">
                    {row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-3 mt-4 md:hidden">
        {rows.map((row, i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-lg px-4 py-3">
            {columns.map((col, ci) => (
              <div key={col.key} className={ci > 0 ? "mt-2 pt-2 border-t border-gray-100" : ""}>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-0.5">
                  {col.label}
                </p>
                <p className="text-sm text-[#333] leading-snug">{row[col.key]}</p>
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

function BulletList({ items }) {
  return (
    <ul className="space-y-2 max-w-2xl">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5 text-sm text-gray-500 leading-relaxed">
          <span className="text-gray-300 mt-1.5 text-[6px]">●</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function NumberedList({ items }) {
  return (
    <ol className="space-y-2.5 max-w-2xl">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3 text-sm text-gray-500 leading-relaxed">
          <StepBubble n={i + 1} />
          <span className="pt-0.5">{item}</span>
        </li>
      ))}
    </ol>
  );
}

function Callout({ children }) {
  return (
    <blockquote className="border-l-[3px] border-[#1a1a1a] bg-gray-100 rounded-r-lg
                           px-6 py-5 max-w-2xl space-y-3">
      {children}
    </blockquote>
  );
}