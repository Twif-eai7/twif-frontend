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
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]           = useState(null)

  const isBlStep   = step === pos.length
  const currentPo  = !isBlStep ? (pos[step] ?? null) : null
  const existingBl = invoice.bl_number   // gate is now the BL number, not the file

  const startRecording = useCallback(() => {
    setRecording(true)
    setStep(0)
    setLegs({})
    setBlNumber(invoice.bl_number || '')
    setCartons(invoice.number_of_cartons != null ? String(invoice.number_of_cartons) : '')
    setError(null)
  }, [invoice.bl_number])

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
      await recordShipmentLegs(invoice.id, legPayload, blNumber.trim(), cartons ? parseInt(cartons, 10) : null)

      setRecording(false)
      onSuccess?.()
    } catch (err) {
      setError(err.message || 'Failed to record shipment')
    } finally {
      setSubmitting(false)
    }
  }, [blNumber, cartons, invoice, legs, recordShipmentLegs, submitting, onSuccess])

  const totalLegsEntered = Object.values(legs).filter(q => Number(q) > 0).length

  const currentPoLineItems = currentPo?.po_line_items ?? []
  const hasBalanceError = currentPoLineItems.some(li => {
    const q = legs[li.id]
    return q !== undefined && q !== '' && Number(q) > (li.balance_quantity ?? 0)
  })

  const poHasLegs = useCallback((po) =>
    (po.po_line_items ?? []).some(li => Number(legs[li.id]) > 0), [legs])

  const canSubmit = (!!blNumber.trim() || !!existingBl) && !submitting

  return {
    recording, startRecording, cancelRecording,
    step, setStep,
    legs, setLeg,
    blNumber, setBlNumber,
    cartons, setCartons,
    isBlStep, currentPo, existingBl,
    submitting, error,
    handleSubmit,
    totalLegsEntered, hasBalanceError, poHasLegs, canSubmit,
  }
}
