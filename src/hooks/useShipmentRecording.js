import { useState, useCallback } from 'react'
import { useShipmentContainerActions } from './useShipmentContainerActions'

// Encapsulates the multi-step shipment recording wizard:
//   PO qty entry steps → BL Number step → submit (record BL# + insert legs)
// BL file upload is a separate action done later via the invoice card header.
export function useShipmentRecording(invoice, pos, onSuccess) {
  const { recordShipmentLegs } = useShipmentContainerActions()

  const [recording, setRecording]   = useState(false)
  const [step, setStep]             = useState(0)      // 0..pos.length-1 = PO steps, pos.length = BL# step
  const [legs, setLegs]             = useState({})     // { [li.id]: qty string }
  const [blNumber, setBlNumber]     = useState('')     // BL reference number (text, not a file)
  const [cartons, setCartons]       = useState('')     // number of cartons in this shipment
  const [shippedDate, setShippedDate] = useState('')   // defaults to today, editable for late entry
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]           = useState(null)

  const isBlStep   = step === pos.length
  const currentPo  = !isBlStep ? (pos[step] ?? null) : null
  const existingBl = invoice.bl_number   // gate is now the BL number, not the file

  const startRecording = useCallback(() => {
    setRecording(true)
    setStep(0)
    // Prefill each SKU's qty with what the merchant actually planned —
    // still fully editable, since logistics may end up shipping a different
    // amount (a batch, a partial, a substitution). Capped at whatever's
    // actually shippable right now (balance_quantity, Final-inspection
    // accepted-and-not-yet-shipped) so a stale plan figure never prefills a
    // value the wizard would immediately flag as over the line. This
    // naturally shrinks on a later "Add Legs" call too, since balance_quantity
    // already reflects whatever was recorded in an earlier pass.
    const prefill = {}
    pos.forEach(po => {
      ;(po.po_line_items || []).forEach(li => {
        if (li.plannedQuantity == null) return
        const cap = Math.min(li.plannedQuantity, li.balance_quantity ?? Infinity, li.finalInspectionShippableQty ?? Infinity)
        if (cap > 0) prefill[li.id] = String(cap)
      })
    })
    setLegs(prefill)
    setBlNumber(invoice.bl_number || '')
    setCartons(invoice.number_of_cartons != null ? String(invoice.number_of_cartons) : '')
    setShippedDate(new Date().toISOString().slice(0, 10))
    setError(null)
  }, [invoice.bl_number, invoice.number_of_cartons, pos])

  const cancelRecording = useCallback(() => setRecording(false), [])

  const setLeg = useCallback((liId, qty) => {
    setLegs(prev => ({ ...prev, [liId]: qty }))
  }, [])

  const handleSubmit = useCallback(async () => {
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const legPayload = Object.entries(legs)
        .filter(([, q]) => Number(q) > 0)
        .map(([liId, q]) => ({ po_line_item_id: liId, shipped_quantity: Number(q) }))

      // Atomic on the server: BL#/cartons update + every leg insert happen in
      // one transaction (record_shipment_legs RPC) — replaces what used to be
      // two separate client-side writes that could partially fail.
      await recordShipmentLegs(invoice.id, legPayload, blNumber.trim(), cartons ? parseInt(cartons, 10) : null, shippedDate)

      // Awaited — onSuccess triggers the container refetch, and the wizard
      // closing beforehand left a window where the card still showed the
      // pre-shipment "Not shipped" figures until that refetch happened to
      // land on its own.
      await onSuccess?.()
      setRecording(false)
    } catch (err) {
      setError(err.message || 'Failed to record shipment')
    } finally {
      setSubmitting(false)
    }
  }, [blNumber, cartons, shippedDate, invoice, legs, recordShipmentLegs, submitting, onSuccess])

  const totalLegsEntered = Object.values(legs).filter(q => Number(q) > 0).length

  const currentPoLineItems = currentPo?.po_line_items ?? []
  const hasBalanceError = currentPoLineItems.some(li => {
    const q = legs[li.id]
    return q !== undefined && q !== '' && Number(q) > (li.balance_quantity ?? 0)
  })
  // Defense in depth — WizardLineItem already caps the qty input to each
  // SKU's actual Final-inspection-accepted (and not-yet-shipped) quantity,
  // but this still guards Next/Submit in case a qty ever ends up in state
  // beyond that cap anyway (e.g. stale data). record_shipment_legs itself is
  // the real, unbypassable gate.
  const hasInspectionError = currentPoLineItems.some(li => {
    const q = legs[li.id]
    return q !== undefined && q !== '' && Number(q) > (li.finalInspectionShippableQty ?? 0)
  })

  const poHasLegs = useCallback((po) =>
    (po.po_line_items ?? []).some(li => Number(legs[li.id]) > 0), [legs])

  const canSubmit = (!!blNumber.trim() || !!existingBl) && !!shippedDate && !submitting

  return {
    recording, startRecording, cancelRecording,
    step, setStep,
    legs, setLeg,
    blNumber, setBlNumber,
    cartons, setCartons,
    shippedDate, setShippedDate,
    isBlStep, currentPo, existingBl,
    submitting, error,
    handleSubmit,
    totalLegsEntered, hasBalanceError, hasInspectionError, poHasLegs, canSubmit,
  }
}
