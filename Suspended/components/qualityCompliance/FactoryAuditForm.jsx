import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useMemberId, useProfileHeader } from '../../stores/profileStore'
import SignaturePad from '../shared/SignaturePad'
import { exportAuditPdf } from '../../utils/exportAuditPdf'
import {
  useAuditDetail,
  createAuditHeader,
  upsertSection,
  addMachineryRow,
  deleteMachineryRow,
  updateAuditStatus,
} from '../../hooks/useFactoryAudits'

// ── Field primitives ──────────────────────────────────────────────────────────

const inputCls =
  'w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 ' +
  'focus:border-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900/10 ' +
  'disabled:bg-gray-50 disabled:text-gray-400 bg-white transition-all'

function Field({ label, children, span2 = false, span3 = false }) {
  const cls = span2 ? 'col-span-2' : span3 ? 'col-span-3' : ''
  return (
    <div className={cls}>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      {children}
    </div>
  )
}

function TInput({ value, onChange, placeholder, disabled, type = 'text' }) {
  return (
    <input
      type={type}
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className={inputCls}
    />
  )
}

function NInput({ value, onChange, placeholder, disabled }) {
  return (
    <input
      type="number"
      value={value ?? ''}
      onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
      placeholder={placeholder}
      disabled={disabled}
      className={inputCls}
    />
  )
}

function TArea({ value, onChange, placeholder, rows = 3, disabled }) {
  return (
    <textarea
      value={value ?? ''}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      disabled={disabled}
      className={`${inputCls} resize-y`}
    />
  )
}

function SInput({ value, onChange, options, disabled, placeholder = 'Select…' }) {
  return (
    <div className="relative">
      <select
        value={value ?? ''}
        onChange={e => onChange(e.target.value || null)}
        disabled={disabled}
        className={`${inputCls} appearance-none pr-9`}
      >
        <option value="">{placeholder}</option>
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <svg
        className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400"
        width="13" height="13" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2.5"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </div>
  )
}

function MultiSelect({ value = [], onChange, options, disabled, placeholder = 'Select…' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function onOut(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onOut)
    return () => document.removeEventListener('mousedown', onOut)
  }, [open])

  const selected = value ?? []

  function toggle(opt) {
    const exists = selected.some(s => s.id === opt.id)
    onChange(exists ? selected.filter(s => s.id !== opt.id) : [...selected, { id: opt.id, name: opt.name }])
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => !disabled && setOpen(v => !v)}
        disabled={disabled}
        className={`${inputCls} text-left flex items-center gap-1.5 flex-wrap min-h-[38px] h-auto cursor-pointer`}
      >
        {selected.length === 0
          ? <span className="text-gray-400 text-sm">{placeholder}</span>
          : selected.map(s => (
              <span key={s.id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded">
                {s.name}
                {!disabled && (
                  <button type="button" onClick={e => { e.stopPropagation(); toggle(s) }}
                    className="text-gray-400 hover:text-gray-700 leading-none cursor-pointer">×</button>
                )}
              </span>
            ))
        }
        <svg className="ml-auto flex-shrink-0 text-gray-400" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-30 top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg py-1 max-h-48 overflow-y-auto">
          {options.length === 0 && <p className="px-3 py-2 text-sm text-gray-400">No categories</p>}
          {options.map(opt => {
            const checked = selected.some(s => s.id === opt.id)
            return (
              <button key={opt.id} type="button" onClick={() => toggle(opt)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2.5 cursor-pointer">
                <span className={`w-4 h-4 rounded flex-shrink-0 border-2 flex items-center justify-center transition-colors ${checked ? 'bg-gray-900 border-gray-900' : 'border-gray-300'}`}>
                  {checked && <svg width="8" height="8" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2.5"><polyline points="2 6 5 9 10 3" /></svg>}
                </span>
                {opt.name}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Layout primitives ─────────────────────────────────────────────────────────

function SectionHeader({ title, description }) {
  return (
    <div className="mb-6">
      <h3 className="text-base font-semibold text-gray-900">{title}</h3>
      {description && <p className="text-sm text-gray-500 mt-0.5">{description}</p>}
      <div className="mt-4 border-b border-gray-100" />
    </div>
  )
}

function FieldGroup({ label, children }) {
  return (
    <div className="pt-5 mt-1">
      <div className="flex items-center gap-3 mb-4">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 whitespace-nowrap">
          {label}
        </span>
        <div className="flex-1 h-px bg-gray-100" />
      </div>
      {children}
    </div>
  )
}

function StepFooter({ step, onPrev, onSave, onNext, saving, saved, disabled }) {
  const prev = step > 0 ? STEPS[step - 1] : null
  const next = step < STEPS.length - 1 ? STEPS[step + 1] : null

  return (
    <div className="flex items-center justify-between pt-6 mt-6 border-t border-gray-100">
      <div>
        {prev && (
          <button
            onClick={onPrev}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors cursor-pointer"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            {prev.label}
          </button>
        )}
      </div>
      <div className="flex items-center gap-3">
        {!disabled && onSave && (
          <button
            onClick={onSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-black disabled:opacity-50 transition-colors cursor-pointer"
          >
            {saving && (
              <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            )}
            {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save section'}
          </button>
        )}
        {next && (
          <button
            onClick={onNext}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors cursor-pointer"
          >
            {next.label}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}

// ── Step definitions ──────────────────────────────────────────────────────────

const STEPS = [
  { key: 'details',        label: 'Audit Details',      desc: 'Basic identification for this audit record' },
  { key: 'general',        label: 'General Info',        desc: 'Factory structure, ownership & workforce' },
  { key: 'manufacturing',  label: 'Manufacturing',       desc: 'Production capabilities & machinery inventory' },
  { key: 'infrastructure', label: 'Infrastructure',      desc: 'Physical layout, storage & housekeeping' },
  { key: 'quality',        label: 'Quality Mgmt',        desc: 'Inspection processes & quality systems' },
  { key: 'capacity',       label: 'Capacity Review',     desc: 'Current and maximum production capacity' },
  { key: 'compliance',     label: 'Compliance & Safety', desc: 'Regulatory compliance & safety measures' },
  { key: 'summary',        label: 'Summary',             desc: 'Overall assessment & sign-off' },
]

// ── Read-only summary view ────────────────────────────────────────────────────

const AUDIT_TYPE_LABEL = {
  fcca: 'FCCA', sedex: 'Sedex', eudr: 'EUDR',
  'social-compliance': 'Social Compliance',
  smeta: 'SMETA', bsci: 'BSCI', sa8000: 'SA 8000', ics: 'ICS',
}

const AUDIT_TYPE_OPTIONS = [
  { value: 'fcca',              label: 'FCCA'              },
  { value: 'sedex',             label: 'Sedex'             },
  { value: 'eudr',              label: 'EUDR'              },
  { value: 'social-compliance', label: 'Social Compliance' },
  { value: 'smeta',             label: 'SMETA'             },
  { value: 'bsci',              label: 'BSCI'              },
  { value: 'sa8000',            label: 'SA 8000'           },
  { value: 'ics',               label: 'ICS'               },
]

function fmtDate(d) {
  if (!d) return '—'
  const dt = new Date(d)
  return isNaN(dt) ? d : dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ── Read-only primitives ──────────────────────────────────────────────────────

const READ_NAV = [
  { id: 'ra-general',        label: '1. General Info'       },
  { id: 'ra-manufacturing',  label: '2. Manufacturing'      },
  { id: 'ra-infrastructure', label: '3. Infrastructure'     },
  { id: 'ra-quality',        label: '4. Quality Mgmt'       },
  { id: 'ra-capacity',       label: '5. Capacity Review'    },
  { id: 'ra-compliance',     label: '6. Compliance & Safety'},
  { id: 'ra-summary',        label: '7. Summary'            },
]

function readNavCls(id, activeId) {
  return (
    'text-left text-xs font-medium px-3 py-1.5 rounded-md border-l-2 transition-all duration-150 w-full block cursor-pointer ' +
    (activeId === id
      ? 'text-[#111] font-semibold border-[#1a1a1a] bg-white'
      : 'text-gray-500 border-transparent hover:text-[#111] hover:bg-white/70')
  )
}

// ── Read-only two-column primitives ──────────────────────────────────────────

function RRow({ label, value, link = false }) {
  const display = value != null && value !== '' ? String(value) : null
  return (
    <div className="flex gap-6 py-3 border-b border-[#EBEBEB] last:border-b-0">
      <span className="text-[10px] font-bold uppercase tracking-widest text-[#B3B3B3] w-44 flex-shrink-0 pt-0.5 leading-tight">
        {label}
      </span>
      {link && display
        ? <a href={display} target="_blank" rel="noopener noreferrer"
             className="text-sm text-blue-600 hover:underline flex-1 break-all">
            View org chart
          </a>
        : display
        ? <span className="text-sm text-[#2B2B2B] leading-relaxed whitespace-pre-wrap flex-1">{display}</span>
        : <span className="text-sm text-[#D4D4D4] flex-1">—</span>
      }
    </div>
  )
}

function RBlockRow({ label, value, bgCls = 'bg-gray-50', textCls = 'text-[#2B2B2B]' }) {
  if (!value) return null
  return (
    <div className="flex gap-6 py-3 border-b border-[#EBEBEB]">
      <span className="text-[10px] font-bold uppercase tracking-widest text-[#B3B3B3] w-44 flex-shrink-0 pt-0.5 leading-tight">
        {label}
      </span>
      <div className={`flex-1 ${bgCls} rounded-lg px-4 py-3 text-sm ${textCls} leading-relaxed whitespace-pre-wrap`}>
        {value}
      </div>
    </div>
  )
}

function RSigRow({ label, sigUrl }) {
  return (
    <div className="flex gap-6 py-3 border-b border-[#EBEBEB] last:border-b-0">
      <span className="text-[10px] font-bold uppercase tracking-widest text-[#B3B3B3] w-44 flex-shrink-0 pt-0.5 leading-tight">
        {label}
      </span>
      <div className="flex-1">
        {sigUrl.startsWith('data:')
          ? <img src={sigUrl} alt="signature" className="h-14 object-contain" />
          : <p className="text-xl text-[#2B2B2B]" style={{ fontFamily: "'Dancing Script', cursive" }}>{sigUrl}</p>
        }
      </div>
    </div>
  )
}

function RASection({ id, n, title, children }) {
  return (
    <section id={id} data-ra-section className="mb-12 scroll-mt-6">
      <div className="flex items-baseline gap-3 mb-4">
        <span className="text-[10px] font-bold tracking-widest text-[#B3B3B3] uppercase">{n}</span>
        <h2 className="text-base font-bold text-[#2B2B2B] tracking-tight">{title}</h2>
      </div>
      <div className="border border-[#EBEBEB] rounded-xl overflow-hidden">
        {children}
      </div>
    </section>
  )
}

function RSubHead({ label }) {
  return (
    <div className="flex items-center bg-[#F5F5F5] px-6 py-2 border-b border-[#EBEBEB]">
      <span className="text-[10px] font-bold uppercase tracking-widest text-[#B3B3B3]">{label}</span>
    </div>
  )
}

function RRows({ children }) {
  return <div className="px-6">{children}</div>
}

function AuditReadSkeleton({ onBack }) {
  const bar = (w, h = 'h-3') => (
    <div className={`${h} ${w} bg-gray-200 rounded-md animate-pulse`} />
  )
  return (
    <div className="text-[#333] leading-relaxed">
      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onBack} className="flex items-center gap-1 text-gray-400 hover:text-gray-700 transition-colors flex-shrink-0 cursor-pointer">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <div className="w-px h-4 bg-gray-200 flex-shrink-0" />
          <div className="flex flex-col gap-1.5">
            {bar('w-36')}
            {bar('w-52', 'h-2')}
          </div>
        </div>
        <div className="flex items-center gap-2">{bar('w-20', 'h-6')}{bar('w-16', 'h-5')}</div>
      </div>

      {/* Body */}
      <div className="bg-gray-100 flex gap-4 p-4 min-h-screen">
        {/* Nav skeleton */}
        <div className="hidden md:flex flex-col gap-2 w-44 flex-shrink-0 pt-1">
          {bar('w-16', 'h-2')}
          {[...Array(7)].map((_, i) => <div key={i} className="h-7 bg-white/70 rounded-md animate-pulse" />)}
        </div>

        {/* Content skeleton */}
        <div className="flex-1 min-w-0 bg-white rounded-xl px-4 sm:px-8 py-6 sm:py-8 space-y-10">
          {[...Array(3)].map((_, si) => (
            <div key={si}>
              <div className="flex items-center gap-3 mb-4">
                {bar('w-6', 'h-2')}
                {bar('w-40', 'h-4')}
              </div>
              <div className="border border-[#EBEBEB] rounded-xl overflow-hidden">
                {[...Array(4)].map((_, fi) => (
                  <div key={fi} className="flex gap-6 px-6 py-3 border-b border-[#EBEBEB] last:border-b-0 animate-pulse">
                    <div className="w-44 flex-shrink-0">{bar('w-24', 'h-2')}</div>
                    <div className="flex-1">{bar('w-40')}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function AuditReadView({ audit, onBack }) {
  const [activeId, setActiveId] = useState('ra-general')
  const { businessLogo } = useProfileHeader()

  useEffect(() => {
    const sections = document.querySelectorAll('[data-ra-section]')
    if (!sections.length) return
    const observer = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) setActiveId(e.target.id) }),
      { rootMargin: '-20% 0px -70% 0px' }
    )
    sections.forEach(s => observer.observe(s))
    return () => observer.disconnect()
  }, [])

  const scrollTo = id => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  async function handleExportPdf() {
    await exportAuditPdf(audit, { logoUrl: businessLogo })
  }

  const g   = audit.audit_general_info       ?? {}
  const mfg = audit.audit_manufacturing_info ?? {}
  const inf = audit.audit_infrastructure     ?? {}
  const qm  = audit.audit_quality_management ?? {}
  const cap = audit.audit_capacity_review    ?? {}
  const com = audit.audit_compliance_safety  ?? {}
  const sum = audit.audit_summary            ?? {}
  const supplierName = audit.organizations?.display_name ?? '—'
  const categoryName = (audit.product_categories ?? []).map(c => c.name).join(', ') || null

  return (
    <div className="text-[#333] leading-relaxed">

      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-gray-400 hover:text-gray-700 transition-colors flex-shrink-0 cursor-pointer"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <div className="w-px h-4 bg-gray-200 flex-shrink-0" />
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-gray-900 truncate">{supplierName}</h1>
            <div className="flex items-center gap-1.5 text-[11px] text-gray-400 flex-wrap mt-0.5">
              <span className="font-medium text-gray-500">{AUDIT_TYPE_LABEL[audit.audit_type] ?? audit.audit_type} Audit</span>
              {audit.assessment_date && <><span>·</span><span>{fmtDate(audit.assessment_date)}</span></>}
              {audit.factory_representative && <><span>·</span><span>{audit.factory_representative}</span></>}
              {categoryName && <><span>·</span><span>{categoryName}</span></>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleExportPdf}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors rounded-md cursor-pointer"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export PDF
          </button>
          <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize ${
            audit.status === 'approved'  ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' :
            audit.status === 'submitted' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' :
                                           'bg-white text-gray-500 ring-1 ring-gray-300'
          }`}>{audit.status}</span>
        </div>
      </div>

      {/* Body */}
      <div className="bg-gray-100 flex gap-4 p-4 min-h-screen">

        {/* Sections nav — floats on gray */}
        <nav className="hidden md:flex flex-col gap-0.5 w-44 flex-shrink-0 sticky top-14 self-start pt-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2 px-3">Sections</p>
          {READ_NAV.map(({ id, label }) => (
            <button key={id} onClick={() => scrollTo(id)} className={readNavCls(id, activeId)}>
              {label}
            </button>
          ))}
        </nav>

        {/* Content — white card */}
        <main className="flex-1 min-w-0 bg-white rounded-xl px-4 sm:px-10 py-6 sm:py-8 pb-24">

          <RASection id="ra-general" n="01" title="General Information">
            <RRows>
              <RRow label="Ownership" value={g.ownership} />
              <RRow label="Factory Type" value={g.factory_type} />
              <RRow label="Year Established" value={g.year_established} />
              <RRow label="Total Production Area" value={g.total_production_area} />
            </RRows>
            <RSubHead label="Workforce" />
            <RRows>
              <RRow label="Total Employees" value={g.total_employees} />
              <RRow label="Permanent Employees" value={g.permanent_employees} />
              <RRow label="Contract Employees" value={g.contract_employees} />
            </RRows>
            <RSubHead label="Working Schedule" />
            <RRows>
              <RRow label="Working Days" value={g.working_days} />
              <RRow label="Working Hours" value={g.working_hours} />
            </RRows>
          </RASection>

          <RASection id="ra-manufacturing" n="02" title="Manufacturing Information">
            <RRows>
              <RRow label="Main Products" value={mfg.main_products} />
              <RRow label="Manufacturing Processes" value={mfg.manufacturing_processes} />
            </RRows>
            <RSubHead label="Capacity" />
            <RRows>
              <RRow label="No. of Production Lines" value={mfg.number_of_production_lines} />
              <RRow label="Production Line Images" value={mfg.production_lines_images_url} link />
              <RRow label="Major Machinery Name" value={mfg.major_machinery_name} />
              <RRow label="Machinery Images" value={mfg.machinery_images_url} link />
              <RRow label="Monthly Production Capacity" value={mfg.monthly_production_capacity} />
              <RRow label="Current Capacity Utilization" value={mfg.current_capacity_utilization} />
              <RRow label="Average Lead Time" value={mfg.average_lead_time} />
              <RRow label="Peak Season" value={mfg.peak_season} />
              <RRow label="Organisation Chart" value={mfg.organization_chart_url} link />
            </RRows>
          </RASection>

          <RASection id="ra-infrastructure" n="03" title="Infrastructure Assessment">
            <RRows>
              <RRow label="Production Layout" value={inf.production_layout} />
              <RRow label="Production Layout (Copy)" value={inf.production_layout_url} link />
              <RRow label="Material Flow" value={inf.material_flow} />
              <RRow label="Material Flow (Copy)" value={inf.material_flow_url} link />
              <RRow label="Incoming Material Storage" value={inf.incoming_material_storage} />
              <RRow label="Production Area" value={inf.production_area} />
              <RRow label="Finishing & Packing Area" value={inf.finishing_packing_area} />
              <RRow label="Chemical Storage" value={inf.chemical_storage} />
              <RRow label="Finished Goods Storage" value={inf.finished_goods_storage} />
              <RRow label="Container Parking" value={inf.container_parking} />
              <RRow label="Housekeeping" value={inf.housekeeping} />
              <RRow label="Washroom Images" value={inf.washroom_images_url} link />
            </RRows>
          </RASection>

          <RASection id="ra-quality" n="04" title="Quality Management">
            <RRows>
              <RRow label="Incoming Material Inspection" value={qm.incoming_material_inspection} link />
              <RRow label="In-Process Inspection" value={qm.in_process_inspection} link />
              <RRow label="Final Inspection" value={qm.final_inspection} link />
              <RRow label="Testing Equipment" value={qm.testing_equipment} link />
              <RRow label="Calibration System" value={qm.calibration_system} link />
              <RRow label="Quality Records" value={qm.quality_records} link />
              <RRow label="Corrective Action System" value={qm.corrective_action_system} link />
            </RRows>
          </RASection>

          <RASection id="ra-capacity" n="05" title="Production Capacity Review">
            <RRows>
              <RRow label="Current Monthly Orders" value={cap.current_monthly_orders} />
              <RRow label="Available Capacity" value={cap.available_capacity} />
              <RRow label="Maximum Monthly Capacity" value={cap.maximum_monthly_capacity} />
              <RRow label="Production Planning System" value={cap.production_planning_system} />
              <RRow label="Subcontracting" value={cap.subcontracting} />
              <RRow label="Production Constraints" value={cap.production_constraints} />
            </RRows>
          </RASection>

          <RASection id="ra-compliance" n="06" title="Compliance & Safety">
            <RRows>
              <RRow label="Factory License" value={com.factory_license} />
              <RRow label="Machine Safety" value={com.machine_safety} />
              <RRow label="Fire Safety Arrangements" value={com.fire_safety_arrangements} />
              <RRow label="Fire Safety Images & NOC" value={com.fire_safety_images_url} link />
              <RRow label="Emergency Exits" value={com.emergency_exits} link />
              <RRow label="PPE Usage" value={com.ppe_usage} link />
              <RRow label="Chemical Management" value={com.chemical_management} link />
              <RRow label="Waste Disposal" value={com.waste_disposal} />
            </RRows>
          </RASection>

          <RASection id="ra-summary" n="07" title="Summary & Sign-off">
            <div className="px-6">
              <RBlockRow label="Factory Strengths" value={sum.factory_strengths} bgCls="bg-gray-50" textCls="text-[#2B2B2B]" />
              <RBlockRow label="Areas Requiring Improvement" value={sum.areas_requiring_improvement} bgCls="bg-amber-50" textCls="text-amber-900" />
              <RRow label="Capability Assessment by Auditor" value={sum.capability_assessment} />
              <RRow label="Capacity Assessment by Auditor" value={sum.capacity_assessment} />
              {sum.auditor_signature_url && <RSigRow label="Auditor Signature" sigUrl={sum.auditor_signature_url} />}
              {audit.factory_representative && <RRow label="Factory Representative" value={audit.factory_representative} />}
            </div>
          </RASection>

        </main>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function FactoryAuditForm({ auditId, onBack }) {
  const memberId = useMemberId()
  const [localId, setLocalId] = useState(auditId)
  const [step, setStep] = useState(auditId ? 1 : 0)
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState(null)
  const [savedStep, setSavedStep] = useState(null)

  const { audit, loading, refresh } = useAuditDetail(localId)

  const [suppliers, setSuppliers] = useState([])
  const [categories, setCategories] = useState([])

  useEffect(() => {
    supabase.from('organizations').select('id, display_name').eq('type', 'supplier').order('display_name')
      .then(({ data }) => setSuppliers(data ?? []))
    supabase.from('categories').select('id, name').order('name')
      .then(({ data }) => setCategories(data ?? []))
  }, [])

  const [header, setHeader] = useState({
    organization_id: '', audit_type: 'fcca', trigger_reason: '',
    assessment_date: '', factory_representative: '', product_category_ids: [],
  })
  const [general, setGeneral]       = useState({})
  const [mfg, setMfg]               = useState({})
  const [infra, setInfra]           = useState({})
  const [quality, setQuality]       = useState({})
  const [capacity, setCapacity]     = useState({})
  const [compliance, setCompliance] = useState({})
  const [summary, setSummary]       = useState({})

  useEffect(() => {
    if (!audit) return
    setHeader({
      organization_id:        audit.organization_id ?? '',
      audit_type:             audit.audit_type ?? 'fcca',
      trigger_reason:         audit.trigger_reason ?? '',
      assessment_date:        audit.assessment_date ?? '',
      factory_representative: audit.factory_representative ?? '',
      product_category_ids:   audit.product_categories ?? [],
    })
    setGeneral(audit.audit_general_info ?? {})
    setMfg(audit.audit_manufacturing_info ?? {})
    setInfra(audit.audit_infrastructure ?? {})
    setQuality(audit.audit_quality_management ?? {})
    setCapacity(audit.audit_capacity_review ?? {})
    setCompliance(audit.audit_compliance_safety ?? {})
    setSummary(audit.audit_summary ?? {})
  }, [audit])

  function upd(setter) {
    return (field, value) => setter(prev => ({ ...prev, [field]: value }))
  }

  function flash(stepIdx) {
    setSavedStep(stepIdx)
    setTimeout(() => setSavedStep(null), 2500)
  }

  async function handleSaveHeader() {
    setSaving(true); setSaveErr(null)
    const payload = {
      organization_id:        header.organization_id || null,
      audit_type:             header.audit_type,
      trigger_reason:         header.trigger_reason || null,
      assessment_date:        header.assessment_date || null,
      factory_representative: header.factory_representative || null,
      product_categories:     header.product_category_ids?.length ? header.product_category_ids : null,
    }
    if (!localId) {
      const { data, error } = await createAuditHeader({ ...payload, status: 'draft', auditor_id: memberId })
      if (error) { setSaveErr(error.message); setSaving(false); return }
      setLocalId(data.id)
      setStep(1)
    } else {
      const { error } = await supabase.from('factory_audits').update(payload).eq('id', localId)
      if (error) { setSaveErr(error.message); setSaving(false); return }
      flash(0)
    }
    setSaving(false)
  }

  async function handleSaveSection(table, data, stepIdx) {
    if (!localId) return
    setSaving(true); setSaveErr(null)
    const { error } = await upsertSection(table, { ...data, audit_id: localId })
    if (error) { setSaveErr(error.message); setSaving(false); return }
    flash(stepIdx)
    await refresh()
    setSaving(false)
  }

  async function handleSubmit() {
    if (!localId) return
    setSaveErr(null)
    const missing = STEPS.slice(1).filter((_, i) => !completedSteps.has(i + 1))
    if (missing.length > 0) {
      setSaveErr(`Complete all sections before submitting. Missing: ${missing.map(s => s.label).join(', ')}`)
      return
    }
    setSaving(true)
    const { error } = await updateAuditStatus(localId, 'submitted')
    if (error) setSaveErr(error.message)
    else { await refresh(); onBack() }
    setSaving(false)
  }

  const auditStatus  = audit?.status ?? 'draft'
  const isReadOnly   = auditStatus === 'submitted'
  const supplierName = audit?.organizations?.display_name
    ?? suppliers.find(s => s.id === header.organization_id)?.display_name
    ?? ''
  const vendorSlug = supplierName
    ? supplierName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || 'vendor'
    : 'vendor'
  const auditDate = header.assessment_date || 'undated'

  const completedSteps = new Set()
  if (audit?.audit_general_info)       completedSteps.add(1)
  if (audit?.audit_manufacturing_info) completedSteps.add(2)
  if (audit?.audit_infrastructure)     completedSteps.add(3)
  if (audit?.audit_quality_management) completedSteps.add(4)
  if (audit?.audit_capacity_review)    completedSteps.add(5)
  if (audit?.audit_compliance_safety)  completedSteps.add(6)
  if (audit?.audit_summary)            completedSteps.add(7)

  if (loading && localId) {
    return <AuditReadSkeleton onBack={onBack} />
  }

  if (audit?.status === 'submitted') {
    return <AuditReadView audit={audit} onBack={onBack} />
  }

  const stepProps = {
    step,
    onPrev: () => setStep(s => Math.max(0, s - 1)),
    onNext: () => setStep(s => Math.min(STEPS.length - 1, s + 1)),
    saving,
    disabled: isReadOnly,
  }

  return (
    <div>

      {/* Top bar */}
      <div className="bg-white border-b border-gray-200 px-3 sm:px-6 py-3.5 flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors cursor-pointer"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back
        </button>

        <div className="w-px h-4 bg-gray-200" />

        <div className="flex-1 min-w-0">
          {supplierName ? (
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm font-semibold text-gray-900 truncate">{supplierName}</span>
              <span className="text-gray-300 text-sm">/</span>
              <span className="text-sm text-gray-500 truncate">{STEPS[step].label}</span>
            </div>
          ) : (
            <span className="text-sm font-semibold text-gray-900">New Factory Audit</span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {localId && (
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium capitalize
              ${auditStatus === 'draft'     ? 'bg-gray-100 text-gray-600'   :
                auditStatus === 'submitted' ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'  :
                                              'bg-green-50 text-green-700 ring-1 ring-green-200'}`}
            >
              {auditStatus}
            </span>
          )}
          {localId && auditStatus === 'draft' && (
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="px-3.5 py-1.5 border border-gray-300 text-sm font-medium rounded-lg hover:border-gray-900 hover:text-gray-900 transition-colors disabled:opacity-50 text-gray-700 cursor-pointer"
            >
              Submit
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-col md:flex-row items-start">

        {/* Sidebar — desktop only */}
        <div className="hidden md:block w-56 flex-shrink-0 sticky top-0 self-start border-r border-gray-200 bg-white min-h-[calc(100vh-57px)]">
          <div className="px-4 pt-5 pb-2">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Sections
            </p>
          </div>
          <nav className="px-2 pb-4">
            {STEPS.map((s, i) => {
              const locked  = i > 0 && !localId
              const active  = step === i
              const done    = completedSteps.has(i) || (savedStep === i && !active)
              return (
                <button
                  key={s.key}
                  onClick={() => !locked && setStep(i)}
                  disabled={locked}
                  className={`w-full text-left px-3 py-2.5 rounded-lg mb-0.5 flex items-center gap-3 transition-colors
                    ${active  ? 'bg-gray-900 text-white cursor-pointer' :
                      locked  ? 'text-gray-300 cursor-not-allowed' :
                                'text-gray-600 hover:bg-gray-50 cursor-pointer'}`}
                >
                  <span className={`w-6 h-6 flex-shrink-0 rounded-full flex items-center justify-center text-xs font-semibold border transition-colors
                    ${active ? 'bg-white text-gray-900 border-white' :
                      done   ? 'bg-green-500 text-white border-green-500' :
                      locked ? 'border-gray-200 text-gray-300' :
                               'border-gray-300 text-gray-500'}`}
                  >
                    {done && !active ? '✓' : i + 1}
                  </span>
                  <div className="min-w-0">
                    <div className={`text-xs font-medium truncate ${active ? 'text-white' : locked ? 'text-gray-300' : 'text-gray-700'}`}>
                      {s.label}
                    </div>
                  </div>
                </button>
              )
            })}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 p-4 md:p-6 max-w-3xl w-full">
          {/* Mobile step progress */}
          <div className="md:hidden mb-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-700">{STEPS[step].label}</span>
              <span className="text-xs text-gray-400">{step + 1} / {STEPS.length}</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-1">
              <div className="bg-gray-900 h-1 rounded-full transition-all duration-300" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
            </div>
          </div>
          {saveErr && (
            <div className="mb-5 flex items-start gap-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              <svg className="w-4 h-4 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {saveErr}
            </div>
          )}

          {step === 0 && (
            <DetailsStep
              data={header} onField={upd(setHeader)}
              suppliers={suppliers} categories={categories}
              isNew={!localId}
              onSave={handleSaveHeader}
              saved={savedStep === 0}
              {...stepProps}
            />
          )}
          {step === 1 && (
            <GeneralInfoStep
              data={general} onField={upd(setGeneral)}
              onSave={() => handleSaveSection('audit_general_info', general, 1)}
              saved={savedStep === 1}
              {...stepProps}
            />
          )}
          {step === 2 && (
            <ManufacturingStep
              data={mfg} onField={upd(setMfg)}
              auditId={localId} vendorSlug={vendorSlug} auditDate={auditDate}
              onSave={() => handleSaveSection('audit_manufacturing_info', mfg, 2)}
              saved={savedStep === 2}
              {...stepProps}
            />
          )}
          {step === 3 && (
            <InfrastructureStep
              data={infra} onField={upd(setInfra)}
              auditId={localId} vendorSlug={vendorSlug} auditDate={auditDate}
              onSave={() => handleSaveSection('audit_infrastructure', infra, 3)}
              saved={savedStep === 3}
              {...stepProps}
            />
          )}
          {step === 4 && (
            <QualityMgmtStep
              data={quality} onField={upd(setQuality)}
              auditId={localId} vendorSlug={vendorSlug} auditDate={auditDate}
              onSave={() => handleSaveSection('audit_quality_management', quality, 4)}
              saved={savedStep === 4}
              {...stepProps}
            />
          )}
          {step === 5 && (
            <CapacityStep
              data={capacity} onField={upd(setCapacity)}
              onSave={() => handleSaveSection('audit_capacity_review', capacity, 5)}
              saved={savedStep === 5}
              {...stepProps}
            />
          )}
          {step === 6 && (
            <ComplianceStep
              data={compliance} onField={upd(setCompliance)}
              auditId={localId} vendorSlug={vendorSlug} auditDate={auditDate}
              onSave={() => handleSaveSection('audit_compliance_safety', compliance, 6)}
              saved={savedStep === 6}
              {...stepProps}
            />
          )}
          {step === 7 && (
            <SummaryStep
              data={summary} onField={upd(setSummary)}
              onSave={() => handleSaveSection('audit_summary', summary, 7)}
              saved={savedStep === 7}
              {...stepProps}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ── Org chart file upload ─────────────────────────────────────────────────────

function OrgChartUpload({ value, onUrl, basePath, disabled }) {
  const [uploading, setUploading] = useState(false)
  const [uploadErr, setUploadErr] = useState(null)

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file || !basePath) return
    setUploading(true)
    setUploadErr(null)
    const ext = file.name.split('.').pop()
    const path = `${basePath}/org-chart.${ext}`
    const { error } = await supabase.storage
      .from('factory-audits')
      .upload(path, file, { upsert: true })
    if (error) { setUploadErr(error.message); setUploading(false); return }
    const { data } = supabase.storage.from('factory-audits').getPublicUrl(path)
    onUrl(data.publicUrl)
    setUploading(false)
    e.target.value = ''
  }

  return (
    <div className="flex flex-col gap-2">
      {value && (
        <a
          href={value} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:underline"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          View org chart
        </a>
      )}
      {!disabled && (
        <label className={`inline-flex items-center gap-2 w-fit px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 cursor-pointer hover:border-gray-400 hover:text-gray-900 transition-colors ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="16 16 12 12 8 16" /><line x1="12" y1="12" x2="12" y2="21" />
            <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
          </svg>
          {uploading ? 'Uploading…' : value ? 'Replace file' : 'Upload file'}
          <input type="file" className="hidden" onChange={handleFile} accept=".pdf,.png,.jpg,.jpeg,.xlsx,.doc,.docx" />
        </label>
      )}
      {uploadErr && <p className="text-xs text-red-500">{uploadErr}</p>}
    </div>
  )
}

// ── Generic file upload ───────────────────────────────────────────────────────

function FileUpload({ value, onUrl, storagePath, disabled }) {
  const [uploading, setUploading] = useState(false)
  const [uploadErr, setUploadErr] = useState(null)

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadErr(null)
    const ext = file.name.split('.').pop()
    const { error } = await supabase.storage
      .from('factory-audits')
      .upload(`${storagePath}.${ext}`, file, { upsert: true })
    if (error) { setUploadErr(error.message); setUploading(false); return }
    const { data } = supabase.storage.from('factory-audits').getPublicUrl(`${storagePath}.${ext}`)
    onUrl(data.publicUrl)
    setUploading(false)
    e.target.value = ''
  }

  return (
    <div className="flex flex-col gap-2">
      {value && (
        <a href={value} target="_blank" rel="noopener noreferrer"
           className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:underline">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          View attached file
        </a>
      )}
      {!disabled && (
        <label className={`inline-flex items-center gap-2 w-fit px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 cursor-pointer hover:border-gray-400 hover:text-gray-900 transition-colors ${uploading ? 'opacity-50 pointer-events-none' : ''}`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="16 16 12 12 8 16" /><line x1="12" y1="12" x2="12" y2="21" />
            <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
          </svg>
          {uploading ? 'Uploading…' : value ? 'Replace' : 'Attach file'}
          <input type="file" className="hidden" onChange={handleFile} accept=".pdf,.png,.jpg,.jpeg,.doc,.docx" />
        </label>
      )}
      {uploadErr && <p className="text-xs text-red-500">{uploadErr}</p>}
    </div>
  )
}

// ── Step: Audit Details ───────────────────────────────────────────────────────

function DetailsStep({ data, onField, suppliers, categories, isNew, onSave, step, onPrev, onNext, saving, saved, disabled }) {
  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <Field label="Supplier *">
          <SInput
            value={data.organization_id}
            onChange={v => onField('organization_id', v)}
            options={suppliers.map(s => ({ value: s.id, label: s.display_name }))}
            disabled={disabled} placeholder="Select supplier…"
          />
        </Field>
        <Field label="Audit Type *">
          <SInput
            value={data.audit_type}
            onChange={v => onField('audit_type', v)}
            options={AUDIT_TYPE_OPTIONS}
            disabled={disabled}
          />
        </Field>
        <Field label="Assessment Date *">
          <TInput type="date" value={data.assessment_date} onChange={v => onField('assessment_date', v)} disabled={disabled} />
        </Field>
        <Field label="Factory Representative">
          <TInput value={data.factory_representative} onChange={v => onField('factory_representative', v)} placeholder="Representative name" disabled={disabled} />
        </Field>
        <Field label="Product Category">
          <MultiSelect
            value={data.product_category_ids}
            onChange={v => onField('product_category_ids', v)}
            options={categories.map(c => ({ id: c.id, name: c.name }))}
            disabled={disabled} placeholder="Select categories…"
          />
        </Field>
        <Field label="Trigger Reason">
          <TInput value={data.trigger_reason} onChange={v => onField('trigger_reason', v)} placeholder="Reason for this audit" disabled={disabled} />
        </Field>
      </div>
      <StepFooter
        step={step} onPrev={onPrev} onNext={isNew ? null : onNext}
        onSave={disabled ? null : onSave}
        saving={saving} saved={saved} disabled={disabled}
      />
    </div>
  )
}

// ── Step: General Info ────────────────────────────────────────────────────────

function GeneralInfoStep({ data, onField, step, onPrev, onNext, onSave, saving, saved, disabled }) {
  return (
    <div>
      <SectionHeader title="General Information" description="Factory structure, ownership and workforce overview" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <Field label="Ownership">
          <TInput value={data.ownership} onChange={v => onField('ownership', v)} placeholder="e.g. Private Ltd" disabled={disabled} />
        </Field>
        <Field label="Factory Type">
          <TInput value={data.factory_type} onChange={v => onField('factory_type', v)} placeholder="e.g. Cut & Sew" disabled={disabled} />
        </Field>
        <Field label="Year Established">
          <NInput value={data.year_established} onChange={v => onField('year_established', v)} placeholder="e.g. 2005" disabled={disabled} />
        </Field>
        <Field label="Total Production Area">
          <TInput value={data.total_production_area} onChange={v => onField('total_production_area', v)} placeholder="e.g. 12,000 sq ft" disabled={disabled} />
        </Field>
      </div>

      <FieldGroup label="Workforce">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <Field label="Total Employees">
            <NInput value={data.total_employees} onChange={v => onField('total_employees', v)} placeholder="0" disabled={disabled} />
          </Field>
          <Field label="Permanent">
            <NInput value={data.permanent_employees} onChange={v => onField('permanent_employees', v)} placeholder="0" disabled={disabled} />
          </Field>
          <Field label="Contract">
            <NInput value={data.contract_employees} onChange={v => onField('contract_employees', v)} placeholder="0" disabled={disabled} />
          </Field>
        </div>
      </FieldGroup>

      <FieldGroup label="Working Schedule">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field label="Working Days">
            <TInput value={data.working_days} onChange={v => onField('working_days', v)} placeholder="e.g. Mon–Sat" disabled={disabled} />
          </Field>
          <Field label="Working Hours">
            <TInput value={data.working_hours} onChange={v => onField('working_hours', v)} placeholder="e.g. 9:00–18:00" disabled={disabled} />
          </Field>
        </div>
      </FieldGroup>

      <StepFooter step={step} onPrev={onPrev} onNext={onNext} onSave={disabled ? null : onSave} saving={saving} saved={saved} disabled={disabled} />
    </div>
  )
}

// ── Step: Manufacturing ───────────────────────────────────────────────────────

function ManufacturingStep({ data, onField, auditId, vendorSlug, auditDate, step, onPrev, onNext, onSave, saving, saved, disabled }) {
  const base = `${vendorSlug ?? 'vendor'}/${auditDate ?? 'undated'}/${auditId}`
  return (
    <div>
      <SectionHeader title="Manufacturing Information" description="Production capabilities, processes and machinery inventory" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <Field label="Main Products" span2>
          <TArea value={data.main_products} onChange={v => onField('main_products', v)} placeholder="Primary products manufactured" rows={2} disabled={disabled} />
        </Field>
        <Field label="Manufacturing Processes" span2>
          <TArea value={data.manufacturing_processes} onChange={v => onField('manufacturing_processes', v)} placeholder="Key processes used in production" rows={2} disabled={disabled} />
        </Field>
      </div>

      <FieldGroup label="Capacity">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <Field label="Number of Production Lines (How Many)">
            <NInput value={data.number_of_production_lines} onChange={v => onField('number_of_production_lines', v)} placeholder="How many lines?" disabled={disabled} />
            <div className="mt-2">
              <FileUpload value={data.production_lines_images_url} onUrl={v => onField('production_lines_images_url', v)} storagePath={`${base}/manufacturing/production-lines`} disabled={disabled} />
              {!disabled && <p className="mt-1 text-xs text-gray-400">Attach image of each line (if any)</p>}
            </div>
          </Field>
          <Field label="Major Machinery Name">
            <TArea value={data.major_machinery_name} onChange={v => onField('major_machinery_name', v)} placeholder="List major machines used in production" rows={3} disabled={disabled} />
            <div className="mt-2">
              <FileUpload value={data.machinery_images_url} onUrl={v => onField('machinery_images_url', v)} storagePath={`${base}/manufacturing/machinery`} disabled={disabled} />
              {!disabled && <p className="mt-1 text-xs text-gray-400">Attach images of machinery</p>}
            </div>
          </Field>
          <Field label="Monthly Production Capacity (in Units or Containers)">
            <TInput value={data.monthly_production_capacity} onChange={v => onField('monthly_production_capacity', v)} placeholder="e.g. 5,000 units" disabled={disabled} />
          </Field>
          <Field label="Current Capacity Utilization (in Units or Containers)">
            <TInput value={data.current_capacity_utilization} onChange={v => onField('current_capacity_utilization', v)} placeholder="e.g. 3,900 units / 78%" disabled={disabled} />
          </Field>
          <Field label="Average Lead Time (in Days)">
            <TInput value={data.average_lead_time} onChange={v => onField('average_lead_time', v)} placeholder="e.g. 45 days" disabled={disabled} />
          </Field>
          <Field label="Peak Season (Mention Month)">
            <TInput value={data.peak_season} onChange={v => onField('peak_season', v)} placeholder="e.g. October" disabled={disabled} />
          </Field>
          <Field label="Organization Chart" span2>
            <OrgChartUpload value={data.organization_chart_url} onUrl={v => onField('organization_chart_url', v)} basePath={`${base}/manufacturing`} disabled={disabled} />
            {!disabled && <p className="mt-1 text-xs text-gray-400">If yes, attach copy</p>}
          </Field>
        </div>
      </FieldGroup>

      <StepFooter step={step} onPrev={onPrev} onNext={onNext} onSave={disabled ? null : onSave} saving={saving} saved={saved} disabled={disabled} />
    </div>
  )
}

// ── Step: Infrastructure ──────────────────────────────────────────────────────

function InfrastructureStep({ data, onField, auditId, vendorSlug, auditDate, step, onPrev, onNext, onSave, saving, saved, disabled }) {
  const base = `${vendorSlug ?? 'vendor'}/${auditDate ?? 'undated'}/${auditId}`
  const areaHint = 'Mention area in SQ Ft. or SQ Mtr.'
  return (
    <div>
      <SectionHeader title="Infrastructure Assessment" description="Physical layout, storage facilities and housekeeping standards" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <Field label="Production Layout">
          <TArea value={data.production_layout} onChange={v => onField('production_layout', v)} disabled={disabled} />
          <div className="mt-2">
            <FileUpload value={data.production_layout_url} onUrl={v => onField('production_layout_url', v)} storagePath={`${base}/infrastructure/production-layout`} disabled={disabled} />
            {!disabled && <p className="mt-1 text-xs text-gray-400">If yes, attach copy</p>}
          </div>
        </Field>
        <Field label="Material Flow">
          <TArea value={data.material_flow} onChange={v => onField('material_flow', v)} disabled={disabled} />
          <div className="mt-2">
            <FileUpload value={data.material_flow_url} onUrl={v => onField('material_flow_url', v)} storagePath={`${base}/infrastructure/material-flow`} disabled={disabled} />
            {!disabled && <p className="mt-1 text-xs text-gray-400">If yes, attach copy</p>}
          </div>
        </Field>
        <Field label="Incoming Material Storage">
          <TArea value={data.incoming_material_storage} onChange={v => onField('incoming_material_storage', v)} disabled={disabled} />
          {!disabled && <p className="mt-1 text-xs text-gray-400">{areaHint}</p>}
        </Field>
        <Field label="Production Area">
          <TArea value={data.production_area} onChange={v => onField('production_area', v)} disabled={disabled} />
          {!disabled && <p className="mt-1 text-xs text-gray-400">{areaHint}</p>}
        </Field>
        <Field label="Finishing & Packing Area">
          <TArea value={data.finishing_packing_area} onChange={v => onField('finishing_packing_area', v)} disabled={disabled} />
          {!disabled && <p className="mt-1 text-xs text-gray-400">{areaHint}</p>}
        </Field>
        <Field label="Chemical Storage">
          <TArea value={data.chemical_storage} onChange={v => onField('chemical_storage', v)} disabled={disabled} />
          {!disabled && <p className="mt-1 text-xs text-gray-400">{areaHint}</p>}
        </Field>
        <Field label="Finished Goods Storage">
          <TArea value={data.finished_goods_storage} onChange={v => onField('finished_goods_storage', v)} disabled={disabled} />
          {!disabled && <p className="mt-1 text-xs text-gray-400">{areaHint}</p>}
        </Field>
        <Field label="Container Parking">
          <TInput value={data.container_parking} onChange={v => onField('container_parking', v)} placeholder="How many spaces inside factory?" disabled={disabled} />
        </Field>
        <Field label="Housekeeping">
          <TArea value={data.housekeeping} onChange={v => onField('housekeeping', v)} disabled={disabled} />
          {!disabled && <p className="mt-1 text-xs text-gray-400">Outsourced or dedicated person available</p>}
        </Field>
        <Field label="Washroom Images">
          <FileUpload value={data.washroom_images_url} onUrl={v => onField('washroom_images_url', v)} storagePath={`${base}/infrastructure/washroom`} disabled={disabled} />
          {!disabled && <p className="mt-1 text-xs text-gray-400">Labour & staff washroom</p>}
        </Field>
      </div>
      <StepFooter step={step} onPrev={onPrev} onNext={onNext} onSave={disabled ? null : onSave} saving={saving} saved={saved} disabled={disabled} />
    </div>
  )
}

// ── Step: Quality Management ──────────────────────────────────────────────────

function QualityMgmtStep({ data, onField, auditId, vendorSlug, auditDate, step, onPrev, onNext, onSave, saving, saved, disabled }) {
  const base = `${vendorSlug ?? 'vendor'}/${auditDate ?? 'undated'}/${auditId}`
  const fields = [
    ['incoming_material_inspection', 'Incoming Material Inspection', 'Attach report'],
    ['in_process_inspection',        'In-Process Inspection',        'Attach report'],
    ['final_inspection',             'Final Inspection',             'Attach report'],
    ['testing_equipment',            'Testing Equipment',            'Attach report'],
    ['calibration_system',           'Calibration System',          'Attach report'],
    ['quality_records',              'Quality Records',              'Attach report'],
    ['corrective_action_system',     'Corrective Action System',    'Attach one example'],
  ]
  return (
    <div>
      <SectionHeader title="Quality Management" description="Attach inspection reports and quality system documents" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {fields.map(([key, label, hint]) => (
          <Field key={key} label={label}>
            <FileUpload
              value={data[key]}
              onUrl={v => onField(key, v)}
              storagePath={`${base}/quality/${key}`}
              disabled={disabled}
            />
            {!disabled && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
          </Field>
        ))}
      </div>
      <StepFooter step={step} onPrev={onPrev} onNext={onNext} onSave={disabled ? null : onSave} saving={saving} saved={saved} disabled={disabled} />
    </div>
  )
}

// ── Step: Capacity Review ─────────────────────────────────────────────────────

function CapacityStep({ data, onField, step, onPrev, onNext, onSave, saving, saved, disabled }) {
  return (
    <div>
      <SectionHeader title="Production Capacity Review" description="Current orders, capacity utilisation and production constraints" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <Field label="Current Monthly Orders">
          <TArea value={data.current_monthly_orders} onChange={v => onField('current_monthly_orders', v)} disabled={disabled} />
        </Field>
        <Field label="Available Capacity">
          <TArea value={data.available_capacity} onChange={v => onField('available_capacity', v)} disabled={disabled} />
        </Field>
        <Field label="Maximum Monthly Capacity">
          <TArea value={data.maximum_monthly_capacity} onChange={v => onField('maximum_monthly_capacity', v)} disabled={disabled} />
        </Field>
        <Field label="Production Planning System">
          <TArea value={data.production_planning_system} onChange={v => onField('production_planning_system', v)} placeholder="Manual or ERP (software name)" disabled={disabled} />
        </Field>
        <Field label="Subcontracting">
          <TArea value={data.subcontracting} onChange={v => onField('subcontracting', v)} placeholder="If any — process & how many" disabled={disabled} />
        </Field>
        <Field label="Production Constraints">
          <TArea value={data.production_constraints} onChange={v => onField('production_constraints', v)} disabled={disabled} />
        </Field>
      </div>
      <StepFooter step={step} onPrev={onPrev} onNext={onNext} onSave={disabled ? null : onSave} saving={saving} saved={saved} disabled={disabled} />
    </div>
  )
}

// ── Step: Compliance & Safety ─────────────────────────────────────────────────

function ComplianceStep({ data, onField, auditId, vendorSlug, auditDate, step, onPrev, onNext, onSave, saving, saved, disabled }) {
  const base = `${vendorSlug ?? 'vendor'}/${auditDate ?? 'undated'}/${auditId}/compliance`
  return (
    <div>
      <SectionHeader title="Compliance & Safety" description="Regulatory compliance, safety measures and risk management" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">

        <Field label="Factory License">
          <TArea value={data.factory_license} onChange={v => onField('factory_license', v)} disabled={disabled} />
        </Field>

        <Field label="Machine Safety">
          <TArea value={data.machine_safety} onChange={v => onField('machine_safety', v)} disabled={disabled} />
        </Field>

        <Field label="Fire Safety Arrangements" span2>
          <TInput
            value={data.fire_safety_arrangements}
            onChange={v => onField('fire_safety_arrangements', v)}
            placeholder="No. of fire extinguishers, NOC reference, other notes"
            disabled={disabled}
          />
          <div className="mt-2">
            <FileUpload value={data.fire_safety_images_url} onUrl={v => onField('fire_safety_images_url', v)} storagePath={`${base}/fire-safety`} disabled={disabled} />
            {!disabled && <p className="mt-1 text-xs text-gray-400">Attach images & NOC</p>}
          </div>
        </Field>

        <Field label="Emergency Exits">
          <FileUpload value={data.emergency_exits} onUrl={v => onField('emergency_exits', v)} storagePath={`${base}/emergency-exits`} disabled={disabled} />
          {!disabled && <p className="mt-1 text-xs text-gray-400">Attach images</p>}
        </Field>

        <Field label="PPE Usage">
          <FileUpload value={data.ppe_usage} onUrl={v => onField('ppe_usage', v)} storagePath={`${base}/ppe`} disabled={disabled} />
          {!disabled && <p className="mt-1 text-xs text-gray-400">Attach images</p>}
        </Field>

        <Field label="Chemical Management">
          <FileUpload value={data.chemical_management} onUrl={v => onField('chemical_management', v)} storagePath={`${base}/chemical-management`} disabled={disabled} />
          {!disabled && <p className="mt-1 text-xs text-gray-400">Attach images & SDS</p>}
        </Field>

        <Field label="Waste Disposal" span2>
          <TArea value={data.waste_disposal} onChange={v => onField('waste_disposal', v)} placeholder="Describe how waste disposal is being managed" disabled={disabled} />
        </Field>

      </div>
      <StepFooter step={step} onPrev={onPrev} onNext={onNext} onSave={disabled ? null : onSave} saving={saving} saved={saved} disabled={disabled} />
    </div>
  )
}

// ── Step: Summary & Sign-off ──────────────────────────────────────────────────

function SummaryStep({ data, onField, step, onPrev, onNext, onSave, saving, saved, disabled }) {
  const storedSig  = data.auditor_signature_url ?? ''
  const isImageSig = storedSig.startsWith('data:')
  const [sigMode, setSigMode] = useState(isImageSig ? 'draw' : 'type')

  return (
    <div>
      <SectionHeader title="Summary & Sign-off" description="Overall assessment conclusions and audit sign-off" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <Field label="Factory Strengths" span2>
          <TArea value={data.factory_strengths} onChange={v => onField('factory_strengths', v)} rows={3} disabled={disabled} />
        </Field>
        <Field label="Areas Requiring Improvement" span2>
          <TArea value={data.areas_requiring_improvement} onChange={v => onField('areas_requiring_improvement', v)} rows={3} disabled={disabled} />
        </Field>
        <Field label="Capability Assessment by Auditor" span2>
          <TArea value={data.capability_assessment} onChange={v => onField('capability_assessment', v)} rows={2} disabled={disabled} />
        </Field>
        <Field label="Capacity Assessment by Auditor" span2>
          <TArea value={data.capacity_assessment} onChange={v => onField('capacity_assessment', v)} rows={2} disabled={disabled} />
        </Field>
      </div>

      <FieldGroup label="Auditor Signature">
        {disabled ? (
          storedSig ? (
            isImageSig
              ? <img src={storedSig} alt="Auditor signature" className="h-16 object-contain border border-gray-100 rounded-lg p-2 bg-white" />
              : <p className="text-lg text-gray-900" style={{ fontFamily: "'Dancing Script', cursive" }}>{storedSig}</p>
          ) : <p className="text-sm text-gray-400">No signature provided</p>
        ) : (
          <SignaturePad
            mode={sigMode}
            onModeChange={setSigMode}
            typedValue={isImageSig ? '' : storedSig}
            onTypedChange={v => onField('auditor_signature_url', v)}
            imageValue={isImageSig ? storedSig : ''}
            onImageChange={v => onField('auditor_signature_url', v)}
            typedPlaceholder="Auditor's full name"
          />
        )}
      </FieldGroup>

      <StepFooter step={step} onPrev={onPrev} onNext={null} onSave={disabled ? null : onSave} saving={saving} saved={saved} disabled={disabled} />
    </div>
  )
}