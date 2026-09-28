import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMemberId } from '../../stores/profileStore'
import { skuToConfirmedFields } from '../../hooks/useSkuImport'
import { useMaterialOptions } from '../../hooks/useMaterialOptions'
import { supabase } from '../../lib/supabase'
import { publicUrl } from './poUtils'
import SkuDetailDrawer from './SkuDetailDrawer'
import SkuReviewDrawer from './SkuReviewDrawer'

const PAGE_SIZE = 25

const selectCls = 'px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-900 bg-white focus:outline-none focus:border-gray-900 cursor-pointer'

function Thumb({ url, size = 'w-11 h-11' }) {
  if (url) return <img src={url} alt="" className={`${size} rounded-md object-cover border border-gray-200 flex-shrink-0`} />
  return (
    <div className={`${size} rounded-md bg-gray-100 border border-gray-200 flex items-center justify-center text-gray-300 flex-shrink-0`}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
      </svg>
    </div>
  )
}

// Falls back to the legacy free-text material columns when a SKU hasn't
// been linked to material_options yet (most ERP-synced SKUs never were) —
// same fallback InspectionForm.jsx/exportInspectionReportPdf.js already use,
// so existing data doesn't just read as blank.
function primaryMaterialText(sku) { return sku.primary_material?.label || sku.primary_base_material }
function secondaryMaterialText(sku) { return sku.secondary_material?.label || sku.secondary_base_material }

function MaterialCell({ sku }) {
  const primary = primaryMaterialText(sku)
  const secondary = secondaryMaterialText(sku)
  if (!primary && !secondary) return <span className="text-gray-300">—</span>
  return (
    <div className="flex flex-col items-start gap-1 min-w-0">
      <span className="inline-block max-w-full truncate px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-semibold">
        {primary || '—'}
      </span>
      {secondary && (
        <span className="inline-block max-w-full truncate px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-[10px] font-medium">
          {secondary}
        </span>
      )}
    </div>
  )
}

function CategoryPill({ name }) {
  if (!name) return <span className="text-gray-300">—</span>
  return (
    <span className="inline-block max-w-full truncate px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[10px] font-semibold">
      {name}
    </span>
  )
}

const skeletonBar = 'rounded bg-gradient-to-r from-gray-100 via-gray-200 to-gray-100 animate-pulse'

// Matches the real table's 8 columns — shown in place of rows while the
// current page is loading, so the header/shell don't jump once data lands.
function SkeletonRows({ count = 8 }) {
  return Array.from({ length: count }, (_, i) => (
    <tr key={i}>
      <td className="px-4 py-2.5"><div className={`w-11 h-11 rounded-md ${skeletonBar}`} /></td>
      <td className="px-4 py-2.5">
        <div className={`h-3 w-20 ${skeletonBar}`} />
        <div className={`h-2.5 w-12 ${skeletonBar} mt-1.5`} />
      </td>
      <td className="px-4 py-2.5"><div className={`h-3 w-40 ${skeletonBar}`} /></td>
      <td className="px-4 py-2.5"><div className={`h-4 w-16 rounded-full ${skeletonBar}`} /></td>
      <td className="px-4 py-2.5"><div className={`h-3 w-24 ${skeletonBar}`} /></td>
      <td className="px-4 py-2.5"><div className={`h-4 w-20 rounded-full ${skeletonBar}`} /></td>
      <td className="px-4 py-2.5"><div className={`h-3 w-14 ${skeletonBar}`} /></td>
      <td className="px-4 py-2.5"></td>
    </tr>
  ))
}

// Mirrors the mobile card layout — thumb + ref/variant + description +
// buyer + pill row.
function SkeletonCards({ count = 5 }) {
  return Array.from({ length: count }, (_, i) => (
    <div key={i} className="bg-white border border-gray-200 rounded-xl p-3.5 shadow-sm flex gap-3">
      <div className={`w-16 h-16 rounded-md ${skeletonBar} flex-shrink-0`} />
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <div className={`h-3.5 w-28 ${skeletonBar}`} />
        <div className={`h-3 w-40 ${skeletonBar}`} />
        <div className={`h-2.5 w-24 ${skeletonBar}`} />
        <div className="flex gap-1.5 mt-1">
          <div className={`h-4 w-14 rounded-full ${skeletonBar}`} />
          <div className={`h-4 w-16 rounded-full ${skeletonBar}`} />
        </div>
      </div>
    </div>
  ))
}

// Browsable, server-side-paginated view over `skus` — the "Import SKU"
// button is the only way to create/parse new ones, unchanged, this is just
// a read surface. Curated columns only (image/ref/description/category/
// buyer→vendor/material/price) — everything else lives behind
// SkuDetailDrawer, since a SKU row has ~35 columns and a flat wide table
// would be unreadable.
export default function StyleLibraryTab() {
  const navigate = useNavigate()
  const memberId = useMemberId()
  const { getMaterialOptions } = useMaterialOptions()

  const [page, setPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [filters, setFilters] = useState({ search: '', buyerOrgId: '', categoryId: '', materialId: '' })
  const [buyers, setBuyers] = useState([])
  const [categories, setCategories] = useState([])
  const [materials, setMaterials] = useState([])

  const [selectedSku, setSelectedSku] = useState(null) // row clicked -> read-only detail drawer
  const [editingRow, setEditingRow] = useState(null)   // sku mapped to SkuReviewDrawer's row shape -> real edit drawer

  useEffect(() => {
    supabase.from('organizations').select('id, display_name').eq('type', 'buyer').order('display_name')
      .then(({ data }) => setBuyers(data || []))
    supabase.from('categories').select('id, name').eq('level', 1).order('name')
      .then(({ data }) => setCategories(data || []))
    getMaterialOptions().then(setMaterials)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchPage = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const from = (page - 1) * PAGE_SIZE
      const to = from + PAGE_SIZE - 1
      let q = supabase.from('skus').select(`
        *,
        buyer:organizations!skus_buyer_org_id_fkey(display_name),
        category:categories(name),
        primary_material:material_options!primary_base_material_id(label),
        secondary_material:material_options!secondary_base_material_id(label),
        created_by:organization_members!created_by_member_id(full_name)
      `, { count: 'exact' })
        .is('delete_meta', null)
        // Manually-created SKUs have no erp_created_on at all — sort those
        // last (nullsFirst: false) rather than letting Postgres's DESC
        // default (nulls first) push them ahead of every real ERP date.
        // Secondary tiebreaker on `id` — ERP-synced rows routinely share the
        // exact same erp_created_on from a bulk sync, and without a unique
        // tiebreaker Postgres doesn't guarantee tied rows keep the same
        // relative order across requeries, so a row could visibly "jump"
        // position after nothing more than a refetch (e.g. right after
        // saving an edit, which re-runs this same query).
        .order('erp_created_on', { ascending: false, nullsFirst: false })
        .order('id', { ascending: true })

      const term = filters.search.trim()
      if (term) q = q.or(`buyer_sku_ref.ilike.%${term}%,description.ilike.%${term}%`)
      if (filters.buyerOrgId) q = q.eq('buyer_org_id', filters.buyerOrgId)
      if (filters.categoryId) q = q.eq('category_id', filters.categoryId)
      if (filters.materialId) q = q.eq('primary_base_material_id', filters.materialId)

      const { data, error: qErr, count } = await q.range(from, to)
      if (qErr) throw qErr
      setRows(data || [])
      setTotalCount(count || 0)
    } catch (err) {
      setError(err.message || 'Could not load SKUs')
    } finally {
      setLoading(false)
    }
  }, [page, filters])

  useEffect(() => { fetchPage() }, [fetchPage])

  const setFilter = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }))
    setPage(1)
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  // No staging row / batch involved — SkuReviewDrawer's `directSkuId` prop
  // routes Save straight to update_sku_direct instead. `row.confirmed` is
  // built directly from the already-fetched sku, no extra round trip.
  const handleEdit = (sku) => {
    setEditingRow({
      rowId: null,
      status: 'confirmed',
      confirmed: skuToConfirmedFields(sku),
      needsConfirm: {},
      needsInput: {},
      _sku: sku,
    })
    setSelectedSku(null)
  }

  const handleEditSaved = () => {
    setEditingRow(null)
    fetchPage()
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="flex flex-col gap-4">

        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Item Master</h2>
            <p className="text-xs text-gray-500 mt-0.5">{totalCount} SKU{totalCount === 1 ? '' : 's'} · {buyers.length} buyer{buyers.length === 1 ? '' : 's'}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative w-full sm:w-60">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input type="text" value={filters.search} onChange={e => setFilter('search', e.target.value)}
                placeholder="Search SKU ref or description…"
                className="w-full pl-8 pr-2.5 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-900 focus:outline-none focus:border-gray-900" />
            </div>
            <select value={filters.buyerOrgId} onChange={e => setFilter('buyerOrgId', e.target.value)} className={`${selectCls} w-28`}>
              <option value="">All Buyers</option>
              {buyers.map(b => <option key={b.id} value={b.id}>{b.display_name}</option>)}
            </select>
            <select value={filters.categoryId} onChange={e => setFilter('categoryId', e.target.value)} className={`${selectCls} w-36`}>
              <option value="">All Categories</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select value={filters.materialId} onChange={e => setFilter('materialId', e.target.value)} className={`${selectCls} w-28`}>
              <option value="">All Materials</option>
              {Object.entries(materials.reduce((acc, m) => {
                (acc[m.category] ??= []).push(m); return acc
              }, {})).map(([cat, opts]) => (
                <optgroup key={cat} label={cat}>
                  {opts.map(m => <option key={m.id} value={m.id}>{m.code ? `${m.code} — ${m.label}` : m.label}</option>)}
                </optgroup>
              ))}
            </select>
            <button type="button" onClick={() => navigate('/dashboard/npd?tab=sku-import')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gray-900 text-sm font-medium text-white hover:bg-gray-700 transition-colors cursor-pointer flex-shrink-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Import SKU
            </button>
          </div>
        </div>

        {error && (
          <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">{error}</div>
        )}

        {!loading && !error && rows.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 py-24 border-2 border-dashed border-gray-200 rounded-2xl bg-gray-50 text-center">
            <p className="text-sm text-gray-500">No SKUs match these filters</p>
          </div>
        )}

        {(loading || rows.length > 0) && (
          <>
          {/* Table — sm and up */}
          <div className="hidden sm:block bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[760px]">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-left">
                    <th className="px-4 py-2.5 w-16"></th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Buyer SKU Ref</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Description</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Category</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Buyer</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Material</th>
                    <th className="px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Base Price</th>
                    <th className="px-4 py-2.5 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loading ? <SkeletonRows /> : rows.map(sku => (
                    <tr key={sku.id} onClick={() => setSelectedSku(sku)}
                      className="hover:bg-gray-50 transition-colors cursor-pointer">
                      <td className="px-4 py-2.5"><Thumb url={sku.image_url ? publicUrl(sku.image_url) : null} /></td>
                      <td className="px-4 py-2.5 text-gray-900 font-bold">
                        {sku.buyer_sku_ref || '—'}
                        {sku.sku_variant && <div className="text-[10px] text-gray-400 font-normal">{sku.sku_variant}</div>}
                      </td>
                      <td className="px-4 py-2.5 text-gray-700 max-w-xs truncate">{sku.description || '—'}</td>
                      <td className="px-4 py-2.5"><CategoryPill name={sku.category?.name} /></td>
                      <td className="px-4 py-2.5 text-gray-700">{sku.buyer?.display_name || '—'}</td>
                      <td className="px-4 py-2.5"><MaterialCell sku={sku} /></td>
                      <td className="px-4 py-2.5 text-emerald-600 font-semibold whitespace-nowrap">{sku.base_price != null ? `${sku.base_price}${sku.currency ? ` ${sku.currency}` : ''}` : <span className="text-gray-300 font-normal">—</span>}</td>
                      <td className="px-4 py-2.5 text-right text-gray-300">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6" /></svg>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Cards — below sm */}
          <div className="sm:hidden flex flex-col gap-3">
            {loading ? <SkeletonCards /> : rows.map(sku => (
              <div key={sku.id} onClick={() => setSelectedSku(sku)}
                className="bg-white border border-gray-200 rounded-xl p-3.5 shadow-sm flex gap-3 cursor-pointer">
                <Thumb url={sku.image_url ? publicUrl(sku.image_url) : null} size="w-16 h-16" />
                <div className="flex-1 min-w-0 flex flex-col gap-1">
                  <div className="text-sm font-bold text-gray-900 truncate">{sku.buyer_sku_ref || '—'}</div>
                  {sku.sku_variant && <div className="text-[10px] text-gray-400 truncate -mt-0.5">{sku.sku_variant}</div>}
                  <div className="text-xs text-gray-600 truncate">{sku.description || '—'}</div>
                  <div className="text-[11px] text-gray-500 truncate">{sku.buyer?.display_name || '—'}</div>
                  <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                    {sku.category?.name && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 font-semibold">{sku.category.name}</span>}
                    {primaryMaterialText(sku) && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-semibold">{primaryMaterialText(sku)}</span>}
                    {sku.base_price != null && <span className="text-[10px] font-semibold text-emerald-600">{sku.base_price}{sku.currency ? ` ${sku.currency}` : ''}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {!loading && (
            <div className="flex items-center justify-end gap-3 px-1">
              <button type="button" disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-[11px] font-medium text-gray-500 disabled:opacity-40 hover:bg-gray-50 transition-colors cursor-pointer disabled:cursor-not-allowed">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
                Prev
              </button>
              <span className="text-[11px] text-gray-500">Page {page} of {totalPages}</span>
              <button type="button" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-[11px] font-medium text-gray-500 disabled:opacity-40 hover:bg-gray-50 transition-colors cursor-pointer disabled:cursor-not-allowed">
                Next
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6" /></svg>
              </button>
            </div>
          )}
          </>
        )}
      </div>

      {selectedSku && !editingRow && (
        <SkuDetailDrawer sku={selectedSku} onClose={() => setSelectedSku(null)}
          onEdit={() => handleEdit(selectedSku)} />
      )}

      {editingRow && (
        <SkuReviewDrawer
          row={editingRow}
          directSkuId={editingRow._sku.id}
          buyerOrgId={editingRow._sku.buyer_org_id}
          vendorId={editingRow._sku.vendor_id}
          memberId={memberId}
          onClose={() => setEditingRow(null)}
          onSaved={handleEditSaved}
        />
      )}
    </div>
  )
}
