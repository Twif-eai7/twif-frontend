import { useMemo } from 'react'
import { usePlmStore, SEASONS, STATUS_LABELS, getCategoryDescendantIds } from '../stores/plmStore'
import { useMemberId } from '../stores/profileStore'

const DUPLICATE_SEARCH_TERMS = new Set(['duplicate', 'duplicates', 'dup', 'dupe', 'dupes'])

// Filters the SKU list by all active filters, optionally excluding one key.
// exclude = null → full filter; exclude = 'buyer' → everything except buyer filter, etc.
function applyFilters(skus, filters, categories, exclude, dupCounts, autoCodeById) {
  const { season, category, buyer, supplier, status, member, search, buyerContact, supplierContact } = filters
  const q      = search.toLowerCase().trim()
  const isDuplicateQuery = DUPLICATE_SEARCH_TERMS.has(q)
  const catIds = category !== 'all' && exclude !== 'category'
    ? getCategoryDescendantIds(categories, category) : null

  return skus.filter(s => {
    if (exclude !== 'season'          && season          !== 'all' && s.season !== season)              return false
    if (exclude !== 'category'        && catIds          && !catIds.has(s.category_id))                 return false
    if (exclude !== 'buyer' && buyer !== 'all') {
      if (buyer === '__none__') {
        if (s.buyer_org_id || s.upload_buyer_org_id) return false
      } else if (s.buyer_org_id !== buyer && s.upload_buyer_org_id !== buyer) return false
    }
    if (exclude !== 'supplier'        && supplier        !== 'all' && s.supplier        !== supplier)    return false
    if (exclude !== 'buyerContact'    && buyerContact    !== 'all' &&
        s.buyer_name !== buyerContact && !(s.extra_buyer_names    || []).includes(buyerContact))    return false
    if (exclude !== 'supplierContact' && supplierContact !== 'all' &&
        s.supplier_name !== supplierContact && !(s.extra_supplier_names || []).includes(supplierContact)) return false
    if (exclude !== 'status' && status !== 'all') {
      if (status === 'production_sku') {
        if (!s.production_sku_id) return false
      } else if (status === 'pending_buyer_ref') {
        if (s.buyer_ref_status !== 'pending_buyer_ref') return false
      } else {
        // Production-linked SKUs have no workspace_status/status of their own and
        // would otherwise fall through to the 'inactive' default — they should only
        // ever match the dedicated 'production_sku' filter value, never this branch.
        if (s.production_sku_id) return false
        const effective = s.workspace_status ?? s.status ?? 'inactive'
        if (effective !== status) return false
      }
    }
    if (exclude !== 'member' && member !== 'all' && s.created_by_member_id !== member)    return false
    if (q) {
      if (isDuplicateQuery) {
        if (!s.production_sku_id || (dupCounts.get(s.production_sku_id) || 0) < 2)        return false
      } else {
        const linkedCode = s.production_sku_id ? autoCodeById.get(s.production_sku_id) : null
        if (![
          s.auto_code, s.description, s.material, s.finish,
          s.buyer_sku_ref, s.buyer_ref, s.vendor_sku_ref,
          s.supplier, s.buyer_org_name, s.upload_buyer_org_name,
          s.buyer_name, s.season, linkedCode,
          ...(s.extra_buyer_names || []), ...(s.extra_supplier_names || []),
        ].some(v => v && v.toLowerCase().includes(q)))                                    return false
      }
    }
    return true
  })
}

export function usePLMFiltered() {
  const skus       = usePlmStore(s => s.skus)
  const categories = usePlmStore(s => s.categories)
  const filters    = usePlmStore(s => s.filters)
  const memberId   = useMemberId()

  // Duplicate-link lookups computed over the full unfiltered catalog so the
  // "duplicate" search term and results stay stable regardless of active filters.
  const dupCounts = useMemo(() => {
    const counts = new Map()
    skus.forEach(s => { if (s.production_sku_id) counts.set(s.production_sku_id, (counts.get(s.production_sku_id) || 0) + 1) })
    return counts
  }, [skus])

  const autoCodeById = useMemo(() => {
    const m = new Map()
    skus.forEach(s => { if (s.auto_code) m.set(s.id, s.auto_code) })
    return m
  }, [skus])

  // Sidebar counts: all filters except category so you can still browse categories
  const skusForCounts = useMemo(
    () => applyFilters(skus, filters, categories, 'category', dupCounts, autoCodeById),
    [skus, filters, categories, dupCounts, autoCodeById]
  )

  // Grid: full filter including category
  const filteredSkus = useMemo(() => {
    const { category } = filters
    const catIds = category !== 'all' ? getCategoryDescendantIds(categories, category) : null
    if (!catIds) return skusForCounts
    return skusForCounts.filter(s => catIds.has(s.category_id))
  }, [skusForCounts, filters, categories])

  // Cross-filter bases: each excludes its own key so the dropdown shows
  // only the options that exist within the current selection of other filters.
  const skusExSeason          = useMemo(() => applyFilters(skus, filters, categories, 'season',          dupCounts, autoCodeById), [skus, filters, categories, dupCounts, autoCodeById])
  const skusExBuyer           = useMemo(() => applyFilters(skus, filters, categories, 'buyer',           dupCounts, autoCodeById), [skus, filters, categories, dupCounts, autoCodeById])
  const skusExSupplier        = useMemo(() => applyFilters(skus, filters, categories, 'supplier',        dupCounts, autoCodeById), [skus, filters, categories, dupCounts, autoCodeById])
  const skusExMember          = useMemo(() => applyFilters(skus, filters, categories, 'member',          dupCounts, autoCodeById), [skus, filters, categories, dupCounts, autoCodeById])
  const skusExStatus          = useMemo(() => applyFilters(skus, filters, categories, 'status',          dupCounts, autoCodeById), [skus, filters, categories, dupCounts, autoCodeById])
  const skusExBuyerContact    = useMemo(() => applyFilters(skus, filters, categories, 'buyerContact',    dupCounts, autoCodeById), [skus, filters, categories, dupCounts, autoCodeById])
  const skusExSupplierContact = useMemo(() => applyFilters(skus, filters, categories, 'supplierContact', dupCounts, autoCodeById), [skus, filters, categories, dupCounts, autoCodeById])

  // Preserve SEASONS ordering — only include seasons present in filtered SKUs
  const seasonOptions = useMemo(() => {
    const available = new Set(skusExSeason.map(s => s.season).filter(Boolean))
    return SEASONS.filter(s => available.has(s))
  }, [skusExSeason])

  const buyerOptions = useMemo(() => {
    const seen = new Map()
    skusExBuyer.forEach(s => {
      if (s.buyer_org_id && s.buyer_org_name && !seen.has(s.buyer_org_id))
        seen.set(s.buyer_org_id, s.buyer_org_name)
      if (s.upload_buyer_org_id && s.upload_buyer_org_name && !seen.has(s.upload_buyer_org_id))
        seen.set(s.upload_buyer_org_id, s.upload_buyer_org_name)
    })
    const opts = [...seen.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label))
    if (skusExBuyer.some(s => !s.buyer_org_id && !s.upload_buyer_org_id))
      opts.push({ value: '__none__', label: 'No Buyer' })
    return opts
  }, [skusExBuyer])

  const supplierOptions = useMemo(
    () => [...new Set(skusExSupplier.map(s => (s.supplier || '').trim()).filter(Boolean))].sort(),
    [skusExSupplier]
  )

  const buyerContactOptions = useMemo(() => {
    const seen = new Set()
    skusExBuyerContact.forEach(s => {
      if (s.buyer_name) seen.add(s.buyer_name)
      ;(s.extra_buyer_names || []).forEach(n => { if (n) seen.add(n) })
    })
    return [...seen].sort().map(n => ({ value: n, label: n }))
  }, [skusExBuyerContact])

  const supplierContactOptions = useMemo(() => {
    const seen = new Set()
    skusExSupplierContact.forEach(s => {
      if (s.supplier_name) seen.add(s.supplier_name)
      ;(s.extra_supplier_names || []).forEach(n => { if (n) seen.add(n) })
    })
    return [...seen].sort().map(n => ({ value: n, label: n }))
  }, [skusExSupplierContact])

  // showMemberFilter is based on the full SKU list so the filter doesn't disappear
  // when other active filters happen to narrow it down to one member.
  const showMemberFilter = useMemo(
    () => new Set(skus.map(s => s.created_by_member_id).filter(Boolean)).size > 1,
    [skus]
  )

  const memberOptions = useMemo(() => {
    const seen = new Map()
    skus.forEach(s => {
      if (s.created_by_member_id && !seen.has(s.created_by_member_id)) {
        const label = s.created_by_member_id === memberId
          ? 'My Uploads'
          : (s.created_by_member_name || 'Unknown Member')
        seen.set(s.created_by_member_id, label)
      }
    })
    const opts   = [...seen.entries()].map(([value, label]) => ({ value, label }))
    const mine   = opts.filter(o => o.label === 'My Uploads')
    const others = opts.filter(o => o.label !== 'My Uploads').sort((a, b) => a.label.localeCompare(b.label))
    return [...mine, ...others]
  }, [skus, memberId])

  const statusOptions = useMemo(() => {
    const STATUS_ORDER = ['inactive', 'invited', 'active', 'reviewing', 'approved', 'sample', 'on_hold', 'rejected', 'production', 'pending_buyer_ref', 'production_sku']
    const presentStatuses = new Set(skusExStatus.map(s => s.workspace_status ?? s.status ?? 'inactive'))
    const hasPendingRef    = skusExStatus.some(s => s.buyer_ref_status === 'pending_buyer_ref')
    const hasProductionSku = skusExStatus.some(s => s.production_sku_id)

    return STATUS_ORDER
      .filter(v => {
        if (v === 'pending_buyer_ref') return hasPendingRef
        if (v === 'production_sku')   return hasProductionSku
        return presentStatuses.has(v)
      })
      .map(v => ({ value: v, label: STATUS_LABELS[v] || v }))
  }, [skusExStatus])

  const { grouped, supplierOrder } = useMemo(() => {
    const g = {}
    filteredSkus.forEach(s => {
      const sup    = s.supplier || 'Unassigned'
      const season = s.season   || 'No Season'
      if (!g[sup])         g[sup] = {}
      if (!g[sup][season]) g[sup][season] = []
      g[sup][season].push(s)
    })

    const sort = filters.sort || 'all'
    const [sortBy, sortOrder] = sort === 'all' ? ['date', 'desc'] : sort.split('_')

    // Pre-compute min/max timestamp per supplier to avoid Date() calls inside sort comparator
    const supplierTs = {}
    for (const sup of Object.keys(g)) {
      const times = Object.values(g[sup]).flat().map(s => new Date(s.created_at || 0).getTime())
      supplierTs[sup] = { min: Math.min(...times), max: Math.max(...times) }
    }

    const order = Object.keys(g).sort((a, b) => {
      if (sortBy === 'alpha') {
        return sortOrder === 'asc' ? a.localeCompare(b) : b.localeCompare(a)
      }
      const tA = sortOrder === 'desc' ? supplierTs[a].max : supplierTs[a].min
      const tB = sortOrder === 'desc' ? supplierTs[b].max : supplierTs[b].min
      return sortOrder === 'asc' ? tA - tB : tB - tA
    })

    return { grouped: g, supplierOrder: order }
  }, [filteredSkus, filters.sort])

  return { filteredSkus, skusForCounts, grouped, supplierOrder, seasonOptions, buyerOptions, supplierOptions, statusOptions, memberOptions, showMemberFilter, buyerContactOptions, supplierContactOptions }
}
