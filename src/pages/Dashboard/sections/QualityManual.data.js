// ── Content for Quality Manual sections 3-26 ────────────────────────────────
// Source: Twif End-to-End Quality Management System Manual (Twif-QMS-MAN-001, v0.1)
// Sections 1 (Purpose) and 2 (Scope) are defined directly in QualityManual.jsx
// and are not affected by this file.

// 3 — Quality Policy & Principles ────────────────────────────────────────────

export const SEC03_POLICY_STATEMENT =
  "Twif is committed to delivering safe, legal, conforming and commercially reliable " +
  "products through prevention-led quality planning, transparent supplier governance, " +
  "technically competent inspection, verified data and rapid corrective action. Quality " +
  "shall be designed into the product and process; it shall not be inspected in at the end.";

export const SEC03_PRINCIPLES = [
  "No production without approved specifications and an approved reference sample or documented buyer waiver.",
  "No unauthorized change to material, construction, dimensions, colour, finish, packaging, factory, subcontractor or process.",
  "No shipment release where a critical defect, legal non-compliance, unresolved safety risk, falsified record or unauthorized subcontracting is identified.",
  "Quality personnel have independent stop-ship authority and shall not be pressured to pass nonconforming goods.",
  "Evidence must be contemporaneous, traceable and verifiable; retrospective reconstruction of inspection records is prohibited.",
  "Buyer approval does not transfer the supplier's or Twif's responsibility for product safety, legality and conformity.",
];

// 4 — Risk-Based Quality Planning ────────────────────────────────────────────

export const SEC04_INTRO =
  "Every new SKU and material/process change shall undergo documented risk classification " +
  "before sample approval and production. Risk determines testing, inspection frequency, " +
  "technical review, sample retention and escalation requirements.";

export const SEC04_RISK_CLASSES = [
  { riskClass: "Class A – High", triggers: "Electrical, candles/open flame, children, food contact, load-bearing furniture, glass under stress, chemical/cosmetic, sharp points, high liability, new unproven process", controls: "Formal design risk assessment; compliance matrix; accredited testing; pilot run; enhanced in-line; final inspection by senior QA; retained samples" },
  { riskClass: "Class B – Medium", triggers: "Functional homeware, furniture, lighting components, fragile articles, dyed/printed textiles, outdoor use, complex assembly", controls: "Documented risk review; defined test plan; PPM; in-line and final inspection" },
  { riskClass: "Class C – Standard", triggers: "Low-risk decorative items with stable process and proven supplier", controls: "Specification review; sample approval; routine process control and final inspection" },
  { riskClass: "Class D – Watch / Escalated", triggers: "Any product or supplier under CAPA, complaint, repeated failure, unauthorized change or late quality discovery", controls: "100% supplier screening as directed; tightened inspection; leadership review; enhanced evidence" },
];

export const SEC04_CONTROL_PLAN_INTRO =
  "A Product Quality Plan (PQP) shall be created at SKU, collection or technically similar " +
  "family level. It shall identify CTQ characteristics, specifications, test methods, " +
  "acceptance limits, inspection points, sample size, responsible owner, records and reaction plan.";

export const SEC04_CONTROL_PLAN_ELEMENTS = [
  { element: "CTQ / characteristic", content: "Safety, legal, function, performance, dimensions, appearance, colour, finish, workmanship, packaging and labelling characteristics" },
  { element: "Specification / tolerance", content: "Nominal value, permitted tolerance, reference standard, approved sample or boundary sample" },
  { element: "Method / equipment", content: "Test or inspection method, gauge, fixture, visual standard and environmental conditions" },
  { element: "Frequency / sample", content: "First-off, hourly, per batch, per shift, per lot, 100%, AQL or buyer-specific requirement" },
  { element: "Reaction plan", content: "Stop process, segregate, inform, correct, revalidate, re-inspect and document disposition" },
];

// 5 — Customer Requirements & Contract Review ────────────────────────────────

export const SEC05_INTRO =
  "No development or order shall proceed on assumptions. The account team shall convert all " +
  "buyer inputs into a controlled Requirement Intake and Contract Review record.";

export const SEC05_CONTRACT_ITEMS = [
  "Buyer brief, drawings, images, samples, target cost, MOQ, delivery, destination and intended use.",
  "Applicable buyer manual, restricted-substance list, packaging guide, labelling requirements and inspection protocol.",
  "Market destination and regulatory obligations.",
  "Intended consumer, foreseeable use/misuse, indoor/outdoor conditions, load, heat, moisture, food contact, children or pet interaction.",
  "Required certifications, third-party tests, factory audits and social/environmental standards.",
  "Golden sample ownership, approval route, approval authority and digital approval evidence.",
  "Commercial and technical feasibility risks, unresolved assumptions and written clarifications.",
];

export const SEC05_ORDER_REVIEW =
  "Upon receipt of PO, Merchandising, Supplier and Quality shall verify style, version, " +
  "quantity, price-independent technical data, EWD/ex-factory date, ship mode, destination, " +
  "testing validity, sample status, packaging, labels and inspection requirements. Any " +
  "inconsistency shall be raised before PO acceptance or material commitment. Acceptance of " +
  "a PO does not authorize deviation from approved technical requirements.";

// 6 — Product Development QA ─────────────────────────────────────────────────

export const SEC06_DESIGN_INPUTS =
  "PD shall open a SKU development record and assign a unique style/SKU identifier. Design " +
  "inputs shall be measurable and include dimensions, materials, construction, function, " +
  "finish, colour, tolerances, performance, safety, packaging, target market and applicable standards.";

export const SEC06_DESIGN_REVIEW_ITEMS = [
  "Material suitability and compatibility, including corrosion, staining, migration, odour, fading, shrinkage, cracking, moisture and temperature response.",
  "Stability, load path, tip-over, sharp edge/point, pinch, entrapment, small-part and breakage hazards.",
  "Process capability and repeatability at the proposed supplier.",
  "Ease of assembly, consumer error potential and clarity of instructions.",
  "Packaging protection and distribution hazards.",
  "Repairability, replacement parts and foreseeable after-sales failure modes.",
  "Sustainability claims and chain-of-custody evidence where applicable.",
];

export const SEC06_RISK_ASSESSMENT_INTRO =
  "For Class A and B products, Quality shall facilitate a DFMEA-style risk review. Severity, " +
  "occurrence and detectability shall be scored using the approved Twif scale. High-severity " +
  "hazards shall not be accepted solely because occurrence is considered low. The preferred " +
  "hierarchy is elimination by design, engineering control, protective measure, then warning/instruction.";

export const SEC06_DFMEA_COLUMNS = [
  { key: "item", label: "Risk item" },
  { key: "hazard", label: "Failure / hazard" },
  { key: "effect", label: "Effect" },
  { key: "cause", label: "Cause" },
  { key: "control", label: "Existing control" },
  { key: "s", label: "S" },
  { key: "o", label: "O" },
  { key: "d", label: "D" },
  { key: "action", label: "Action / owner / date" },
];

export const SEC06_DFMEA_ROWS = [
  { item: "Example", hazard: "Glass shade detaches", effect: "Injury / breakage", cause: "Insufficient retention", control: "Prototype pull test", s: "9", o: "3", d: "5", action: "Redesign fixing; validate test; PD / date" },
];

export const SEC06_GATE_REVIEWS = [
  { gate: "G0 – Brief accepted", criteria: "Complete requirement intake; market and intended use confirmed; owner assigned" },
  { gate: "G1 – Concept feasible", criteria: "Risk screen complete; supplier capability checked; preliminary material/process agreed" },
  { gate: "G2 – Prototype accepted", criteria: "Core construction and function validated; major safety risks controlled" },
  { gate: "G3 – Approval sample accepted", criteria: "All buyer comments closed; specification and BOM controlled; testing plan confirmed" },
  { gate: "G4 – Pre-production release", criteria: "PPM complete; raw materials approved; golden sample and packaging standards available" },
  { gate: "G5 – Shipment release", criteria: "Testing valid; inspections passed; documents complete; quality-release status recorded" },
];

// 7 — Sample Development & Approval ──────────────────────────────────────────

export const SEC07_INTRO =
  "Every sample shall be uniquely identified and traceable to supplier, date, version, " +
  "materials and approval stage. Unlabelled samples shall not be used as production standards.";

export const SEC07_SAMPLE_TYPES = [
  { type: "Concept / mock-up", purpose: "Validate proportion, construction idea and feasibility", requirements: "May use substitute materials only if clearly identified" },
  { type: "Prototype / development sample", purpose: "Resolve construction, function and quality risks", requirements: "Actual process preferred; all deviations documented" },
  { type: "Colour / finish / material swatch", purpose: "Approve colour, finish, texture, hand-feel or material", requirements: "Controlled lighting/condition; signed and dated" },
  { type: "Approval / fit sample", purpose: "Buyer approval of complete product", requirements: "Production-intent materials and construction; measurements recorded" },
  { type: "Pre-production sample (PPS)", purpose: "Demonstrate final production standard", requirements: "Made at production site using bulk-intent materials, tooling, labels and packaging" },
  { type: "Top-of-production (TOP)", purpose: "Verify first bulk output", requirements: "Selected from actual production; compared with PPS/golden sample" },
  { type: "Shipment / retention sample", purpose: "Reference after shipment", requirements: "Sealed, labelled and retained per risk/contract" },
];

export const SEC07_REVIEW_PROTOCOL = [
  "Confirm sample identity, stage and version before review.",
  "Inspect against the latest controlled specification and prior comments.",
  "Record all dimensions, test outcomes, appearance comments and photographs.",
  "Separate mandatory corrections from optional observations.",
  "Use objective language; avoid “improve quality” without defining the required change.",
  "Assign each comment an owner, due date and closure evidence.",
  "Do not approve “subject to correction” unless the correction is objectively minor and verified before production.",
  "Any approved deviation must state quantity, duration, affected market and approver.",
];

// 8 — Technical Files & Golden Samples ───────────────────────────────────────

export const SEC08_INTRO =
  "The Technical Product File is the single source of truth. It shall be complete before " +
  "bulk production and maintained under revision control.";

export const SEC08_TECH_FILE_CONTENT = [
  { content: "Identification", examples: "Buyer, brand, SKU, description, supplier, factory, country of origin, destination" },
  { content: "Specification", examples: "Dimensions/tolerances, materials, BOM, construction, colour/finish, workmanship, function, assembly" },
  { content: "Drawings / imagery", examples: "Technical drawing, approved reference images, label placement and packaging layout" },
  { content: "Compliance", examples: "Applicable law/standard matrix, risk assessment, tests, certificates, declarations" },
  { content: "Samples", examples: "Approval record, PPS, golden sample photographs, seal numbers and location" },
  { content: "Production controls", examples: "Process flow, control plan, PPM, inspection reports, defect standard" },
  { content: "Change history", examples: "Revision number, change description, reason, approver and effective lot" },
];

export const SEC08_GOLDEN_SAMPLE = [
  "Twif and supplier shall maintain matched approved samples where practical.",
  "Samples shall be sealed or tamper-evident, signed/dated and labelled with SKU, revision and approval authority.",
  "A photographic golden-sample pack shall capture front/back/side, critical details, colour under controlled light, labels and packaging.",
  "Deteriorating samples such as natural materials, fragrances, colours or soft goods shall be periodically revalidated.",
  "When physical samples conflict with controlled written specifications, Quality shall stop and obtain written clarification.",
];

// 9 — Supplier Qualification & Onboarding ────────────────────────────────────

export const SEC09_INTRO =
  "Supplier nomination shall be based on verified capability, not sample appearance or " +
  "commercial attractiveness alone. Twif shall know the actual production site and any " +
  "subcontracted processes.";

export const SEC09_QUALIFICATION_DOMAINS = [
  { domain: "Legal and identity", evidence: "Entity registration, factory address, ownership, licences and authorized contacts" },
  { domain: "Technical capability", evidence: "Processes, machinery, tooling, capacity, engineering and category experience" },
  { domain: "Quality system", evidence: "Incoming, in-process and final controls; records; calibration; CAPA; traceability" },
  { domain: "Compliance", evidence: "Applicable certifications, testing history, restricted substances, permits and responsible sourcing" },
  { domain: "Capacity and planning", evidence: "Capacity by process, bottleneck analysis, seasonality, lead time and contingency" },
  { domain: "Subcontracting", evidence: "Declared subcontractors, processes, addresses and approval controls" },
  { domain: "Ethical / social / environmental", evidence: "Buyer-required audits, corrective actions and licences" },
  { domain: "Performance history", evidence: "Defect, delivery, complaint, audit and responsiveness data" },
];

export const SEC09_SUPPLIER_STATUS = [
  { status: "Approved", meaning: "Qualification complete for defined categories/process/site", restrictions: "Normal allocation subject to performance" },
  { status: "Conditional", meaning: "Gaps accepted with time-bound CAPA", restrictions: "Limited orders; enhanced monitoring; no critical process outsourcing" },
  { status: "Developmental", meaning: "Pilot-only supplier", restrictions: "Prototype/pilot quantities; senior approval" },
  { status: "On Watch", meaning: "Performance deterioration or open major CAPA", restrictions: "Tightened inspection; allocation review" },
  { status: "Suspended", meaning: "Critical failure, fraud, unsafe product, unauthorized subcontracting or repeated major failure", restrictions: "No new orders; shipment hold until formal reinstatement" },
  { status: "Disqualified", meaning: "Unacceptable risk or unresolved systemic failure", restrictions: "No business without MD/COO and Quality re-approval" },
];

// 10 — Pre-Production Readiness (PPM) ────────────────────────────────────────

export const SEC10_INTRO =
  "A Pre-Production Meeting (PPM) is mandatory for new SKUs, new suppliers, significant " +
  "changes, high-risk products, repeat failures and buyer-required programs. It shall occur " +
  "before bulk cutting, forming, finishing or assembly.";

export const SEC10_PPM_AGENDA = [
  { agenda: "PO and critical path", evidence: "Quantities, EWD, inspection windows, shipment mode and milestones confirmed" },
  { agenda: "Approved standard", evidence: "PPS/golden sample, specification revision and buyer comments available" },
  { agenda: "Materials / components", evidence: "Approved sources, status, lot/batch, test evidence and shortage risk" },
  { agenda: "Process flow", evidence: "Operations, subcontractors, bottlenecks, controls and checkpoints mapped" },
  { agenda: "CTQs and defects", evidence: "Critical measurements, boundary samples, defect classification and reaction plan" },
  { agenda: "Tooling / gauges", evidence: "Availability, condition, calibration and work instructions" },
  { agenda: "Packaging / labels", evidence: "Approved artwork, barcode verification, pack-out and drop/transport needs" },
  { agenda: "Testing", evidence: "Required tests, sample plan, lab booking and validity" },
  { agenda: "Capacity / manpower", evidence: "Line plan, skills, shifts, daily targets and contingency" },
  { agenda: "Change / risk", evidence: "All deviations, open risks and decisions recorded" },
];

export const SEC10_CLOSING =
  "The PPM record shall identify open actions, responsible person and closure date. " +
  "Production release is conditional until all critical actions are closed. Where production " +
  "begins at supplier risk before formal release, Twif bears no acceptance obligation for " +
  "resulting nonconformity.";

// 11 — Raw Material & Component QC ───────────────────────────────────────────

export const SEC11_INTRO =
  "Suppliers shall establish incoming inspection based on risk and supplier history. Twif may " +
  "independently verify high-risk or critical materials before production.";

export const SEC11_ITEMS = [
  "Match purchase specification, approved swatch/component and supplier certificate.",
  "Verify quantity, identity, batch/lot, dimensions, colour, composition, finish, moisture, defects and storage condition.",
  "Segregate accepted, rejected, pending-test and concession material with visible status.",
  "Maintain lot traceability from incoming receipt to finished goods.",
  "Apply FIFO/FEFO where shelf life, finish age, chemical life or colour-lot continuity matters.",
  "Prevent mix-up, contamination, rust, moisture, pest, odour, UV, heat and physical damage.",
  "Do not mix material lots where shade, composition, strength or performance may vary without approval and validation.",
];

export const SEC11_MATERIAL_CONTROLS = [
  { family: "Wood / natural fibre", controls: "Species, moisture, knots, cracks, infestation, treatment, legality/traceability" },
  { family: "Metal", controls: "Grade, thickness, hardness where needed, rust, weldability, plating base and certificates" },
  { family: "Glass", controls: "Composition/type, thickness, stress, edge quality, bubbles/inclusions, colour batch" },
  { family: "Ceramic / stone", controls: "Body, glaze, firing defects, cracks, porosity, food-contact status, colour batch" },
  { family: "Textile / leather", controls: "Composition, GSM/weight, width, colour, shade continuity, fastness, shrinkage, defects, restricted substances" },
  { family: "Electrical parts", controls: "Rating, approvals, wire/gauge, insulation, polarity, strain relief, component traceability" },
  { family: "Chemicals / coatings / adhesives", controls: "Identity, batch, COA/SDS, shelf life, storage, mix ratio and restricted substances" },
  { family: "Packaging", controls: "Board grade, burst/ECT, dimensions, print, barcode, inserts and moisture condition" },
];

// 12 — Production QC & In-Line Inspection ────────────────────────────────────

export const SEC12_PROCESS_CONTROL_INTRO =
  "The supplier shall not rely on final sorting. Each process shall have defined first-piece " +
  "approval, operator self-check, line QC, patrol inspection, defect segregation and reaction plan.";

export const SEC12_PROCESS_CONTROL_ITEMS = [
  "First-off/first-piece approval at start-up, after tool change, material lot change, shift change or process adjustment.",
  "Line controls at a frequency sufficient to detect drift before significant quantity is produced.",
  "Separate repairable and non-repairable defects; prevent rejected parts re-entering the line without authorization.",
  "Record actual measurements, not only “OK”.",
  "Monitor process yield, rework rate, defect Pareto and repeat defects by operation.",
  "Use visual standards and limit samples at the workstation.",
  "Stop production when a critical defect or systematic major defect is detected.",
];

export const SEC12_INLINE_INTRO =
  "Twif in-line inspection is a preventive intervention normally conducted when 10-30% of the " +
  "lot is complete, or earlier for high-risk/new products. It shall assess whether the " +
  "process can deliver conforming output by the required date.";

export const SEC12_INLINE_AREAS = [
  { area: "Readiness", checks: "Approved standards, materials, tooling, line setup, operator instructions and QC presence" },
  { area: "Production status", checks: "Quantity completed/WIP/not started; stage by SKU; actual versus plan" },
  { area: "Process verification", checks: "Critical operations, first-piece records, measurement frequency and reaction to defects" },
  { area: "Product verification", checks: "Random sample workmanship, dimensions, function, colour/finish and safety features" },
  { area: "Traceability", checks: "Material lots, production date/line/shift, labels and subcontractor records" },
  { area: "Quality data", checks: "Defect/rework rate, internal audit, rejection segregation and corrective action" },
  { area: "Delivery risk", checks: "Capacity, bottlenecks, material shortages, testing/packaging readiness and recovery plan" },
];

export const SEC12_CLOSING =
  "The report shall quantify risk: units complete, pass rate, defect counts, projected " +
  "completion, critical path and actions with owner/date. Statements such as “production " +
  "is running” or “quality will be maintained” are not acceptable evidence.";

// 13 — Midline Inspection ─────────────────────────────────────────────────────

export const SEC13_INTRO =
  "Following a successful In-Line Inspection, Twif shall conduct a Mid-Line Inspection when " +
  "approximately 30-40% of the order has been completely packed into shippable export " +
  "cartons. The objective is to verify that the finished products are packed correctly and " +
  "are ready for safe transportation before full production is completed.";

export const SEC13_CHECKS = [
  { area: "Packing Verification", checks: "Correct product, quantity, assortment, labels, barcodes, carton markings and packing method as per approved specifications" },
  { area: "Product Verification", checks: "Workmanship, dimensions, appearance, functionality and compliance with approved standards" },
  { area: "Packaging Quality", checks: "Inner packing, protective materials, carton strength, sealing method and export packing requirements" },
  { area: "Transit Safety", checks: "Perform drop test and other applicable transit simulation checks to verify that packed goods can withstand normal transportation and handling" },
  { area: "Traceability", checks: "Production date, batch/lot number, carton identification and packing records" },
  { area: "Quality Status", checks: "Review defects, rework, packing errors and effectiveness of corrective actions" },
  { area: "Shipment Readiness", checks: "Assess production progress, packed quantity, balance quantity and readiness for Final Inspection" },
];

export const SEC13_CLOSING =
  "If the Mid-Line Inspection is satisfactory, production and packing shall continue, and the " +
  "shipment shall proceed to Final Inspection, which is conducted when 100% of the goods are " +
  "packed and at least 80% (or as per buyer requirement) of the shipment quantity is available " +
  "for inspection. Any significant quality or packing issues identified during the Mid-Line " +
  "Inspection shall be corrected and verified before the Final Inspection is scheduled.";

// 14 — Final Random Inspection & Release ─────────────────────────────────────

export const SEC14_INTRO =
  "Final inspection shall be performed only when the lot is sufficiently complete, packed and " +
  "presented as a defined lot. Unless the buyer specifies otherwise, at least 100% production " +
  "and 80% final packing shall be complete; deviations require written Quality approval and " +
  "shall be stated in the report.";

export const SEC14_LOT_DEFINITION = [
  "One SKU/style, colour/finish, factory, production process, and reasonably uniform production period.",
  "Mixed lots may be inspected only with documented stratification and buyer/Quality acceptance.",
  "Lot quantity shall reconcile to PO, production records and physical goods.",
  "Inspectors shall select cartons and units randomly across locations, stacks, production dates and packing sequence. Factory-selected samples are prohibited.",
];

export const SEC14_AQL_INTRO =
  "Twif shall use the current approved acceptance-sampling standard, buyer protocol or " +
  "stricter risk-based plan. As of this draft, ISO 2859-1:2026 is the current ISO edition for " +
  "attribute sampling. The default inspection level is General Level II unless buyer or " +
  "Quality directs otherwise. AQL (General Inspection Level II at 2.5 & 4.0% AQL) is not a " +
  "quality target and does not permit intentional production of defects.";

export const SEC14_DEFECT_CLASSES = [
  { defectClass: "Critical", approach: "Ac 0 / Re 1; any critical defect fails the lot", examples: "Safety hazard, legal non-compliance, sharp dangerous edge, electric shock/fire risk, banned substance, falsified label, wrong product creating hazard" },
  { defectClass: "Major", approach: "AQL 2.5 unless buyer/category requires stricter", examples: "Function failure, material/construction deviation, significant appearance defect, incorrect dimension affecting use, missing part, unstable furniture, poor packaging likely to damage" },
  { defectClass: "Minor", approach: "AQL 4.0 unless buyer/category requires stricter", examples: "Small cosmetic/workmanship variation not affecting function, safety or saleability" },
];

export const SEC14_ESCALATION_NOTE =
  "For high-risk categories, escalated suppliers or repeated failures, Quality may require " +
  "tightened inspection, additional functional sampling, 100% screening by the supplier, or " +
  "independent re-inspection.";

export const SEC14_SEQUENCE = [
  "Opening meeting: verify PO, lot, specification, approved sample, tests and readiness.",
  "Warehouse walk: understand lot segregation, carton markings, production dates and random access.",
  "Quantity verification: count cartons/units and reconcile packed/WIP status.",
  "Random sample selection: inspector selects and marks cartons/units.",
  "Product identity and assortment verification.",
  "Workmanship and visual examination under suitable light.",
  "Dimension, weight, colour/finish and construction verification.",
  "Functional, safety and performance checks per control plan.",
  "Packaging, label, barcode, carton and drop/transport checks.",
  "Defect classification and cumulative AQL decision.",
  "Closing meeting: communicate factual findings; no negotiation of defect count.",
  "Report issuance with photographs, measurements, sample size, defect table, result and reservations.",
];

export const SEC14_RESULTS = [
  { result: "PASS", definition: "Sample within acceptance criteria and no unresolved critical/legal issue", release: "Quality release may be issued subject to document/test completion" },
  { result: "FAIL", definition: "Any critical defect or defect count exceeds rejection number; major requirement not met", release: "No shipment; supplier submits containment and corrective action; re-inspection required unless buyer decides otherwise" },
  { result: "PENDING / HOLD", definition: "Insufficient packing, missing test/document, unresolved identity/quantity, blocked access or uncertain compliance", release: "No shipment until evidence reviewed and formal disposition recorded" },
  { result: "PASS WITH OBSERVATION", definition: "Only where buyer/QMS permits and observation does not constitute nonconformance", release: "Observation tracked; not a substitute for concession" },
];

// 15 — Nonconforming Product & Concession ────────────────────────────────────

export const SEC15_ITEMS = [
  "Immediately identify and segregate nonconforming material/product to prevent unintended use or shipment.",
  "Record SKU, quantity, defect, location, date, lot and status.",
  "Disposition options: rework, repair, regrade, use-as-is by concession, return to supplier, scrap or destroy.",
  "Rework instructions shall define method, acceptance criteria, responsible person and re-inspection.",
  "Reworked product shall be fully revalidated for affected and collateral characteristics.",
  "A concession must be written, specific, time/quantity limited and approved by authorized buyer/Twif personnel before shipment.",
  "No supplier or merchant may self-approve a deviation from safety, law, buyer requirement or controlled specification.",
  "Scrap/destruction shall be evidenced where brand protection or safety requires it.",
];

export const SEC15_CONCESSION_CONTENT = [
  { field: "Identification", detail: "Buyer, PO, SKU, lot and affected quantity" },
  { field: "Deviation", detail: "Exact requirement versus actual condition; photographs and measurements" },
  { field: "Risk", detail: "Safety, legal, function, aesthetics, packaging, customer and precedent impact" },
  { field: "Cause / containment", detail: "Why it occurred; how remaining production is controlled" },
  { field: "Proposal", detail: "Use-as-is, repair, sorting, discount or replacement; traceability" },
  { field: "Approvals", detail: "Supplier, Twif Quality, account leadership and buyer as required" },
];

// 16 — CAPA & Root Cause Analysis ─────────────────────────────────────────────

export const SEC16_INTRO =
  "CAPA is required for critical defects, inspection failures, repeated major defects, " +
  "customer complaints, unauthorized changes, audit major findings, testing failures, " +
  "falsification, recurring delivery-quality interaction or any systemic risk.";

export const SEC16_STAGES = [
  { stage: "Immediate notification", requirement: "Facts, affected SKUs/lots/shipments and initial risk", timing: "Same business day for critical/safety; within 24 hours otherwise" },
  { stage: "Containment", requirement: "Stop, segregate, screen, hold shipments, protect customer", timing: "Immediate / within 24 hours" },
  { stage: "Root cause", requirement: "Evidence-based cause using 5 Why, fishbone, fault tree or process analysis", timing: "Normally within 5 working days" },
  { stage: "Corrective action", requirement: "Remove root cause; update process, tooling, training, supplier or design", timing: "Committed dates and owners" },
  { stage: "Verification", requirement: "Evidence action implemented and effective across affected scope", timing: "Before release / within agreed period" },
  { stage: "Closure", requirement: "Quality confirms no recurrence trend and records are complete", timing: "Only by authorized Quality personnel" },
];

export const SEC16_NOTES = [
  "“Operator mistake,” “carelessness,” “rush order,” “manual error” and “will be careful” are not acceptable root causes without identifying the system condition that allowed the error.",
  "CAPA shall address occurrence, detection and systemic escape.",
  "Effectiveness shall be verified through data, audit, inspection or subsequent lots, not only a photograph or promise.",
  "Repeated recurrence after CAPA triggers supplier escalation and possible suspension.",
];

// 17 — Testing & Regulatory Compliance ───────────────────────────────────────

export const SEC17_INTRO =
  "Twif shall maintain a market- and category-specific compliance matrix. Product safety and " +
  "legal requirements shall be identified at design stage and verified before shipment. " +
  "Regulatory compliance is not limited to final laboratory testing; it includes design, " +
  "materials, traceability, warnings, technical documentation and post-market obligations.";

export const SEC17_CONTROLS = [
  { control: "Applicable requirements", requirement: "Identify destination law, harmonized/mandatory standards, buyer RSL and certification needs" },
  { control: "Test plan", requirement: "Define test, standard/method, sample source, quantity, lab, stage and validity" },
  { control: "Laboratory", requirement: "Use buyer-approved / accredited lab where required; verify scope and report authenticity" },
  { control: "Sample integrity", requirement: "Quality/Twif selects or witnesses sample where risk warrants; seal and document chain of custody" },
  { control: "Report review", requirement: "Match SKU, materials, colours, construction, factory, date, standard, result and validity" },
  { control: "Change impact", requirement: "Material, supplier, colour, coating, dimensions, electrical component, construction or process changes require test-impact review" },
  { control: "Technical documentation", requirement: "Maintain risk assessment, reports, declarations, labels, traceability and responsible economic-operator information as applicable" },
  { control: "Failure management", requirement: "Hold affected lots, investigate scope, correct, retest and notify buyer where required" },
];

export const SEC17_CLOSING =
  "For EU consumer products, the system shall support the General Product Safety Regulation, " +
  "including safety assessment, traceability, technical information and economic-operator " +
  "obligations as applicable. For the United States, the importer/manufacturer remains " +
  "responsible for applicable CPSC testing and certification; Twif shall provide accurate and " +
  "complete technical evidence to support those obligations.";

// 18 — Calibration & Lab Equipment ───────────────────────────────────────────

export const SEC18_ITEMS = [
  "Maintain a master list of measuring and test equipment with unique ID, location, range, resolution, calibration frequency and status.",
  "Calibrate against traceable standards at defined intervals and after damage, repair or suspected drift.",
  "Verify equipment before use; do not use expired, damaged or unsuitable gauges.",
  "Protect equipment from adjustment, shock, corrosion and environmental damage.",
  "Where equipment is found out of tolerance, assess validity of prior results and identify affected lots.",
  "Control inspection lighting, temperature/humidity or conditioning where results are sensitive.",
  "Supplier-owned equipment used for Twif inspection must be verified and suitable; inspector independence is not replaced by factory readings.",
];

export const SEC18_EQUIPMENT = [
  { equipment: "Tape/ruler/caliper", control: "Accuracy, zero check, suitable range, calibration/verification" },
  { equipment: "Weighing scale", control: "Capacity, resolution, test weights and level surface" },
  { equipment: "Moisture meter", control: "Material-specific setting, reference check and environmental condition" },
  { equipment: "Torque/pull/load fixture", control: "Method, calibration, secure setup and safety precautions" },
  { equipment: "Barcode scanner", control: "Symbology and data verification against master" },
  { equipment: "Electrical tester", control: "Appropriate category/range, leads, calibration and competent user" },
  { equipment: "Colour/light booth", control: "Lamp type/hours, viewing geometry and approved standard" },
];

// 19 — Quality Records & Change Control ──────────────────────────────────────

export const SEC19_INTEGRITY = [
  "Records shall be attributable, legible, contemporaneous, original or verified copy, accurate, complete, consistent, enduring and available.",
  "Photographs shall show scale/context and be linked to SKU, lot and inspection.",
  "Corrections shall preserve the original entry, identify the person/date and reason; deletion or silent overwriting is prohibited.",
  "Electronic access shall be role-based with backup and audit trail where available.",
  "Inspection reports shall not be altered after issue without controlled revision and reason.",
];

export const SEC19_TRACEABILITY =
  "Traceability depth shall be proportionate to risk and buyer/legal requirements. At " +
  "minimum, Twif shall be able to connect buyer PO and SKU to supplier/factory, production " +
  "lot/date, critical material/component batch where applicable, inspection, tests and " +
  "shipment/container.";

export const SEC19_CHANGE_CONTROL = [
  { change: "Material / component", examples: "Composition, grade, supplier, coating, colourant, electrical component, hardware" },
  { change: "Construction / design", examples: "Dimensions, thickness, joinery, stitch, weld, load path, assembly" },
  { change: "Process / tooling", examples: "Mould, jig, kiln, plating line, dyeing, finishing, subcontractor" },
  { change: "Factory / location", examples: "Production site, critical process location or country of origin" },
  { change: "Packaging / labels", examples: "Artwork, barcode, warning, pack configuration, carton grade" },
  { change: "Specification / test", examples: "Tolerance, method, standard, approval sample or test coverage" },
];

export const SEC19_CLOSING =
  "No change shall be implemented until impact is assessed by PD, Quality, Compliance and " +
  "account owner as applicable, required samples/tests are approved, documents are revised " +
  "and the effective lot is defined.";

// 20 — Supplier Performance & Escalation ─────────────────────────────────────

export const SEC20_OBJECTIVES = [
  { objective: "Final inspection pass rate", definition: "First-time passes / inspections; exclude buyer-approved cancellations" },
  { objective: "Defect rate", definition: "Critical, major and minor defects by inspected units and defect type" },
  { objective: "Customer complaint rate", definition: "Claims/returns attributable to supplier quality" },
  { objective: "CAPA closure", definition: "On-time, accepted and effective closure" },
  { objective: "Audit performance", definition: "Score and closure of major/critical findings" },
  { objective: "Testing compliance", definition: "Right-first-time reports and validity before shipment" },
  { objective: "Unauthorized change / subcontracting", definition: "Zero tolerance" },
  { objective: "Quality responsiveness", definition: "Timeliness and accuracy of disclosure, containment and evidence" },
];

export const SEC20_ESCALATION = [
  { level: "Level 0 – Normal", trigger: "Stable performance", controls: "Routine inspection and scorecard" },
  { level: "Level 1 – Alert", trigger: "Single failure or adverse trend", controls: "Written action, increased follow-up" },
  { level: "Level 2 – Watch", trigger: "Repeated failure, major CAPA or complaint", controls: "Tightened inspection, senior review, allocation restriction" },
  { level: "Level 3 – Probation", trigger: "Systemic failure, ineffective CAPA, serious audit issue", controls: "100% supplier screening, independent verification, no new development" },
  { level: "Level 4 – Suspension", trigger: "Critical safety/legal issue, falsification, unauthorized subcontracting, repeated severe failure", controls: "Stop shipment/new orders; executive and buyer review" },
  { level: "Level 5 – Exit", trigger: "Unacceptable unresolved risk", controls: "Disqualification and controlled transition" },
];

// 21 — Customer Complaints & Recall Readiness ────────────────────────────────

export const SEC21_INTRO =
  "All complaints and incidents shall be logged, risk-assessed, investigated and trended. " +
  "Safety-related information requires immediate escalation even if causality is not yet confirmed.";

export const SEC21_ITEMS = [
  "Record product, SKU, PO, shipment, consumer/customer description, photographs, date, geography, injury/property damage and available sample.",
  "Determine whether other units, lots, shipments, suppliers or markets may be affected.",
  "Preserve evidence and prevent destruction of returned product until authorized.",
  "Implement containment for open production, warehouse stock and in-transit goods.",
  "Notify buyer and leadership in accordance with severity and contractual/legal duties.",
  "Support regulatory reporting and recall decisions with accurate traceability and technical evidence.",
  "Conduct mock traceability/recall exercise at least annually for selected high-risk products.",
];

export const SEC21_SEVERITY = [
  { severity: "Critical / Incident", example: "Injury, fire, electric shock, choking, tip-over, chemical exposure, regulatory notice", escalation: "Immediate Director Quality, COO/MD and buyer; stop shipment and initiate incident team" },
  { severity: "Major", example: "Functional failure, widespread breakage, significant return trend", escalation: "Within 24 hours; containment and CAPA" },
  { severity: "Routine", example: "Isolated cosmetic or minor workmanship complaint", escalation: "Log, investigate proportionately and trend" },
];

// 22 — Training & Ethical Conduct ────────────────────────────────────────────

export const SEC22_ITEMS = [
  "Define competence criteria by category, inspection type, test method and risk.",
  "Inspectors shall be trained, observed and authorized before independent assignment.",
  "Maintain annual refresher, calibration and defect-classification alignment exercises.",
  "Use blind sample comparison and report-review audits to detect inconsistency.",
  "No inspector shall accept gifts, cash, travel, hospitality or benefit that could influence judgement.",
  "Any pressure, attempted bribery, record falsification or obstruction shall be reported immediately.",
  "Personnel may stop work where they reasonably believe product safety, legality or evidence integrity is at risk.",
];

export const SEC22_MODULES = [
  { module: "QMS fundamentals", coverage: "Independence, document control, nonconformance, CAPA and escalation" },
  { module: "Category technical", coverage: "Materials, construction, defects, processes and failure modes" },
  { module: "Inspection method", coverage: "Sampling, random selection, measurement, tests, defect classification and reporting" },
  { module: "Compliance", coverage: "Destination risks, labels, certificates, restricted substances and incident escalation" },
  { module: "Digital evidence", coverage: "Photos, report integrity, timestamps, audit trail and data security" },
  { module: "Behaviour", coverage: "Factory conduct, conflict management, anti-bribery and communication" },
];

// 23 — Management Review & KPIs ──────────────────────────────────────────────

export const SEC23_INTRO =
  "Leadership shall review QMS performance at least quarterly, with monthly operational " +
  "quality review for key accounts and suppliers.";

export const SEC23_REVIEW_INPUTS = [
  { input: "Customer performance", examples: "Complaints, returns, chargebacks, buyer scorecards and recurring themes" },
  { input: "Inspection data", examples: "Pass rate, first-time yield, defect Pareto, re-inspection and late failures" },
  { input: "Supplier performance", examples: "Watch/suspension status, audit score, CAPA, unauthorized changes" },
  { input: "Compliance", examples: "Test failures, expiring certifications, regulatory changes, incidents" },
  { input: "Process health", examples: "PPM completion, sample approval cycle, specification completeness, calibration" },
  { input: "Resources", examples: "Inspector capacity, competence, lab support, systems and travel coverage" },
  { input: "Risk and context", examples: "New countries/categories, climate/environmental disruption, logistics, legal change" },
  { input: "Improvement", examples: "Preventive projects, cost of poor quality and effectiveness" },
];

export const SEC23_CORE_OBJECTIVES = [
  { objective: "Critical defects / legal failures", target: "Zero" },
  { objective: "First-pass final inspection rate", target: "Improve by supplier/category; target set annually" },
  { objective: "Repeat defect recurrence", target: "Downward; zero recurrence after effective CAPA" },
  { objective: "CAPA on-time closure", target: "≥ 90% unless risk requires faster" },
  { objective: "PPM completion for mandatory programs", target: "100%" },
  { objective: "Technical file completeness before production", target: "100%" },
  { objective: "Social and Technical Compliance", target: "100% of factories need to be socially and technically compliant." },
  { objective: "Test reports available before shipment", target: "100%" },
  { objective: "Supplier unauthorized change", target: "Zero" },
  { objective: "Consumer Rating", target: "Average consumer rating needs to be ≥ 4.5%." },
  { objective: "Complaint closure time", target: "Risk-based target; trend downward" },
];

// 24 — Category-Specific Control Plans ───────────────────────────────────────

export const SEC24_INTRO =
  "The following controls are minimum prompts, not exhaustive specifications. Buyer " +
  "requirements, legislation and product-specific risk assessment determine the final plan.";

export const SEC24_CATEGORIES = [
  { category: "Furniture", controls: "Stability/tip-over; load/impact; joinery; hardware torque; dimensions; moisture; finish adhesion; sharp edges; assembly; anti-tip kit; packaging" },
  { category: "Lighting / electrical", controls: "Applicable certification; wiring and polarity; earthing; strain relief; component ratings; insulation; dielectric/ground continuity where applicable; heat; stability; labels/instructions" },
  { category: "Glass", controls: "Thickness; annealing/tempering as specified; edge quality; thermal/mechanical stress; inclusions; attachment security; fragility packaging" },
  { category: "Ceramics / food contact", controls: "Cracks/crazing; glaze; warpage; stability; capacity; thermal shock where applicable; lead/cadmium or other migration; dishwasher/microwave claims" },
  { category: "Metal décor", controls: "Material/thickness; weld/braze; burrs/sharp edges; corrosion; plating/coating; finish consistency; stability; load-bearing points" },
  { category: "Wood / natural materials", controls: "Species; legal sourcing; moisture; infestation; cracks/warping; joints; treatment; finish emissions where applicable; climate acclimatization" },
  { category: "Textiles / rugs", controls: "Fibre content; GSM/weight; dimensions; construction; shade; colourfastness; shrinkage; seam/tuft strength; flammability where applicable; needle control; labelling" },
  { category: "Leather goods", controls: "Leather type; thickness; colourfastness; rub; restricted substances; stitching; hardware; mould prevention; labelling claims" },
  { category: "Jewellery / accessories", controls: "Material claim; plating; nickel/restricted metals; small parts; sharp points; clasp function; chain strength; packaging/warnings" },
  { category: "Seasonal / candles", controls: "Flame stability; burn behaviour; heat transfer; wick; glass/container compatibility; fire warnings; decoration ignition; small parts" },
  { category: "Kitchen / bath", controls: "Food/water contact; corrosion; leak; capacity; thermal resistance; dishwasher claims; sharp edges; hygiene/cleanability; installation hardware" },
  { category: "Chemicals / cosmetics", controls: "GMP where applicable; formula and INCI; raw material COA; micro/challenge/stability; fill weight; packaging compatibility; batch coding; market notification/technical file" },
];

// 25 — Forms & Mandatory Records ─────────────────────────────────────────────

export const SEC25_FORMS = [
  { formId: "TWIF-QF-001", record: "Product Requirement Intake / Contract Review" },
  { formId: "TWIF-QF-002", record: "Product Risk Classification and DFMEA" },
  { formId: "TWIF-QF-003", record: "Sample Submission and Approval Record" },
  { formId: "TWIF-QF-004", record: "Technical Specification / BOM / Drawing Approval" },
  { formId: "TWIF-QF-005", record: "Supplier Qualification and Factory Capability Audit" },
  { formId: "TWIF-QF-006", record: "Product Quality Plan / Control Plan" },
  { formId: "TWIF-QF-007", record: "Pre-Production Meeting Record" },
  { formId: "TWIF-QF-008", record: "Incoming Material Inspection Record" },
  { formId: "TWIF-QF-009", record: "In-Line / DUPRO Inspection Report" },
  { formId: "TWIF-QF-010", record: "Final Random Inspection Report" },
  { formId: "TWIF-QF-011", record: "Nonconformance and Concession Request" },
  { formId: "TWIF-QF-012", record: "CAPA / 8D Report" },
  { formId: "TWIF-QF-013", record: "Test Plan and Compliance Matrix" },
  { formId: "TWIF-QF-014", record: "Calibration Register" },
  { formId: "TWIF-QF-015", record: "Supplier Scorecard and Escalation Record" },
  { formId: "TWIF-QF-016", record: "Complaint / Incident Report" },
  { formId: "TWIF-QF-017", record: "Change Control Request" },
  { formId: "TWIF-QF-018", record: "Shipment Quality Release / Hold Note" },
  { formId: "TWIF-QF-019", record: "Container Loading and Seal Verification" },
  { formId: "TWIF-QF-020", record: "Training and Inspector Authorization Record" },
];

export const SEC25_REPORT_FIELDS = [
  "Buyer, PO, SKU, supplier, factory address, inspection date and inspector.",
  "Lot quantity, completed/packed quantity, sample size, sampling level/AQL and readiness percentage.",
  "Specification revision, golden sample identification and test-report references.",
  "Random carton/unit selection method and carton numbers.",
  "Measured results for all CTQs and functional tests, with sample quantity.",
  "Defect table by unit, defect description, location, class and photograph reference.",
  "Packaging, labels, barcode scan, carton measurements/weights and ship marks.",
  "Result, reservations, pending items, factory acknowledgement and report issue/revision time.",
];

// 26 — Implementation Roadmap ────────────────────────────────────────────────

export const SEC26_PHASES = [
  { phase: "Phase 1 – Stabilize", timing: "0-30 days", actions: "Approve policy/authority; map current processes; issue mandatory forms; establish stop-ship rule; identify high-risk suppliers/SKUs; train core team" },
  { phase: "Phase 2 – Standardize", timing: "31-90 days", actions: "Complete supplier status; implement risk classification, PQP, PPM and report review; calibration register; CAPA governance; buyer requirement matrix" },
  { phase: "Phase 3 – Digitize", timing: "3-6 months", actions: "Integrate QMS into buyer/merchant portal; controlled specs; mobile inspection; dashboards; audit trail; supplier CAPA workflow" },
  { phase: "Phase 4 – Optimize", timing: "6-12 months", actions: "Process capability, predictive risk, supplier development, cost-of-poor-quality, mock recall, internal audit and management review maturity" },
  { phase: "Phase 5 – Certify / benchmark", timing: "As approved", actions: "Gap assessment against ISO 9001 or buyer-specific systems; independent audit and closure" },
];

export const SEC26_AUDIT_ITEMS = [
  "Audit all core QMS processes at least annually; high-risk processes and weak suppliers more frequently.",
  "Auditors shall be independent of the activity audited where practicable.",
  "Audit evidence shall include records, interviews, observation and traceability sampling.",
  "Findings shall be classified as critical, major, minor or opportunity for improvement.",
  "Critical findings require immediate containment and leadership escalation.",
  "Audit closure requires objective evidence and effectiveness verification.",
];
