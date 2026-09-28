import { useState, useMemo, useRef, useEffect } from 'react'
import { usePlmStore } from '../../stores/plmStore'
import FilterDropdown from './FilterDropdown'
import { ChevronDown } from 'lucide-react'

const ALL_FILTER_KEYS = ['season', 'status', 'member', 'buyer', 'supplier', 'buyerContact', 'supplierContact']
const FILTER_LABELS   = { season: 'Season', status: 'Status', member: 'Member', buyer: 'Buyer', supplier: 'Vendor', buyerContact: 'Buyer Contact', supplierContact: 'Vendor Contact' }

function FilterCustomizer({ visible, onToggle, keys = ALL_FILTER_KEYS }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  const allOn  = keys.every(k => visible.includes(k))
  const someOn = keys.some(k => visible.includes(k))

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        type="button"
        title="Customize filters"
        onClick={() => setOpen(v => !v)}
        className={`relative flex items-center justify-center w-7 h-7 rounded-lg border transition-colors
          ${!allOn ? 'border-[#1A1A18]/60 bg-[#1A1A18]/[.06]' : 'border-black/20 bg-white hover:border-black/40'}`}
      >
        {!allOn && (
          <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[#1A1A18] border border-white" />
        )}
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/>
          <circle cx="19" cy="6" r="2" fill="currentColor" stroke="none"/><circle cx="6" cy="12" r="2" fill="currentColor" stroke="none"/>
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 md:left-auto md:right-0 top-[calc(100%+6px)] z-[200] bg-[#F5F3EF] border border-black/[.18] w-[160px] max-w-[calc(100vw-2rem)] max-h-[280px] overflow-y-auto shadow-lg">
          <div className="px-2.5 py-1.5 border-b border-black/10 flex items-center justify-between gap-3">
            <span className="text-[8px] font-bold uppercase tracking-[.08em] text-black/35">Show filters</span>
            <button
              type="button"
              onClick={() => onToggle(allOn ? 'none' : 'all')}
              className="text-[8px] font-bold uppercase tracking-[.06em] text-black/40 hover:text-black/70 cursor-pointer"
            >
              {allOn ? 'Deselect all' : 'Select all'}
            </button>
          </div>
          {keys.map(key => {
            const on = visible.includes(key)
            return (
              <div
                key={key}
                onClick={() => onToggle(key)}
                className="flex items-center gap-2.5 px-2.5 py-1.5 cursor-pointer hover:bg-[#EDEAE4] transition-colors"
              >
                <div className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center flex-shrink-0 transition-colors
                  ${on ? 'bg-[#1A1A18] border-[#1A1A18]' : 'border-black/30 bg-white'}`}>
                  {on && (
                    <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
                      <polyline points="1.5 5 4 7.5 8.5 2.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
                <span className="text-[9px] font-semibold uppercase tracking-[.06em] text-[#1A1A18]">{FILTER_LABELS[key]}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const SORT_OPTIONS = [
  { value: 'all',        label: 'Newest First' },
  { value: 'date_asc',   label: 'Oldest First' },
  { value: 'alpha_asc',  label: 'A → Z' },
  { value: 'alpha_desc', label: 'Z → A' },
]

function SortButton({ value, onSelect }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const isActive = value !== 'all'

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        title={SORT_OPTIONS.find(o => o.value === value)?.label || 'Newest First'}
        className={`relative flex items-center justify-center w-7 h-7 rounded-lg border transition-colors
          ${isActive ? 'border-[#1A1A18]/60 bg-[#1A1A18]/[.06]' : 'border-black/20 bg-white hover:border-black/40'}`}
      >
        {isActive && (
          <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[#1A1A18] border border-white" />
        )}
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="6" x2="21" y2="6"/>
          <line x1="3" y1="12" x2="15" y2="12"/>
          <line x1="3" y1="18" x2="9" y2="18"/>
          <polyline points="19 15 22 18 19 21"/>
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 md:left-auto md:right-0 top-[calc(100%+6px)] z-[200] bg-[#F5F3EF] border border-black/[.18] w-[130px] max-w-[calc(100vw-2rem)] shadow-lg">
          <div className="px-2.5 py-1 text-[8px] font-bold uppercase tracking-[.08em] text-black/35 border-b border-black/10">
            Sort by
          </div>
          {SORT_OPTIONS.map(opt => (
            <div
              key={opt.value}
              onClick={() => { onSelect(opt.value); setOpen(false) }}
              className={`px-2.5 py-1.5 text-[9px] font-semibold uppercase tracking-[.06em] cursor-pointer transition-colors whitespace-nowrap flex items-center gap-1.5
                ${value === opt.value ? 'bg-black/5 text-[#1A1A18]' : 'text-[#1A1A18] hover:bg-[#EDEAE4]'}`}
            >
              {value === opt.value && <span className="w-1 h-1 rounded-full bg-[#1A1A18] flex-shrink-0" />}
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const SidebarToggleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path fillRule="evenodd" clipRule="evenodd" d="M9.67272 0.522841C10.8339 0.522841 11.76 0.522714 12.4963 0.602493C13.2453 0.683657 13.8789 0.854248 14.4264 1.25197C14.7504 1.48739 15.0355 1.77247 15.2709 2.0965C15.6686 2.64394 15.8392 3.27758 15.9204 4.02655C16.0002 4.7629 16 5.68895 16 6.85014V9.14986C16 10.3111 16.0002 11.2371 15.9204 11.9735C15.8392 12.7224 15.6686 13.3561 15.2709 13.9035C15.0355 14.2275 14.7504 14.5126 14.4264 14.748C13.8789 15.1458 13.2453 15.3163 12.4963 15.3975C11.76 15.4773 10.8339 15.4772 9.67272 15.4772H6.3273C5.16611 15.4772 4.24006 15.4773 3.50371 15.3975C2.75474 15.3163 2.1211 15.1458 1.57366 14.748C1.24963 14.5126 0.964549 14.2275 0.729131 13.9035C0.331407 13.3561 0.160817 12.7224 0.0796529 11.9735C-0.000126137 11.2371 1.25338e-09 10.3111 1.25338e-09 9.14986V6.85014C1.25329e-09 5.68895 -0.000126137 4.7629 0.0796529 4.02655C0.160817 3.27758 0.331407 2.64394 0.729131 2.0965C0.964549 1.77247 1.24963 1.48739 1.57366 1.25197C2.1211 0.854248 2.75474 0.683657 3.50371 0.602493C4.24006 0.522714 5.16611 0.522841 6.3273 0.522841H9.67272ZM5.54303 1.88715V14.1118C5.78636 14.1128 6.04709 14.1169 6.3273 14.1169H9.67272C10.8639 14.1169 11.7032 14.1164 12.3493 14.0465C12.9824 13.9779 13.3497 13.8494 13.6268 13.6482C13.8354 13.4966 14.0195 13.3125 14.1711 13.1039C14.3723 12.8268 14.5007 12.4595 14.5693 11.8264C14.6393 11.1803 14.6398 10.341 14.6398 9.14986V6.85014C14.6398 5.65896 14.6393 4.81967 14.5693 4.1736C14.5007 3.54048 14.3723 3.17318 14.1711 2.89609C14.0195 2.68747 13.8354 2.50337 13.6268 2.35179C13.3497 2.1506 12.9824 2.02212 12.3493 1.95353C11.7032 1.88358 10.8639 1.88307 9.67272 1.88307H6.3273C6.04709 1.88307 5.78636 1.8862 5.54303 1.88715ZM4.1828 1.91166C3.99125 1.9216 3.8148 1.93577 3.65076 1.95353C3.01764 2.02212 2.65034 2.1506 2.37325 2.35179C2.16463 2.50337 1.98052 2.68747 1.82895 2.89609C1.62776 3.17318 1.49928 3.54048 1.43069 4.1736C1.36074 4.81967 1.36023 5.65896 1.36023 6.85014V9.14986C1.36023 10.341 1.36074 11.1803 1.43069 11.8264C1.49928 12.4595 1.62776 12.8268 1.82895 13.1039C1.98052 13.3125 2.16463 13.4966 2.37325 13.6482C2.65034 13.8494 3.01764 13.9779 3.65076 14.0465C3.81478 14.0642 3.99127 14.0774 4.1828 14.0873V1.91166Z" fill="currentColor"/>
  </svg>
)

export default function PLMFilterBar({ seasonOptions, buyerOptions, supplierOptions, statusOptions, memberOptions, showMemberFilter, buyerContactOptions, supplierContactOptions, role, onUpload, onCreate, onBulkCreate, onCreateVendorSpec }) {
  const filters        = usePlmStore(s => s.filters)
  const setFilter      = usePlmStore(s => s.setFilter)
  const toggleSidebar  = usePlmStore(s => s.toggleSidebar)
  const categories     = usePlmStore(s => s.categories)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [uploadDropdownOpen, setUploadDropdownOpen] = useState(false)
  const uploadDropdownRef = useRef(null)
  const [mobileUploadDropdownOpen, setMobileUploadDropdownOpen] = useState(false)
  const mobileUploadDropdownRef = useRef(null)
  const [uploadMode, setUploadMode] = useState(() => localStorage.getItem('plm_upload_mode') || 'catalog')

  const [visibleFilters, setVisibleFilters] = useState(() => {
    try {
      const saved = localStorage.getItem('plm_visible_filters')
      return saved ? JSON.parse(saved) : ALL_FILTER_KEYS
    } catch { return ALL_FILTER_KEYS }
  })

  // Typing writes here immediately (so the input never feels laggy), and only pushes to the
  // store — which fans out into 9 full-array re-filters in usePLMFiltered plus a sidebar
  // category-count rebuild — after a short pause. Without this, every keystroke re-ran all of
  // that synchronously, which is very noticeable once the catalog is a few hundred+ SKUs.
  const [searchInput, setSearchInput] = useState(filters.search)
  // Stay in sync with external changes to filters.search (e.g. a filter-chip's "clear" or
  // "Clear all filters"). Adjusting state during render (React's recommended pattern for
  // "reset state when a prop changes") rather than in a useEffect avoids an extra render
  // round-trip and the "don't setState synchronously in an effect" lint rule.
  const [prevStoreSearch, setPrevStoreSearch] = useState(filters.search)
  if (filters.search !== prevStoreSearch) {
    setPrevStoreSearch(filters.search)
    setSearchInput(filters.search)
  }
  useEffect(() => {
    if (searchInput === filters.search) return
    const t = setTimeout(() => setFilter('search', searchInput), 300)
    return () => clearTimeout(t)
  }, [searchInput]) // eslint-disable-line react-hooks/exhaustive-deps -- intentionally NOT depending on filters.search; adding it would re-fire this debounce on every store-driven change too

  // Filters that make sense for this role. A buyer only ever sees one org's SKUs (their own),
  // so a "Buyer" / "Buyer Contact" / "Member" (merchant-internal) filter is meaningless to
  // them; likewise "Vendor" / "Vendor Contact" / "Member" for a supplier. These are already
  // hidden from the toolbar by role — this also drops them from the "Show filters" menu.
  const availableFilterKeys =
    role === 'buyer'     ? ['season', 'status', 'supplier', 'supplierContact'] :
    role === 'supplier'  ? ['season', 'status', 'buyer', 'buyerContact'] :
    ALL_FILTER_KEYS

  const show = (key) => visibleFilters.includes(key)

  const handleFilterToggle = (key) => {
    setVisibleFilters(prev => {
      let next
      if (key === 'all')  next = [...availableFilterKeys]
      else if (key === 'none') next = []
      else next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
      localStorage.setItem('plm_visible_filters', JSON.stringify(next))
      return next
    })
  }

  const setMode = (mode) => {
    setUploadMode(mode)
    localStorage.setItem('plm_upload_mode', mode)
  }

  useEffect(() => {
    if (!uploadDropdownOpen) return
    const handler = (e) => {
      if (!uploadDropdownRef.current?.contains(e.target)) setUploadDropdownOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [uploadDropdownOpen])

  useEffect(() => {
    if (!mobileUploadDropdownOpen) return
    const handler = (e) => {
      if (!mobileUploadDropdownRef.current?.contains(e.target)) setMobileUploadDropdownOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [mobileUploadDropdownOpen])

  const showActions = role === 'merchant'

  const activeChips = useMemo(() => {
    const chips = []
    if (filters.search)
      chips.push({ key: 'search', label: `"${filters.search}"`, clear: () => setFilter('search', '') })
    if (filters.category !== 'all') {
      const cat = categories.find(c => c.id === filters.category)
      chips.push({ key: 'category', label: cat?.name || 'Category', clear: () => setFilter('category', 'all') })
    }
    if (filters.season !== 'all')
      chips.push({ key: 'season', label: filters.season, clear: () => setFilter('season', 'all') })
    if (filters.status !== 'all') {
      const opt = statusOptions.find(o => o.value === filters.status)
      chips.push({ key: 'status', label: opt?.label || filters.status, clear: () => setFilter('status', 'all') })
    }
    if (filters.member !== 'all') {
      const opt = memberOptions.find(o => o.value === filters.member)
      chips.push({ key: 'member', label: opt?.label || 'Unknown member', clear: () => setFilter('member', 'all') })
    }
    if (filters.buyer !== 'all') {
      const opt = buyerOptions.find(o => o.value === filters.buyer)
      chips.push({ key: 'buyer', label: opt?.label || 'Unknown buyer', clear: () => setFilter('buyer', 'all') })
    }
    if (filters.supplier !== 'all') {
      // supplierOptions is a plain string[] (the vendor names) — the filter value IS the
      // label, so show it directly; only fall back if it's somehow gone missing.
      chips.push({ key: 'supplier', label: filters.supplier || 'Unknown vendor', clear: () => setFilter('supplier', 'all') })
    }
    if (filters.buyerContact !== 'all')
      chips.push({ key: 'buyerContact', label: filters.buyerContact, clear: () => setFilter('buyerContact', 'all') })
    if (filters.supplierContact !== 'all')
      chips.push({ key: 'supplierContact', label: filters.supplierContact, clear: () => setFilter('supplierContact', 'all') })
    if (filters.sort !== 'all') {
      const opt = SORT_OPTIONS.find(o => o.value === filters.sort)
      chips.push({ key: 'sort', label: opt?.label || filters.sort, clear: () => setFilter('sort', 'all') })
    }
    return chips
  }, [filters, categories, statusOptions, memberOptions, buyerOptions, supplierOptions, setFilter])

  const clearAllFilters = () => {
    setFilter('season','all'); setFilter('status','all'); setFilter('member','all'); setFilter('buyer','all')
    setFilter('supplier','all'); setFilter('search',''); setFilter('category','all'); setFilter('sort','all')
    setFilter('buyerContact','all'); setFilter('supplierContact','all')
  }

  // The active-filter chips + "Clear all" — rendered in two places (a standalone row on phone
  // and desktop, inline in the actions row on tablet) so the tablet layout doesn't need a
  // whole extra row just for chips.
  const chipItems = activeChips.length > 0 && (
    <>
      {activeChips.map(chip => (
        <span
          key={chip.key}
          className="inline-flex items-center gap-1 bg-white text-[#1A1A18] text-[9px] font-semibold uppercase tracking-[.06em] px-2 py-1 rounded-full border border-black/20"
        >
          {chip.label}
          <button
            type="button"
            onClick={chip.clear}
            className="ml-0.5 hover:opacity-70 transition-opacity leading-none"
            aria-label={`Remove ${chip.key} filter`}
          >
            ×
          </button>
        </span>
      ))}
      {activeChips.length > 1 && (
        <button
          type="button"
          onClick={clearAllFilters}
          className="text-[9px] font-semibold uppercase tracking-[.06em] text-black/40 hover:text-black/70 transition-colors"
        >
          Clear all
        </button>
      )}
    </>
  )

  return (
    <div className="flex flex-col my-1.5 md:my-2 pb-1.5 md:pb-2 gap-1.5 md:gap-2">

      {/* Mobile: icon row + action buttons (stacked so nothing gets squeezed on small screens) */}
      <div className="flex flex-col gap-2 md:hidden">
        <div className="flex gap-2 items-center">
          <button
            type="button"
            title="Categories"
            onClick={toggleSidebar}
            className="border border-black/20 bg-white rounded-lg p-2.5 flex items-center justify-center text-[#1A1A18] hover:opacity-60 transition-opacity flex-shrink-0"
          >
            <SidebarToggleIcon />
          </button>
          <FilterCustomizer visible={visibleFilters} onToggle={handleFilterToggle} keys={availableFilterKeys} />
          <SortButton value={filters.sort} onSelect={v => setFilter('sort', v)} />
        </div>
        {showActions && (
          <div className="flex gap-2 items-center">
            <button
              type="button"
              onClick={onBulkCreate}
              className="flex-1 flex items-center justify-center gap-1 bg-black/80 rounded-lg px-2 py-2 text-[9px] font-bold text-white hover:bg-black transition-colors whitespace-nowrap"
            >
              + Create SKUs
            </button>
            <div className="relative flex-1 flex" ref={mobileUploadDropdownRef}>
              <button
                type="button"
                onClick={() => uploadMode === 'buyerSpec' ? onCreateVendorSpec?.() : onUpload?.()}
                className="flex-1 flex items-center justify-center gap-1 bg-white border border-orange-300 rounded-l-full pl-2 pr-1 py-2 text-[9px] font-bold text-orange-500 hover:border-orange-500 transition-colors whitespace-nowrap"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" className="flex-shrink-0">
                  <path d="M12 3L13.5 8.5L19 10L13.5 11.5L12 17L10.5 11.5L5 10L10.5 8.5L12 3Z" fill="#f97316"/>
                  <path d="M19 3L19.8 5.2L22 6L19.8 6.8L19 9L18.2 6.8L16 6L18.2 5.2L19 3Z" fill="#f97316" opacity=".6"/>
                </svg>
                {uploadMode === 'buyerSpec' ? 'Upload Spec' : 'Upload'}
              </button>
              <button
                type="button"
                onClick={() => setMobileUploadDropdownOpen(v => !v)}
                className="flex items-center justify-center bg-white border border-orange-300 border-l-orange-200 rounded-r-full px-1.5 py-2 text-orange-500 hover:border-orange-500 transition-colors"
              >
                <ChevronDown size={12} className={`transition-transform duration-150 ${mobileUploadDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {mobileUploadDropdownOpen && (
                <div className="absolute right-0 top-full mt-1.5 z-50 bg-white border border-black/10 shadow-xl rounded-lg min-w-[200px] py-1 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => { setMode('catalog'); setMobileUploadDropdownOpen(false); onUpload?.() }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-black/5 transition-colors text-left"
                  >
                    <span className="flex items-center justify-center w-7 h-7 rounded-md bg-orange-50 flex-shrink-0">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                        <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
                      </svg>
                    </span>
                    <span className="flex flex-col flex-1">
                      <span className="text-[11px] font-bold text-[#1A1A18]">Products Catalog</span>
                      <span className="text-[10px] text-black/50 mt-0.5">Upload vendor catalog</span>
                    </span>
                    {uploadMode === 'catalog' && (
                      <span className="w-1.5 h-1.5 rounded-full bg-orange-400 flex-shrink-0" />
                    )}
                  </button>
                  <div className="mx-3 border-t border-black/8" />
                  <button
                    type="button"
                    onClick={() => { setMode('buyerSpec'); setMobileUploadDropdownOpen(false); onCreateVendorSpec?.() }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-black/5 transition-colors text-left"
                  >
                    <span className="flex items-center justify-center w-7 h-7 rounded-md bg-orange-50 flex-shrink-0">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
                        <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
                        <line x1="9" y1="12" x2="15" y2="12"/>
                        <line x1="9" y1="16" x2="13" y2="16"/>
                      </svg>
                    </span>
                    <span className="flex flex-col flex-1">
                      <span className="text-[11px] font-bold text-[#1A1A18]">Upload Spec</span>
                      <span className="text-[10px] text-black/50 mt-0.5">Upload buyer spec</span>
                    </span>
                    {uploadMode === 'buyerSpec' && (
                      <span className="w-1.5 h-1.5 rounded-full bg-orange-400 flex-shrink-0" />
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Search + filters + action buttons.
          Below `xl` this is two rows: search + filter dropdowns fill row 1 (wrapping across
          the FULL width as needed), and the customize / sort / Create / Upload controls sit
          on row 2 below. At `xl`+ it collapses to a single row — with a merchant's full set
          of 7 filter dropdowns there just isn't room for one row before that. */}
      <div className="flex flex-wrap items-center justify-between gap-x-1.5 gap-y-2">
        {/* Row 1: search + (xl+) filter dropdowns.
            - phones (<md): `basis-full` — own row above the stacked action buttons
            - tablet/small-laptop (md–xl): `md:basis-auto` — the dropdowns are collapsed behind
              the Filters button here, so Row 1 is just search + Filters and shares one line
              with Row 2 (justify-between spreads them)
            - desktop (xl+): `xl:basis-0 xl:grow xl:shrink` (not the `flex-1` shorthand — its
              `flex-basis:0` would fight `basis-*`) so Row 1 shrinks to share the line with the
              now-inline dropdowns + Row 2. */}
        <div className="flex flex-wrap items-center gap-1.5 basis-full md:basis-auto xl:basis-0 xl:grow xl:shrink min-w-0">
        <div className="flex-1 md:flex-none ml-1.5">
          <input
            type="text"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') { setSearchInput(''); setFilter('search', '') } }}
            placeholder="Search SKUs…"
            className="border-b border-black/20 bg-transparent px-1 py-1.5 text-[11px] uppercase tracking-[.02em] outline-none w-full md:w-[150px] lg:w-[200px] focus:border-black/60 transition-colors placeholder:text-black/35 placeholder:normal-case placeholder:tracking-normal"
          />
        </div>

        {/* Filter toggle — shown below xl (phones + tablets + small laptops) so the filter
            dropdowns stay collapsed behind it instead of eating 3-4 toolbar rows. */}
        <div className="xl:hidden flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFiltersOpen(v => !v)}
            className={`flex items-center gap-1.5 border rounded-md px-3 py-1.5 text-[11px] font-bold uppercase tracking-[.05em] transition-colors whitespace-nowrap text-black ${
              filtersOpen
                ? 'bg-black/[.06] border-black/40'
                : 'bg-white border-black/20 hover:border-black/40'
            }`}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="4" y1="6" x2="20" y2="6"/>
              <line x1="8" y1="12" x2="16" y2="12"/>
              <line x1="11" y1="18" x2="13" y2="18"/>
            </svg>
            Filters
          </button>
        </div>

        {/* Desktop (xl+) only: filter dropdowns inline. `contents` (not a flex box) so each
            dropdown is a direct flex child of Row 1 and flows right after the search box,
            wrapping one at a time. Below xl these are collapsed behind the Filters toggle. */}
        <div className="hidden xl:contents">
          {show('season') && (
            <FilterDropdown placeholder="Season" options={seasonOptions} value={filters.season} onSelect={v => setFilter('season', v)} />
          )}
          {show('status') && (
            <FilterDropdown placeholder="Status" options={statusOptions} value={filters.status} onSelect={v => setFilter('status', v)} />
          )}
          {/* Member/contact filters only apply once their options list is non-empty — which for
              a MERCHANT (admin/tech) account only becomes true after the org-wide overlay catalog
              lands *after* the early-paint own-catalog render. Mounting/unmounting them at that
              point reflows this flex-wrap row (and everything below it) — a real, confirmed CLS
              driver (Lighthouse's "layout shift culprits" traced back to exactly this row) — so
              for the merchant view they stay always-mounted with `invisible`, reserving a stable
              width. A buyer/supplier catalog is a single fetch (no overlay), so their options are
              known at first paint: for them we just mount when there's something to show and skip
              the reserved slot entirely — otherwise it's a permanent empty gap in their toolbar. */}
          {show('member') && role === 'merchant' && (
            <div className={showMemberFilter ? '' : 'invisible pointer-events-none'}>
              <FilterDropdown placeholder="Member" options={memberOptions} value={filters.member} onSelect={v => setFilter('member', v)} />
            </div>
          )}
          {show('buyer') && role !== 'buyer' && (
            <FilterDropdown placeholder="Buyer" options={buyerOptions} value={filters.buyer} onSelect={v => setFilter('buyer', v)} />
          )}
          {show('supplier') && role !== 'supplier' && (
            <FilterDropdown placeholder="Vendor" options={supplierOptions} value={filters.supplier} onSelect={v => setFilter('supplier', v)} />
          )}
          {show('buyerContact') && role !== 'buyer' && (
            role === 'merchant'
              ? <div className={buyerContactOptions?.length > 0 ? '' : 'invisible pointer-events-none'}>
                  <FilterDropdown placeholder="Buyer Ct." options={buyerContactOptions || []} value={filters.buyerContact} onSelect={v => setFilter('buyerContact', v)} />
                </div>
              : buyerContactOptions?.length > 0 && (
                  <FilterDropdown placeholder="Buyer Ct." options={buyerContactOptions} value={filters.buyerContact} onSelect={v => setFilter('buyerContact', v)} />
                )
          )}
          {show('supplierContact') && role !== 'supplier' && (
            role === 'merchant'
              ? <div className={supplierContactOptions?.length > 0 ? '' : 'invisible pointer-events-none'}>
                  <FilterDropdown placeholder="Vendor Ct." options={supplierContactOptions || []} value={filters.supplierContact} onSelect={v => setFilter('supplierContact', v)} />
                </div>
              : supplierContactOptions?.length > 0 && (
                  <FilterDropdown placeholder="Vendor Ct." options={supplierContactOptions} value={filters.supplierContact} onSelect={v => setFilter('supplierContact', v)} />
                )
          )}
        </div>
        </div>{/* /Row 1 */}

        {/* Row 2: shares a line with Row 1 from `md` up (on tablet Row 1 is only search +
            Filters, so there's room). Only drops to its own line if the window is too narrow
            for both, via flex-wrap. */}
        <div className="hidden md:flex items-center gap-1.5 flex-shrink-0 basis-full md:basis-auto justify-end md:justify-start flex-wrap">
          <FilterCustomizer visible={visibleFilters} onToggle={handleFilterToggle} keys={availableFilterKeys} />
          <SortButton value={filters.sort} onSelect={v => setFilter('sort', v)} />
          {showActions && (<>
            <button
              type="button"
              onClick={onBulkCreate}
              className="inline-flex items-center gap-1.5 bg-black/80 rounded-lg px-2.5 py-1 lg:px-3.5 lg:py-1.5 text-[10px] lg:text-[11px] font-bold text-white cursor-pointer hover:bg-black transition-colors whitespace-nowrap"
            >
              Create SKU Cards
            </button>
            <div className="relative inline-flex" ref={uploadDropdownRef}>
              <button
                type="button"
                onClick={() => uploadMode === 'buyerSpec' ? onCreateVendorSpec?.() : onUpload?.()}
                className="inline-flex items-center gap-1 xl:gap-1.5 bg-white border border-orange-300 rounded-l-full pl-2.5 pr-2 py-1 xl:pl-3.5 xl:pr-2.5 xl:py-1.5 text-[10px] xl:text-[11px] font-bold text-orange-500 cursor-pointer hover:border-orange-500 transition-colors whitespace-nowrap"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="flex-shrink-0 xl:w-[13px] xl:h-[13px]">
                  <path d="M12 3L13.5 8.5L19 10L13.5 11.5L12 17L10.5 11.5L5 10L10.5 8.5L12 3Z" fill="#f97316"/>
                  <path d="M19 3L19.8 5.2L22 6L19.8 6.8L19 9L18.2 6.8L16 6L18.2 5.2L19 3Z" fill="#f97316" opacity=".6"/>
                </svg>
                {uploadMode === 'buyerSpec'
                  ? 'Upload Spec'
                  : <><span className="xl:hidden">Upload</span><span className="hidden xl:inline">Upload Products</span></>}
                <span className="hidden lg:inline-flex items-center gap-1 text-[9px] font-bold text-black bg-gray-100 px-2 py-1 rounded-lg uppercase tracking-[.06em]">
                  AI <span className="text-[8px]">Beta</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => setUploadDropdownOpen(v => !v)}
                className="inline-flex items-center bg-white border border-orange-300 border-l-orange-200 rounded-r-full px-2 py-1 xl:px-2.5 xl:py-1.5 text-orange-500 cursor-pointer hover:border-orange-500 transition-colors"
              >
                <ChevronDown size={13} className={`transition-transform duration-150 ${uploadDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {uploadDropdownOpen && (
                <div className="absolute right-2 top-full mt-1.5 z-50 bg-white border border-black/10 shadow-xl rounded-lg min-w-[200px] py-1 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => { setMode('catalog'); setUploadDropdownOpen(false); onUpload?.() }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-black/5 transition-colors text-left"
                  >
                    <span className="flex items-center justify-center w-7 h-7 rounded-md bg-orange-50 flex-shrink-0">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                        <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
                      </svg>
                    </span>
                    <span className="flex flex-col flex-1">
                      <span className="text-[11px] font-bold text-[#1A1A18]">Products Catalog</span>
                      <span className="text-[10px] text-black/50 mt-0.5">Upload vendor catalog</span>
                    </span>
                    {uploadMode === 'catalog' && (
                      <span className="w-1.5 h-1.5 rounded-full bg-orange-400 flex-shrink-0" />
                    )}
                  </button>
                  <div className="mx-3 border-t border-black/8" />
                  <button
                    type="button"
                    onClick={() => { setMode('buyerSpec'); setUploadDropdownOpen(false); onCreateVendorSpec?.() }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-black/5 transition-colors text-left"
                  >
                    <span className="flex items-center justify-center w-7 h-7 rounded-md bg-orange-50 flex-shrink-0">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
                        <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
                        <line x1="9" y1="12" x2="15" y2="12"/>
                        <line x1="9" y1="16" x2="13" y2="16"/>
                      </svg>
                    </span>
                    <span className="flex flex-col flex-1">
                      <span className="text-[11px] font-bold text-[#1A1A18]">Upload Spec</span>
                      <span className="text-[10px] text-black/50 mt-0.5">Upload buyer spec</span>
                    </span>
                    {uploadMode === 'buyerSpec' && (
                      <span className="w-1.5 h-1.5 rounded-full bg-orange-400 flex-shrink-0" />
                    )}
                  </button>
                </div>
              )}
            </div>
          </>)}
        </div>
      </div>

      {/* Expanded filter dropdowns (below xl) — toggled open from the Filters button. */}
      {filtersOpen && (
        <div className="xl:hidden flex flex-wrap gap-2 pt-1 pb-2">
          {show('season') && <FilterDropdown placeholder="Season" options={seasonOptions} value={filters.season} onSelect={v => setFilter('season', v)} />}
          {show('status') && <FilterDropdown placeholder="Status" options={statusOptions} value={filters.status} onSelect={v => setFilter('status', v)} />}
          {show('member') && showMemberFilter && <FilterDropdown placeholder="Member" options={memberOptions} value={filters.member} onSelect={v => setFilter('member', v)} />}
          {show('buyer') && role !== 'buyer' && <FilterDropdown placeholder="Buyer" options={buyerOptions} value={filters.buyer} onSelect={v => setFilter('buyer', v)} />}
          {show('supplier') && role !== 'supplier' && <FilterDropdown placeholder="Vendor" options={supplierOptions} value={filters.supplier} onSelect={v => setFilter('supplier', v)} />}
          {show('buyerContact') && role !== 'buyer' && buyerContactOptions?.length > 0 && <FilterDropdown placeholder="Buyer Contact" options={buyerContactOptions} value={filters.buyerContact} onSelect={v => setFilter('buyerContact', v)} />}
          {show('supplierContact') && role !== 'supplier' && supplierContactOptions?.length > 0 && <FilterDropdown placeholder="Vendor Contact" options={supplierContactOptions} value={filters.supplierContact} onSelect={v => setFilter('supplierContact', v)} />}
        </div>
      )}

      {/* Active filter chips — standalone row, visible on all screen sizes */}
      {activeChips.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap ml-1.5 mt-1 pt-1.5">
          {chipItems}
        </div>
      )}
    </div>
  )
}