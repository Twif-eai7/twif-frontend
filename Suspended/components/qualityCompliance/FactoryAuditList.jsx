import { useState, useRef, useEffect } from 'react'
import { useFactoryAudits } from '../../hooks/useFactoryAudits'
import { useMemberId, useProfileHeader } from '../../stores/profileStore'
import { exportAuditPdf } from '../../utils/exportAuditPdf'
import { supabase } from '../../lib/supabase'
import FactoryAuditForm from './FactoryAuditForm'

const STATUS_STYLE = {
  draft:     'bg-white text-gray-500 ring-1 ring-gray-300',
  submitted: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  approved:  'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
}

const TYPE_LABEL = {
  fcca:               'FCCA',
  sedex:              'Sedex',
  eudr:               'EUDR',
  'social-compliance':'Social Compliance',
  smeta:              'SMETA',
  bsci:               'BSCI',
  sa8000:             'SA 8000',
  ics:                'ICS',
}

const TYPE_ICON_CLS = {
  fcca:               'bg-violet-600',
  sedex:              'bg-amber-500',
  eudr:               'bg-emerald-600',
  'social-compliance':'bg-sky-600',
  smeta:              'bg-orange-500',
  bsci:               'bg-blue-600',
  sa8000:             'bg-rose-600',
  ics:                'bg-teal-600',
}

const TYPE_TEXT_CLS = {
  fcca:               'text-violet-600',
  sedex:              'text-amber-600',
  eudr:               'text-emerald-600',
  'social-compliance':'text-sky-600',
  smeta:              'text-orange-500',
  bsci:               'text-blue-600',
  sa8000:             'text-rose-600',
  ics:                'text-teal-600',
}

const AUDIT_MENU = [
  { key: 'fcca',              label: 'FCCA',              sub: 'Factory Capability & Capacity Audit', active: true  },
  { key: 'sedex',             label: 'Sedex',             sub: 'Supplier Ethical Data Exchange',      active: false },
  { key: 'eudr',              label: 'EUDR',              sub: 'EU Deforestation Regulation',         active: false },
  { key: 'social-compliance', label: 'Social Compliance', sub: null,                                  active: false },
  { key: 'smeta',             label: 'SMETA',             sub: 'Sedex Members Ethical Trade Audit',   active: false },
  { key: 'bsci',              label: 'BSCI',              sub: 'Business Social Compliance Initiative', active: false },
  { key: 'sa8000',            label: 'SA 8000',           sub: 'Social Accountability Standard',      active: false },
  { key: 'ics',               label: 'ICS',               sub: 'Initiative Clause Sociale',           active: false },
]

function fmtDate(d) {
  if (!d) return '—'
  const dt = new Date(d)
  return isNaN(dt) ? d : dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function FactoryAuditList() {
  const { audits, loading, error, refresh } = useFactoryAudits()
  const memberId = useMemberId()
  const { businessLogo } = useProfileHeader()
  const [activeId, setActiveId]         = useState(null)
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter]     = useState('')
  const [exportingId, setExportingId]   = useState(null)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef(null)

  useEffect(() => {
    if (!dropdownOpen) return
    function onOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setDropdownOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [dropdownOpen])

  if (activeId !== null) {
    return (
      <FactoryAuditForm
        auditId={activeId === 'new' ? null : activeId}
        onBack={() => { setActiveId(null); refresh() }}
      />
    )
  }

  const filtered = audits.filter(a => {
    if (a.status === 'draft' && a.auditor_id !== memberId) return false
    if (statusFilter && a.status !== statusFilter) return false
    if (typeFilter && a.audit_type !== typeFilter) return false
    return true
  })

  async function handleExport(e, audit) {
    e.stopPropagation()
    setExportingId(audit.id)
    try {
      const { data, error: err } = await supabase
        .from('factory_audits')
        .select(`
          *,
          organizations(id, display_name),
          categories(id, name),
          audit_general_info(*),
          audit_manufacturing_info(*),
          audit_machinery(*),
          audit_infrastructure(*),
          audit_quality_management(*),
          audit_capacity_review(*),
          audit_compliance_safety(*),
          audit_summary(*)
        `)
        .eq('id', audit.id)
        .single()
      if (!err && data) await exportAuditPdf(data, { logoUrl: businessLogo })
    } finally {
      setExportingId(null)
    }
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-[#2B2B2B]">Factory Audits</h2>
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(v => !v)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-900 text-white cursor-pointer text-xs font-semibold rounded-md hover:bg-black transition-colors"
          >
            <span className="material-symbols-outlined leading-none" style={{ fontSize: '13px' }}>add</span>
            New Audit
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
              className={`transition-transform duration-150 ${dropdownOpen ? 'rotate-180' : ''}`}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-64 bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 z-50">
              {AUDIT_MENU.map((item, i) => (
                <button
                  key={item.key}
                  disabled={!item.active}
                  onClick={() => { setActiveId('new'); setDropdownOpen(false) }}
                  className={`w-full text-left px-3.5 py-2.5 flex items-start gap-3 transition-colors
                    ${item.active ? 'hover:bg-gray-50 cursor-pointer' : 'opacity-40 cursor-not-allowed'}
                    ${i > 0 ? 'border-t border-gray-50' : ''}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-[#2B2B2B]">{item.label}</span>
                      {!item.active && (
                        <span className="text-[9px] font-semibold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full leading-none">
                          Soon
                        </span>
                      )}
                    </div>
                    {item.sub && <p className="text-[10px] text-gray-400 mt-0.5 truncate">{item.sub}</p>}
                  </div>
                  {item.active && (
                    <svg className="text-gray-300 mt-0.5 flex-shrink-0" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        <div className="relative">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="appearance-none border border-[#D4D4D4] rounded-md pl-3 pr-8 py-1.5 text-sm focus:border-[#2B2B2B] focus:outline-none bg-white cursor-pointer"
          >
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="submitted">Submitted</option>
            <option value="approved">Approved</option>
          </select>
          <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-[#B3B3B3]" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
        <div className="relative">
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="appearance-none border border-[#D4D4D4] rounded-md pl-3 pr-8 py-1.5 text-sm focus:border-[#2B2B2B] focus:outline-none bg-white cursor-pointer"
          >
            <option value="">All types</option>
            {Object.entries(TYPE_LABEL).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          <svg className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-[#B3B3B3]" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </div>

      {loading && (
        <div className="flex flex-col gap-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-4 rounded-xl bg-gray-100 animate-pulse">
              <div className="w-9 h-9 rounded-xl bg-[#D4D4D4] flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-3.5 w-40 bg-[#D4D4D4] rounded-md" />
                  <div className="h-3.5 w-16 bg-[#D4D4D4] rounded-md" />
                  <div className="h-4 w-16 bg-[#D4D4D4] rounded-full" />
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-24 bg-[#EBEBEB] rounded-md" />
                  <div className="h-2.5 w-20 bg-[#EBEBEB] rounded-md" />
                  <div className="h-2.5 w-28 bg-[#EBEBEB] rounded-md" />
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="h-7 w-14 bg-[#EBEBEB] rounded-lg" />
                <div className="h-7 w-16 bg-gray-100 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      )}
      {error && (
        <div className="text-sm text-red-500 py-4 px-3 bg-red-50 rounded-lg">{error}</div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="text-center py-16">
          <span className="material-symbols-outlined text-5xl text-gray-200 block mb-2">factory</span>
          <p className="text-sm text-gray-400 mb-1">No audits found</p>
          {!statusFilter && !typeFilter && (
            <button
              onClick={() => setActiveId('new')}
              className="text-sm text-black underline underline-offset-2 hover:no-underline cursor-pointer"
            >
              Create the first audit
            </button>
          )}
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="flex flex-col gap-2">
          {filtered.map(audit => {
            const authorName = audit.organization_members?.full_name
            const isOwn = audit.auditor_id === memberId
            const isExporting = exportingId === audit.id
            const canExport = audit.status !== 'draft'

            const iconCls = TYPE_ICON_CLS[audit.audit_type] ?? 'bg-gray-800'
            const typeCls = TYPE_TEXT_CLS[audit.audit_type] ?? 'text-gray-500'

            return (
              <div
                key={audit.id}
                className="flex items-center gap-4 px-5 py-4 rounded-xl bg-gray-100 hover:bg-gray-200 cursor-pointer transition-colors"
                onClick={() => setActiveId(audit.id)}
              >
                {/* Colored icon by audit type */}
                <div className={`w-9 h-9 rounded-xl ${iconCls} flex items-center justify-center flex-shrink-0 shadow-sm`}>
                  <span className="material-symbols-outlined text-white" style={{ fontSize: '16px' }}>description</span>
                </div>

                {/* Main content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-sm font-semibold text-gray-900 truncate">
                      {audit.organizations?.display_name ?? '—'}
                    </span>
                    <span className={`text-xs font-semibold ${typeCls}`}>{TYPE_LABEL[audit.audit_type] ?? audit.audit_type}</span>
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize ${STATUS_STYLE[audit.status] ?? 'bg-gray-100 text-gray-500'}`}>
                      {audit.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500 flex-wrap">
                    {(audit.product_categories ?? []).length > 0 && (
                      <>
                        <span className="text-gray-600 font-medium">
                          {audit.product_categories.map(c => c.name).join(', ')}
                        </span>
                        <span className="text-gray-400">·</span>
                      </>
                    )}
                    <span className="flex items-center gap-1">
                      <span className="material-symbols-outlined leading-none" style={{ fontSize: '11px' }}>calendar_today</span>
                      {fmtDate(audit.assessment_date)}
                    </span>
                    {!isOwn && authorName && (
                      <>
                        <span className="text-gray-400">·</span>
                        <span className="flex items-center gap-1">
                          <span className="material-symbols-outlined leading-none" style={{ fontSize: '11px' }}>person</span>
                          {authorName}
                        </span>
                      </>
                    )}
                    {audit.status !== 'draft' && audit.updated_at && (
                      <>
                        <span className="text-gray-400">·</span>
                        <span>Submitted {fmtDate(audit.updated_at)}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Action buttons — visible on hover */}
                <div className="flex items-center gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => setActiveId(audit.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
                  >
                    <span className="material-symbols-outlined leading-none" style={{ fontSize: '13px' }}>visibility</span>
                    View
                  </button>
                  {canExport && (
                    <button
                      onClick={e => handleExport(e, audit)}
                      disabled={isExporting}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isExporting
                        ? <span className="material-symbols-outlined leading-none animate-spin" style={{ fontSize: '13px' }}>progress_activity</span>
                        : <span className="material-symbols-outlined leading-none" style={{ fontSize: '13px' }}>download</span>
                      }
                      {isExporting ? 'Exporting…' : 'Export'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}