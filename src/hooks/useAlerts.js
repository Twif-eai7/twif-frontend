import { useCallback, useEffect, useMemo } from 'react'
import { useAlertsStore } from '../stores/alertsStore'
import { useProfileStore } from '../stores/profileStore'
import { supabase } from '../lib/supabase'

const BUCKET = 'POFY26'

// ── URL resolution (sync — Supabase storage) ──────────────────────────────────

function resolveUrl(path) {
  if (!path) return null
  if (path.startsWith('http')) return path
  return supabase.storage.from(BUCKET).getPublicUrl(path).data?.publicUrl ?? null
}

// ── Alert enrichment (mirrors backend hybrid logic) ───────────────────────────

function enrichAlert(alert) {
  let result = { ...alert }

  if (result.po_snapshot) {
    const snap = result.po_snapshot
    if (snap.delete_meta) {
      result.po_snapshot = {
        ...snap,
        deleted:    snap.delete_meta.deleted    || false,
        deleted_at: snap.delete_meta.deletedAt  || null,
        deleted_by: snap.delete_meta.deletedByName || null,
        reason:     snap.delete_meta.reason     || null,
      }
    }
    result.po_snapshot = {
      ...result.po_snapshot,
      po_file_url: resolveUrl(result.po_snapshot.po_file_url),
      pi_file_url: resolveUrl(result.po_snapshot.pi_file_url),
    }
    return result
  }

  // No snapshot — build synthetic one from joined purchase_orders (backward compat)
  if (result.purchase_orders) {
    const po = result.purchase_orders
    result.po_snapshot = {
      po_id:            po.id,
      po_number:        po.po_number,
      buyer_name:       po.buyer_supplier_links?.buyer?.display_name   || null,
      supplier_name:    po.buyer_supplier_links?.supplier?.display_name || null,
      po_received_date: po.po_received_date,
      pi_confirmed:     po.pi_confirmed     || false,
      pi_received_date: po.pi_received_date || null,
      po_file_url:      resolveUrl(po.po_file_url),
      pi_file_url:      resolveUrl(po.pi_file_url),
      deleted: false, deleted_at: null, deleted_by: null, reason: null,
      last_updated_at: null, last_updated_by: null, changes: null,
    }
  }

  return result
}

// ── Exported classification utils (used in AlertsDrawer rendering) ────────────

export function getCategory(alert) {
  const type = (alert.alert_type || '').toUpperCase()
  if (type === 'PI_REMINDER')             return 'reminder'
  if (type === 'PI_OVERDUE')              return 'overdue'
  if (type === 'PI_DELAY')               return 'delay'
  if (type === 'PI_UPLOAD')              return 'confirmed'
  if (type === 'PO_DELETED')             return 'deleted'
  if (type === 'PO_REVISION')            return 'revision'
  if (type === 'PO_UPDATE')              return 'updated'
  if (type === 'PO_UPLOAD')              return 'po'
  if (type.startsWith('INSPECTION'))       return 'inspection'
  const msg = (alert.message || '').toLowerCase()
  if (msg.includes('overdue'))                                    return 'overdue'
  if (msg.includes('reminder') || msg.includes('due tomorrow'))   return 'reminder'
  if (msg.includes('pi uploaded') || msg.includes('pi confirmed')) return 'confirmed'
  if (msg.includes('deleted'))                                    return 'deleted'
  return 'po'
}

export function resolvePO(alert) {
  const s = alert.po_snapshot || null
  if (!s) return null
  if (s.delete_meta) return {
    ...s,
    deleted:    true,
    deleted_at: s.delete_meta.deletedAt      || null,
    deleted_by: s.delete_meta.deletedByName  || null,
    reason:     s.delete_meta.reason         || null,
  }
  return s
}

export function hasUpdates(alert) {
  if ((alert.alert_type || '').toUpperCase() === 'PO_UPDATE') return true
  const po = resolvePO(alert)
  return !!(po?.last_updated_at && !po?.deleted && getCategory(alert) === 'po')
}

export function formatTime(ts) {
  if (!ts) return ''
  const diff = Date.now() - new Date(ts).getTime()
  const m = Math.floor(diff / 60_000)
  const h = Math.floor(diff / 3_600_000)
  const d = Math.floor(diff / 86_400_000)
  if (m < 1)  return 'Just now'
  if (m < 60) return `${m}m ago`
  if (h < 24) return `${h}h ago`
  if (d < 7)  return `${d}d ago`
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function formatChanges(str) {
  if (!str) return []
  return str.split(',').map(chunk => {
    const colon = chunk.indexOf(':')
    if (colon === -1) return { field: null, value: chunk.trim() }
    return { field: chunk.slice(0, colon).trim(), value: chunk.slice(colon + 1).trim() }
  })
}

// ── Private filtering / derivation ───────────────────────────────────────────

function filterAlerts(alerts, isAdmin, filter, query) {
  let list = [...alerts]

  if (!isAdmin) {
    list = list.filter(a => ['reminder', 'overdue', 'delay', 'inspection'].includes(getCategory(a)))
    if      (filter === 'reminder')   list = list.filter(a => getCategory(a) === 'reminder')
    else if (filter === 'overdue')    list = list.filter(a => getCategory(a) === 'overdue')
    else if (filter === 'delay')      list = list.filter(a => getCategory(a) === 'delay')
    else if (filter === 'inspection') list = list.filter(a => getCategory(a) === 'inspection')
    else if (filter === 'unread')     list = list.filter(a => !a.is_read)
  } else {
    if      (filter === 'unread')       list = list.filter(a => !a.is_read)
    else if (filter === 'po_all')       list = list.filter(a => ['po','confirmed'].includes(getCategory(a)) && resolvePO(a)?.deleted !== true)
    else if (filter === 'po_confirmed') list = list.filter(a => resolvePO(a)?.pi_confirmed === true && resolvePO(a)?.deleted !== true)
    else if (filter === 'po_pending')   list = list.filter(a => { const po = resolvePO(a); return po && !po.pi_confirmed && !po.deleted && ['po','confirmed'].includes(getCategory(a)) })
    else if (filter === 'po_updated')   list = list.filter(a => hasUpdates(a))
    else if (filter === 'po_revision')  list = list.filter(a => getCategory(a) === 'revision')
    else if (filter === 'po_deleted')   list = list.filter(a => resolvePO(a)?.deleted === true)
    else if (filter === 'pi_all')       list = list.filter(a => ['confirmed','overdue','delay','reminder'].includes(getCategory(a)))
    else if (filter === 'pi_confirmed') list = list.filter(a => getCategory(a) === 'confirmed')
    else if (filter === 'pi_overdue')   list = list.filter(a => getCategory(a) === 'overdue')
    else if (filter === 'pi_delay')     list = list.filter(a => getCategory(a) === 'delay')
    else if (filter === 'pi_reminder')  list = list.filter(a => getCategory(a) === 'reminder')
    else if (filter === 'inspection')   list = list.filter(a => getCategory(a) === 'inspection')
  }

  if (query) {
    const q = query.toLowerCase()
    list = list.filter(a => {
      const po = resolvePO(a) || {}
      return [po.buyer_name, po.po_number, a.message].filter(Boolean).join(' ').toLowerCase().includes(q)
    })
  }

  return list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
}

function computeCounts(alerts, isAdmin) {
  if (!isAdmin) {
    const rel = alerts.filter(a => ['reminder', 'overdue', 'delay', 'inspection'].includes(getCategory(a)))
    return {
      all:        rel.length,
      unread:     rel.filter(a => !a.is_read).length,
      reminder:   rel.filter(a => getCategory(a) === 'reminder').length,
      overdue:    rel.filter(a => getCategory(a) === 'overdue').length,
      delay:      rel.filter(a => getCategory(a) === 'delay').length,
      inspection: rel.filter(a => getCategory(a) === 'inspection').length,
    }
  }
  const poAll = alerts.filter(a => ['po','confirmed'].includes(getCategory(a)) && resolvePO(a)?.deleted !== true)
  const piAll = alerts.filter(a => ['confirmed','overdue','delay','reminder'].includes(getCategory(a)))
  return {
    all:         alerts.length,
    unread:      alerts.filter(a => !a.is_read).length,
    poAll:       poAll.length,
    poConfirmed: poAll.filter(a => resolvePO(a)?.pi_confirmed === true).length,
    poPending:   poAll.filter(a => !resolvePO(a)?.pi_confirmed).length,
    poUpdated:   alerts.filter(a => hasUpdates(a)).length,
    poRevision:  alerts.filter(a => getCategory(a) === 'revision').length,
    poDeleted:   alerts.filter(a => resolvePO(a)?.deleted === true).length,
    piAll:       piAll.length,
    piConfirmed: piAll.filter(a => getCategory(a) === 'confirmed').length,
    piOverdue:   piAll.filter(a => getCategory(a) === 'overdue').length,
    piDelay:     piAll.filter(a => getCategory(a) === 'delay').length,
    piReminder:  piAll.filter(a => getCategory(a) === 'reminder').length,
    inspection:  alerts.filter(a => getCategory(a) === 'inspection').length,
  }
}

function computeWeeklySummary(alerts) {
  const now = new Date()
  const day = now.getDay()
  const mon = new Date(now)
  mon.setDate(now.getDate() - (day === 0 ? 6 : day - 1))
  mon.setHours(0, 0, 0, 0)
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
  const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  const thisWeek = alerts.filter(a => new Date(a.created_at) >= mon)
  const lastMon  = new Date(mon); lastMon.setDate(mon.getDate() - 7)
  const lastWeek = alerts.filter(a => { const d = new Date(a.created_at); return d >= lastMon && d < mon })

  const poReceived  = thisWeek.filter(a => (a.alert_type||'').toUpperCase() === 'PO_UPLOAD').length
  const piConfirmed = thisWeek.filter(a => (a.alert_type||'').toUpperCase() === 'PI_UPLOAD').length
  const piPending   = thisWeek.filter(a => (a.alert_type||'').toUpperCase() === 'PO_UPLOAD' && !a.po_snapshot?.pi_confirmed).length
  const lastPo      = lastWeek.filter(a => (a.alert_type||'').toUpperCase() === 'PO_UPLOAD').length
  const poTrend     = lastPo > 0 ? poReceived - lastPo : null

  return { weekLabel: `${fmt(mon)} – ${fmt(sun)}`, poReceived, piConfirmed, piPending, poTrend }
}

// ── Main hook — used by AlertsDrawer ─────────────────────────────────────────

export function useAlerts() {
  const alerts       = useAlertsStore(s => s.alerts)
  const drawerOpen   = useAlertsStore(s => s.drawerOpen)
  const loading      = useAlertsStore(s => s.loading)
  const activeFilter = useAlertsStore(s => s.activeFilter)
  const searchQuery  = useAlertsStore(s => s.searchQuery)
  const summaryOpen  = useAlertsStore(s => s.summaryOpen)
  const setAlerts     = useAlertsStore(s => s.setAlerts)
  const setLoading    = useAlertsStore(s => s.setLoading)
  const closeDrawer   = useAlertsStore(s => s.closeDrawer)
  const setFilter     = useAlertsStore(s => s.setFilter)
  const setSearch     = useAlertsStore(s => s.setSearch)
  const toggleSummary = useAlertsStore(s => s.toggleSummary)

  const memberId = useProfileStore(s => s.orgMembership?.memberId ?? null)
  const isAdmin  = useProfileStore(s =>
    s.orgMembership?.role === 'admin' || s.orgMembership?.role === 'owner'
  )

  const fetchAlerts = useCallback(async () => {
    if (!memberId) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('alerts')
        .select(`
          id, message, is_read, created_at, po_snapshot, alert_type,
          purchase_orders (
            id, po_received_date, po_file_url, po_number, pi_confirmed,
            pi_received_date, pi_file_url, created_by,
            buyer_supplier_links (
              buyer:organizations!buyer_supplier_links_buyer_org_id_fkey ( display_name ),
              supplier:organizations!buyer_supplier_links_supplier_org_id_fkey ( display_name )
            )
          )
        `)
        .eq('recipient_user_id', memberId)
        .order('updated_at', { ascending: false })
        .limit(300)

      if (error) throw error
      setAlerts((data || []).map(enrichAlert))
    } catch (err) {
      console.error('[alerts] fetch:', err)
    } finally {
      setLoading(false)
    }
  }, [memberId, setAlerts, setLoading])

  const markAsRead = useCallback(async (alertId) => {
    const { error } = await supabase
      .from('alerts')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', alertId)
    if (!error) {
      setAlerts(useAlertsStore.getState().alerts.map(a =>
        a.id === alertId ? { ...a, is_read: true } : a
      ))
    }
  }, [setAlerts])

  const markAllRead = useCallback(async () => {
    if (!memberId) return
    const { error } = await supabase
      .from('alerts')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('recipient_user_id', memberId)
      .eq('is_read', false)
    if (!error) {
      setAlerts(useAlertsStore.getState().alerts.map(a => ({ ...a, is_read: true })))
    }
  }, [memberId, setAlerts])

  // Fetch + 30s poll while drawer is open
  useEffect(() => {
    if (!drawerOpen) return
    fetchAlerts()
    const id = setInterval(fetchAlerts, 30_000)
    return () => clearInterval(id)
  }, [drawerOpen, fetchAlerts])

  // ESC to close
  useEffect(() => {
    if (!drawerOpen) return
    const onKey = e => { if (e.key === 'Escape') closeDrawer() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawerOpen, closeDrawer])

  // Body scroll lock
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [drawerOpen])

  const filtered    = useMemo(() => filterAlerts(alerts, isAdmin, activeFilter, searchQuery), [alerts, isAdmin, activeFilter, searchQuery])
  const counts      = useMemo(() => computeCounts(alerts, isAdmin), [alerts, isAdmin])
  const summary     = useMemo(() => computeWeeklySummary(alerts), [alerts])
  const unreadCount = counts.unread ?? 0

  return {
    alerts: filtered,
    loading,
    drawerOpen,
    activeFilter,
    searchQuery,
    summaryOpen,
    isAdmin,
    counts,
    summary,
    unreadCount,
    closeDrawer,
    setFilter,
    setSearch,
    toggleSummary,
    markAsRead,
    markAllRead,
  }
}

// ── Lightweight hook — used by Header trigger only ────────────────────────────

export function useAlertsTrigger() {
  const storeCount = useAlertsStore(s => s.alerts.filter(a => !a.is_read).length)
  const openDrawer = useAlertsStore(s => s.openDrawer)
  const memberId   = useProfileStore(s => s.orgMembership?.memberId ?? null)

  const initCount    = useAlertsStore(s => s.initUnreadCount)
  const setInitCount = useAlertsStore(s => s.setInitUnreadCount)

  useEffect(() => {
    if (!memberId || initCount > 0) return
    supabase
      .from('alerts')
      .select('*', { count: 'exact', head: true })
      .eq('recipient_user_id', memberId)
      .eq('is_read', false)
      .then(({ count }) => { if (count) setInitCount(count) })
  }, [memberId])

  return { unreadCount: storeCount || initCount, openDrawer }
}
