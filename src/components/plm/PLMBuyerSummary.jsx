import { useState, useMemo } from 'react'
import { BUYER_STAGES, buildCategoryStageMatrix, buildFactoryCategoryMatrix, buildSummaryText, labelForStage } from '../../utils/plmBuyerSummary'

const TH = 'px-4 py-3.5 text-[10px] font-bold uppercase tracking-[.06em] text-white text-right whitespace-nowrap'
const TD = 'px-4 py-3.5 text-[12px] text-right tabular-nums text-black/70'

function BackIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}

function ContentViewIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1.5" y="2.5" width="13" height="3" rx="0.5" />
      <rect x="1.5" y="6.5" width="13" height="3" rx="0.5" />
      <rect x="1.5" y="10.5" width="13" height="3" rx="0.5" />
    </svg>
  )
}

function TileViewIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="0.5" />
      <rect x="9" y="1.5" width="5.5" height="5.5" rx="0.5" />
      <rect x="1.5" y="9" width="5.5" height="5.5" rx="0.5" />
      <rect x="9" y="9" width="5.5" height="5.5" rx="0.5" />
    </svg>
  )
}

// Toggle between the dense table (Content view) and the big-image 3-per-row grid (Tile view)
// for the drill-in SKU list — same idea as PLMSummaryTable's list, just two ways to browse it.
function ViewModeToggle({ viewMode, setViewMode }) {
  return (
    <div className="hidden md:flex rounded-md border border-black/15 bg-white p-0.5">
      {[
        { key: 'content', label: 'Content', Icon: ContentViewIcon },
        { key: 'tile',    label: 'Tile',    Icon: TileViewIcon },
      ].map(({ key, label, Icon }) => (
        <button
          key={key}
          type="button"
          onClick={() => setViewMode(key)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-[.06em] rounded transition-colors cursor-pointer
            ${viewMode === key ? 'bg-[#1A1A18] text-white' : 'text-black/60 hover:bg-black/[.05]'}`}
        >
          <Icon /> {label}
        </button>
      ))}
    </div>
  )
}

// Toggle between the "By Category & Stage" and "By Factory" matrices — same look as
// ViewModeToggle above, just a different pair of options, so only one table shows at a time.
function SummaryViewToggle({ summaryView, setSummaryView }) {
  return (
    <div className="flex rounded-md border border-black/15 bg-white p-0.5 w-fit">
      {[
        { key: 'category', label: 'By Category & Stage' },
        { key: 'factory',  label: 'By Factory' },
      ].map(({ key, label }) => (
        <button
          key={key}
          type="button"
          onClick={() => setSummaryView(key)}
          className={`px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-[.06em] rounded transition-colors cursor-pointer whitespace-nowrap
            ${summaryView === key ? 'bg-[#1A1A18] text-white' : 'text-black/60 hover:bg-black/[.05]'}`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

// Count cell — a plain number when empty, a clickable button when it has SKUs behind it.
function CountCell({ count, onClick }) {
  if (!count) return <td className={TD}><span className="text-black/25">—</span></td>
  return (
    <td className="px-4 py-3.5 text-right">
      <button
        onClick={onClick}
        className="text-[12px] font-bold tabular-nums text-[#1A3A8A] hover:underline cursor-pointer border-none bg-none p-0"
      >
        {count}
      </button>
    </td>
  )
}

// Text-triggered ("Summary" button in PLMSidebar) buyer report — a category×stage and a
// factory×category breakdown for one buyer at a time, plus a one-line auto-generated summary.
// Deliberately separate from PLMSummaryTable (the SVG icon's gap-bucket view) — different data
// shape (pipeline stage vs. data gaps) and different scope (one buyer vs. the whole catalog).
// Every cell count doubles as a drill-in trigger (same idea as PLMSummaryTable's buckets) —
// clicking it swaps the two tables out for a plain SKU list scoped to that cell.
export default function PLMBuyerSummary({ skus, buyerName, onOpenWorkspace }) {
  const [activeCell, setActiveCell] = useState(null) // { title, tab, skus } | null
  const [viewMode,   setViewMode]   = useState('content') // 'content' | 'tile'
  const [summaryView, setSummaryView] = useState('category') // 'category' | 'factory'

  const categoryMatrix = useMemo(() => buildCategoryStageMatrix(skus), [skus])
  const factoryMatrix  = useMemo(() => buildFactoryCategoryMatrix(skus), [skus])
  const summaryText    = useMemo(() => buildSummaryText(buyerName, categoryMatrix), [buyerName, categoryMatrix])

  if (activeCell) {
    return (
      <div className="flex flex-col gap-3 pt-5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            <button
              onClick={() => setActiveCell(null)}
              className="flex items-center gap-1 text-[9px] sm:text-[10px] font-bold uppercase tracking-[.06em] text-black/60 hover:text-black cursor-pointer border-none bg-none px-0 whitespace-nowrap flex-shrink-0"
            >
              <BackIcon /> <span className="hidden sm:inline">Product Development Summary</span><span className="sm:hidden">Summary</span>
            </button>
            <span className="text-black/30 flex-shrink-0">/</span>
            <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-[.06em] text-[#1A1A18] truncate">
              {activeCell.title} ({activeCell.skus.length})
            </span>
          </div>
          <ViewModeToggle viewMode={viewMode} setViewMode={setViewMode} />
        </div>

        {/* Mobile: stacked cards, no horizontal scroll and no columns hidden off-screen —
            the table below cuts off Description/Buyer Ref/Open on narrow viewports. */}
        <div className="flex flex-col gap-3 md:hidden">
          {activeCell.skus.map(sku => (
            <div
              key={sku.id}
              onClick={() => onOpenWorkspace?.(sku, activeCell.tab)}
              className="flex gap-3 border border-black/10 rounded-md p-3 bg-white cursor-pointer active:bg-black/[.02]"
            >
              <div className="w-16 h-16 flex-shrink-0 bg-black/[.04] overflow-hidden rounded-sm">
                {sku.image_url && <img src={sku.image_url} alt="" className="w-full h-full object-contain" />}
              </div>
              <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                <span className="text-[13px] font-bold font-mono text-[#1A1A18]">{sku.auto_code}</span>
                <span className="text-[12px] text-black/70 truncate">{sku.supplier || <span className="text-black/25">—</span>}</span>
                <span className="text-[12px] text-black/70 line-clamp-2">{sku.description || <span className="text-black/25">—</span>}</span>
                <span className="text-[11px] text-black/50">Buyer Ref: {sku.buyer_ref || '—'}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); onOpenWorkspace?.(sku, activeCell.tab) }}
                  className="mt-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.06em] bg-[#1A1A18] text-white cursor-pointer hover:opacity-80 whitespace-nowrap rounded-sm self-start"
                >
                  Open
                </button>
              </div>
            </div>
          ))}
          {!activeCell.skus.length && (
            <div className="text-center py-10 text-[11px] text-black/40">Nothing here.</div>
          )}
        </div>

        {/* Tile view is the same table as Content view, just with much taller rows
            (bigger image, bigger text) — not a grid of boxes. Desktop/tablet only —
            mobile uses the stacked card list above instead. */}
        <div className="hidden md:block border border-black/10 overflow-x-auto rounded-sm">
          <table className="w-full text-left border-collapse min-w-[760px]">
            <thead>
              <tr className="bg-[#1A1A18]">
                <th className={`px-3 py-2 xl:px-4 xl:py-3.5 text-[9px] xl:text-[10px] font-bold uppercase tracking-[.06em] text-white ${viewMode === 'tile' ? 'w-24 xl:w-32' : 'w-12 xl:w-16'}`}></th>
                <th className="px-3 py-2 xl:px-4 xl:py-3.5 text-[9px] xl:text-[10px] font-bold uppercase tracking-[.06em] text-white">SKU</th>
                <th className="px-3 py-2 xl:px-4 xl:py-3.5 text-[9px] xl:text-[10px] font-bold uppercase tracking-[.06em] text-white">Vendor</th>
                <th className="px-3 py-2 xl:px-4 xl:py-3.5 text-[9px] xl:text-[10px] font-bold uppercase tracking-[.06em] text-white">Description</th>
                <th className="px-3 py-2 xl:px-4 xl:py-3.5 text-[9px] xl:text-[10px] font-bold uppercase tracking-[.06em] text-white">Buyer Ref</th>
                <th className="px-3 py-2 xl:px-4 xl:py-3.5 text-[9px] xl:text-[10px] font-bold uppercase tracking-[.06em] text-white w-16 xl:w-20"></th>
              </tr>
            </thead>
            <tbody>
              {activeCell.skus.map(sku => (
                <tr
                  key={sku.id}
                  onClick={() => onOpenWorkspace?.(sku, activeCell.tab)}
                  className="relative border-b border-black/[.06] last:border-0 bg-white hover:bg-white hover:shadow-[0_4px_14px_rgba(0,0,0,0.12)] hover:-translate-y-[1px] hover:z-10 active:translate-y-0 active:shadow-[0_1px_4px_rgba(0,0,0,0.12)] transition-all duration-150 cursor-pointer"
                >
                  <td className={viewMode === 'tile' ? 'px-3 py-2.5 sm:px-4 sm:py-4 md:py-5 xl:px-5 xl:py-5' : 'px-3 py-2 xl:px-4 xl:py-3.5'}>
                    <div className={`bg-black/[.04] overflow-hidden rounded-sm ${viewMode === 'tile' ? 'w-14 h-14 sm:w-20 sm:h-20 md:w-28 md:h-28 xl:w-[120px] xl:h-[120px]' : 'w-11 h-11 xl:w-14 xl:h-14'}`}>
                      {sku.image_url && <img src={sku.image_url} alt="" className="w-full h-full object-contain" />}
                    </div>
                  </td>
                  <td className={`font-bold font-mono text-[#1A1A18] whitespace-nowrap ${viewMode === 'tile' ? 'px-3 py-2.5 sm:px-4 sm:py-4 md:py-5 xl:px-5 xl:py-5 text-[12px] sm:text-[14px] xl:text-[17px]' : 'px-3 py-2 xl:px-4 xl:py-3.5 text-[11px] xl:text-[12px]'}`}>{sku.auto_code}</td>
                  <td className={`text-black/70 whitespace-nowrap ${viewMode === 'tile' ? 'px-3 py-2.5 sm:px-4 sm:py-4 md:py-5 xl:px-5 xl:py-5 text-[11px] sm:text-[13px] xl:text-[15px]' : 'px-3 py-2 xl:px-4 xl:py-3.5 text-[11px] xl:text-[12px]'}`}>{sku.supplier || <span className="text-black/25">—</span>}</td>
                  <td className={`text-black/70 max-w-[220px] xl:max-w-[320px] truncate ${viewMode === 'tile' ? 'px-3 py-2.5 sm:px-4 sm:py-4 md:py-5 xl:px-5 xl:py-5 text-[11px] sm:text-[13px] xl:text-[15px]' : 'px-3 py-2 xl:px-4 xl:py-3.5 text-[11px] xl:text-[12px]'}`}>{sku.description || <span className="text-black/25">—</span>}</td>
                  <td className={`text-black/60 whitespace-nowrap ${viewMode === 'tile' ? 'px-3 py-2.5 sm:px-4 sm:py-4 md:py-5 xl:px-5 xl:py-5 text-[11px] sm:text-[13px] xl:text-[15px]' : 'px-3 py-2 xl:px-4 xl:py-3.5 text-[11px] xl:text-[12px]'}`}>{sku.buyer_ref || '—'}</td>
                  <td className={viewMode === 'tile' ? 'px-3 py-2.5 sm:px-4 sm:py-4 md:py-5 xl:px-5 xl:py-5' : 'px-3 py-2 xl:px-4 xl:py-3.5'}>
                    <button
                      onClick={(e) => { e.stopPropagation(); onOpenWorkspace?.(sku, activeCell.tab) }}
                      className={`font-bold uppercase tracking-[.06em] bg-[#1A1A18] text-white cursor-pointer hover:opacity-80 whitespace-nowrap rounded-sm ${viewMode === 'tile' ? 'px-4 py-3 text-[12px] xl:text-[13px]' : 'px-2.5 py-1.5 xl:px-3 xl:py-2 text-[10px] xl:text-[11px]'}`}
                    >
                      Open
                    </button>
                  </td>
                </tr>
              ))}
              {!activeCell.skus.length && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 xl:px-4 xl:py-10 text-center text-[11px] xl:text-[12px] text-black/40">Nothing here.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5 pt-5 pb-8">
      <div className="flex items-baseline gap-2">
        <span className="text-[15px] font-bold uppercase tracking-[.06em] text-[#1A1A18]">Product Development Summary</span>
        <span className="text-[15px] font-bold text-[#1A1A18]">{buyerName}</span>
      </div>

      <div className="text-[12px] leading-relaxed text-[#1A1A18] bg-black/[.03] border border-black/10 rounded-sm px-4 py-3">
        {summaryText}
      </div>

      {!categoryMatrix.grandTotal ? (
        <div className="text-center py-10 text-[11px] text-black/40">No SKUs in development for this buyer.</div>
      ) : (
        <>
          <SummaryViewToggle summaryView={summaryView} setSummaryView={setSummaryView} />

          {summaryView === 'category' && (
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[.06em] text-black/60">By Category &amp; Stage</span>
            <div className="border border-black/10 overflow-x-auto rounded-sm">
              <table className="w-full text-left border-collapse min-w-[860px]">
                <thead>
                  <tr className="bg-[#1A1A18]">
                    <th className="px-4 py-3.5 text-[10px] font-bold uppercase tracking-[.06em] text-white">Category</th>
                    {BUYER_STAGES.map(s => <th key={s.key} className={TH}>{labelForStage(s.key, buyerName)}</th>)}
                    <th className="px-4 py-3.5 text-[10px] font-bold uppercase tracking-[.06em] text-white text-right whitespace-nowrap">Total in Development</th>
                  </tr>
                </thead>
                <tbody>
                  {categoryMatrix.rows.map(row => (
                    <tr key={row.category} className="border-b border-black/[.06] last:border-0">
                      <td className="px-4 py-3.5 text-[12px] font-bold text-[#1A1A18] whitespace-nowrap">{row.category}</td>
                      {BUYER_STAGES.map(s => (
                        <CountCell
                          key={s.key}
                          count={row.counts[s.key]}
                          onClick={() => setActiveCell({
                            title: `${row.category} — ${labelForStage(s.key, buyerName)}`,
                            tab: s.tab,
                            skus: row.cellSkus[s.key],
                          })}
                        />
                      ))}
                      <td className="px-4 py-3.5 text-[12px] font-bold text-right tabular-nums text-[#1A1A18]">{row.total}</td>
                    </tr>
                  ))}
                  <tr className="bg-black/[.04] font-bold">
                    <td className="px-4 py-3.5 text-[12px] text-[#1A1A18]">Total</td>
                    {BUYER_STAGES.map(s => (
                      <td key={s.key} className="px-4 py-3.5 text-[12px] text-right tabular-nums text-[#1A1A18]">{categoryMatrix.totals[s.key]}</td>
                    ))}
                    <td className="px-4 py-3.5 text-[12px] text-right tabular-nums text-[#1A1A18]">{categoryMatrix.grandTotal}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          )}

          {summaryView === 'factory' && (
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[.06em] text-black/60">By Factory</span>
            <div className="border border-black/10 overflow-x-auto rounded-sm">
              <table className="w-full text-left border-collapse min-w-[560px]">
                <thead>
                  <tr className="bg-[#1A1A18]">
                    <th className="px-4 py-3.5 text-[10px] font-bold uppercase tracking-[.06em] text-white">Factory</th>
                    {factoryMatrix.categories.map(c => <th key={c} className={TH}>{c}</th>)}
                    <th className="px-4 py-3.5 text-[10px] font-bold uppercase tracking-[.06em] text-white text-right whitespace-nowrap">Total in Development</th>
                  </tr>
                </thead>
                <tbody>
                  {factoryMatrix.rows.map(row => (
                    <tr key={row.factory} className="border-b border-black/[.06] last:border-0">
                      <td className="px-4 py-3.5 text-[12px] font-bold text-[#1A1A18] whitespace-nowrap">{row.factory}</td>
                      {factoryMatrix.categories.map(c => (
                        <CountCell
                          key={c}
                          count={row.counts[c]}
                          onClick={() => setActiveCell({
                            title: `${row.factory} — ${c}`,
                            tab: null,
                            skus: row.cellSkus[c],
                          })}
                        />
                      ))}
                      <td className="px-4 py-3.5 text-[12px] font-bold text-right tabular-nums text-[#1A1A18]">{row.total}</td>
                    </tr>
                  ))}
                  <tr className="bg-black/[.04] font-bold">
                    <td className="px-4 py-3.5 text-[12px] text-[#1A1A18]">Total</td>
                    {factoryMatrix.categories.map(c => (
                      <td key={c} className="px-4 py-3.5 text-[12px] text-right tabular-nums text-[#1A1A18]">{factoryMatrix.totals[c]}</td>
                    ))}
                    <td className="px-4 py-3.5 text-[12px] text-right tabular-nums text-[#1A1A18]">{factoryMatrix.grandTotal}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          )}
        </>
      )}
    </div>
  )
}
