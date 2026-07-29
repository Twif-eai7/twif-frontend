import { useRef, useState } from 'react'
import { extractPostalCode, lookupPostalCode } from './postalLookup'

const inputCls = 'px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-900 focus:outline-none focus:border-gray-900 bg-white w-full'
const textareaCls = 'px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-900 focus:outline-none focus:border-gray-900 bg-white w-full resize-none'

function Field({ label, required, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-semibold text-gray-600 uppercase tracking-wide">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

export default function AddressPincodeFields({
  addressLabel,
  pincodeLabel,
  address,
  pincode,
  onAddressChange,
  onPincodeChange,
  mode = 'india',
  addressRequired = false,
  addressPlaceholder = '',
  pincodePlaceholder = 'e.g. 122001',
}) {
  const [lookingUp, setLookingUp] = useState(false)
  const skipPinExtract = useRef(false)
  const skipAddrLookup = useRef(false)
  const pinTimer = useRef(null)

  const handleAddressChange = (val) => {
    onAddressChange(val)
    if (skipPinExtract.current) {
      skipPinExtract.current = false
      return
    }
    const extracted = extractPostalCode(val, mode)
    if (extracted && extracted !== pincode) {
      skipAddrLookup.current = true
      onPincodeChange(extracted)
    }
  }

  const handlePincodeChange = (val) => {
    onPincodeChange(val)
    clearTimeout(pinTimer.current)

    pinTimer.current = setTimeout(async () => {
      if (skipAddrLookup.current) {
        skipAddrLookup.current = false
        return
      }
      const trimmed = val?.trim()
      if (!trimmed) return

      setLookingUp(true)
      try {
        const result = await lookupPostalCode(trimmed, mode, address)
        if (result?.address) {
          skipPinExtract.current = true
          onAddressChange(result.address)
          if (result.pincode && result.pincode !== trimmed) {
            skipAddrLookup.current = true
            onPincodeChange(result.pincode)
          }
        }
      } finally {
        setLookingUp(false)
      }
    }, 600)
  }

  return (
    <div className="grid grid-cols-[1fr_110px] gap-3 items-start">
      <Field label={addressLabel} required={addressRequired}>
        <textarea
          value={address}
          onChange={e => handleAddressChange(e.target.value)}
          placeholder={addressPlaceholder}
          rows={2}
          className={textareaCls}
        />
      </Field>
      <Field label={pincodeLabel}>
        <div className="relative">
          <input
            value={pincode}
            onChange={e => handlePincodeChange(e.target.value)}
            placeholder={pincodePlaceholder}
            autoComplete="off"
            className={inputCls}
          />
          {lookingUp && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
              <div className="w-3 h-3 border border-gray-300 border-t-gray-700 rounded-full animate-spin" />
            </div>
          )}
        </div>
      </Field>
    </div>
  )
}
