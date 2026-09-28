import { usePoStore } from '../stores/poStore'
import { useProfileStore } from '../stores/profileStore'
import { useAuthStore } from '../stores/authStore'
import { supabase } from '../lib/supabase'
import { impliedRateFor } from '../components/orderManagement/poUtils'

const API_BASE = import.meta.env.VITE_BACKEND_URL

async function apiPost(path, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Request failed: ${res.status}`)
  }
  return res.json()
}

async function apiFormData(path, formData, method = 'POST') {
  const res = await fetch(`${API_BASE}${path}`, { method, body: formData })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Request failed: ${res.status}`)
  }
  return res.json()
}

export function usePOActions() {
  const _updateRow  = usePoStore(s => s._updateRow)
  const _updateRows = usePoStore(s => s._updateRows)
  const { orgMembership } = useProfileStore()

  const memberId = orgMembership?.memberId;

  // ── Create PO ─────────────────────────────────────────────────────────────
  const createPO = async ({ buyerSupplierLinkId, poReceivedDate, poNumber, currency, quantity, value, amountUsd, file, test, onBehalfOfId }) => {
    const fd = new FormData()
    fd.append('buyerSupplierLinkId', buyerSupplierLinkId)
    fd.append('poReceivedDate', poReceivedDate)
    fd.append('poNumber',       poNumber)
    fd.append('currency',       currency)
    fd.append('amountUsd',      String(amountUsd))
    fd.append('quantity',       String(quantity))
    fd.append('value',          String(value))
    fd.append('test',           test)
    if (onBehalfOfId) fd.append('onBehalfOfId', onBehalfOfId)
    if (file) fd.append('poFile', file)
    return apiFormData(`/purchase-orders/create?createdBy=${memberId}`, fd)
  }

  // ── Update PO ─────────────────────────────────────────────────────────────
  const updatePO = async (poId, { buyerSupplierLinkId, poReceivedDate, poNumber, currency, quantity, value, amountUsd, file }) => {
    const fd = new FormData()
    fd.append('buyerSupplierLinkId', buyerSupplierLinkId)
    fd.append('poReceivedDate',      poReceivedDate)
    fd.append('poNumber',            poNumber)
    fd.append('currency',            currency)
    fd.append('amountUsd',           String(amountUsd))
    fd.append('quantity',            String(quantity))
    fd.append('value',               String(value))
    if (file) fd.append('poFile', file)
    return apiFormData(`/purchase-orders/update/${poId}?updatedBy=${encodeURIComponent(memberId)}`, fd, 'PUT')
  }

  // ── Upload PI ─────────────────────────────────────────────────────────────
  const uploadPI = async (poId, { piReceivedDate, exFactoryDate, file, productDetailsFile, quantity, value, currency, amountUsd }) => {
    const fd = new FormData()
    fd.append('piReceivedDate', piReceivedDate)
    fd.append('exFactoryDate',  exFactoryDate)
    fd.append('piFile',         file)
    if (productDetailsFile != null) fd.append('productDetailsFile', productDetailsFile)
    if (quantity  != null) fd.append('quantity',  String(quantity))
    if (value     != null) fd.append('value',     String(value))
    if (currency  != null) fd.append('currency',  currency)
    if (amountUsd != null) fd.append('amountUsd', String(amountUsd))
    const result = await apiFormData(`/purchase-orders/confirm/${poId}?updatedBy=${encodeURIComponent(memberId)}`, fd)
    _updateRow(poId, { pi_received_date: piReceivedDate, ex_factory_date: exFactoryDate })
    return result
  }

  // ── Attach/replace product details file standalone ───────────────────────
  // For when it wasn't provided during the original PI upload — see
  // shopify-backend/routes/purchaseOrders.js's PUT /product-details/:poId.
  const uploadProductDetails = async (poId, file) => {
    const fd = new FormData()
    fd.append('productDetailsFile', file)
    const result = await apiFormData(`/purchase-orders/product-details/${poId}`, fd, 'PUT')
    _updateRow(poId, { product_details_file_url: result.product_details_file_url })
    return result
  }

  // ── Revise confirmed PO ───────────────────────────────────────────────────
  const revisePO = async (poId, { poReceivedDate, poNumber, currency, quantity, value, amountUsd, piReceivedDate, exFactoryDate, poFile, piFile, productDetailsFile }) => {
    const fd = new FormData()
    fd.append('poReceivedDate', poReceivedDate)
    fd.append('poNumber',       poNumber)
    fd.append('currency',       currency)
    fd.append('quantity',       String(quantity))
    fd.append('value',          String(value))
    fd.append('amountUsd',      String(amountUsd))
    fd.append('piReceivedDate', piReceivedDate)
    fd.append('exFactoryDate',  exFactoryDate)
    fd.append('poFile',         poFile)
    fd.append('piFile',         piFile)
    if (productDetailsFile) fd.append('productDetailsFile', productDetailsFile)
    const result = await apiFormData(`/purchase-orders/revise-confirmed-po/${poId}?updatedBy=${encodeURIComponent(memberId)}`, fd, 'PUT')
    _updateRow(poId, {
      po_received_date:  poReceivedDate,
      po_number:         poNumber,
      quantity_ordered:  parseInt(quantity, 10),
      amount:            amountUsd,
      pi_received_date:  piReceivedDate,
      ex_factory_date:   exFactoryDate,
    })
    return result
  }

  // ── Confirm PI ────────────────────────────────────────────────────────────
  const confirmPI = async (poId) => {
    const { pi_received_date } = await apiPost(`/po/${poId}/confirm-pi`, {})
    _updateRow(poId, { pi_confirmed: true, pi_received_date })
  }

  // ── ERP sync (single) ─────────────────────────────────────────────────────
  const markErpSynced = async (poId) => {
    const now = new Date().toISOString()
    const { error } = await supabase
      .from('purchase_orders')
      .update({ erp_synced: true, erp_synced_at: now })
      .eq('id', poId)
      .is('deleted_at', null)
    if (error) throw new Error(error.message)
    _updateRow(poId, { erp_synced: true, erp_synced_at: now })
  }

  // ── ERP sync (bulk) ───────────────────────────────────────────────────────
  const bulkMarkErpSynced = async (poIds) => {
    if (!poIds?.length) return
    const now = new Date().toISOString()
    const { error } = await supabase
      .from('purchase_orders')
      .update({ erp_synced: true, erp_synced_at: now })
      .in('id', poIds)
      .is('deleted_at', null)
    if (error) throw new Error(error.message)
    _updateRows(poIds, { erp_synced: true, erp_synced_at: now })
  }

  // ── PI delay comment ──────────────────────────────────────────────────────
  const addPiDelayComment = async (poId, comment) => {
    const createdBy = orgMembership?.fullName || orgMembership?.memberId || 'Unknown'
    const { error } = await supabase
      .from('po_comments')
      .insert([{ po_id: poId, comment_type: 'PI_DELAY', comment, created_by: createdBy }])
    if (error) throw new Error(error.message)
  }

  // ── Report OTIF exception ─────────────────────────────────────────────────
  const reportOtifException = async (poId, { reason, comment, proofImage, proposedExFactoryDate }) => {
    const session = useAuthStore.getState().session
    const fd = new FormData()
    fd.append('reason', reason)
    fd.append('comment', comment)
    fd.append('proposedExFactoryDate', proposedExFactoryDate)
    fd.append('proofImage', proofImage)
    const res = await fetch(`${API_BASE}/purchase-orders/otif-exception/${poId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session?.access_token}` },
      body: fd,
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`)
    return json
  }

  // ── Submit advance payment ─────────────────────────────────────────────────
  // Append-only — see sql/po_advance_payments.sql. Currency and its USD rate
  // are both derived from the PO itself (impliedRateFor, same helper
  // PoDrawer.jsx's own line-item value checks use) rather than a live FX
  // lookup — an advance is always in the PO's own currency, and pricing it
  // at today's market rate instead of the rate the PO was actually booked at
  // would make "advance received" and "PO value" incomparable in USD.
  const submitAdvancePayment = async (po, { amount, paymentDate, referenceNumber, notes }) => {
    const rate = impliedRateFor(po)
    if (rate == null) throw new Error("Can't determine this PO's USD conversion rate — check its amount/currency fields.")
    const { error } = await supabase
      .from('po_advance_payments')
      .insert([{
        po_id: po.id,
        amount: parseFloat(amount),
        currency: po.currency || 'USD',
        amount_usd: parseFloat(amount) * rate,
        payment_date: paymentDate,
        reference_number: referenceNumber?.trim() || null,
        notes: notes?.trim() || null,
        submitted_by: memberId,
      }])
    if (error) throw new Error(error.message)
  }

  // ── Delete PO (soft delete via delete_meta) ───────────────────────────────
  const deletePO = async (poId, reason) => {
    const { error } = await supabase
      .from('purchase_orders')
      .update({
        delete_meta: {
          deleted:       true,
          deletedAt:     new Date().toISOString(),
          deletedById:   orgMembership?.memberId   || null,
          deletedByName: orgMembership?.fullName   || null,
          reason:        reason || null,
        },
      })
      .eq('id', poId)
      .is('delete_meta', null)
    if (error) throw new Error(error.message)
  }

  return { createPO, updatePO, uploadPI, revisePO, confirmPI, markErpSynced, bulkMarkErpSynced, addPiDelayComment, deletePO, reportOtifException, uploadProductDetails, submitAdvancePayment }
}