import { useState, useEffect } from 'react'
import { useAdminCheck } from '../../hooks/useAdminCheck'
import { useAuth } from '../../hooks/useAuth'
import { AdminShell } from '../../components/admin/AdminShell'
import { PageHeader } from '../../components/admin/AdminUi'
import { Button, Input, Alert, Spinner } from '../../components/ui'
import SignaturePad from '../../components/shared/SignaturePad'
import { MODE_TO_STORAGE, STORAGE_TO_MODE } from '../../lib/signatureMode'

const BASE = import.meta.env.VITE_BACKEND_URL

export default function SignatureSettingsPage() {
  const { checking } = useAdminCheck()
  const { session } = useAuth()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const [fullName, setFullName] = useState('')
  const [designation, setDesignation] = useState('')
  const [signatureMode, setSignatureMode] = useState('type')
  const [signatureImage, setSignatureImage] = useState('')

  useEffect(() => {
    if (!session) return
    fetch(`${BASE}/org-customers/admin-signature`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then(r => r.json())
      .then(d => {
        if (d.data) {
          setFullName(d.data.full_name || '')
          setDesignation(d.data.designation || '')
          setSignatureMode(STORAGE_TO_MODE[d.data.signature_type] || 'type')
          setSignatureImage(d.data.signature_image || '')
        }
      })
      .catch(() => setError('Could not load the current signature'))
      .finally(() => setLoading(false))
  }, [session])

  async function handleSave() {
    setSaved(false)
    if (!fullName.trim()) return setError('Name is required')
    if ((signatureMode === 'draw' || signatureMode === 'upload') && !signatureImage) {
      return setError(signatureMode === 'draw' ? 'Please draw your signature' : 'Please upload your signature')
    }

    setSaving(true)
    setError('')
    try {
      const res = await fetch(`${BASE}/org-customers/admin-signature`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          full_name: fullName,
          designation,
          signature_type: MODE_TO_STORAGE[signatureMode],
          ...(signatureMode !== 'type' && { signature_image: signatureImage }),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save')
      setSaved(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (checking) return null

  return (
    <AdminShell>
      <div className="px-8 py-8 max-w-xl">
        <PageHeader
          title="Signature settings"
          subtitle="Set up your signature once — it'll prefill future NDA countersignatures you make. Only you can see and use this."
        />

        {loading ? (
          <div className="flex justify-center py-10"><Spinner light={false} size="w-6 h-6" /></div>
        ) : (
          <div className="bg-white border border-stone-200 rounded-xl p-6">
            {error && <Alert type="error">{error}</Alert>}
            {saved && <Alert type="success">Signature saved.</Alert>}

            <div className="grid grid-cols-2 gap-3 mb-4">
              <Input
                label="Name" required type="text" placeholder="Full name"
                value={fullName} onChange={e => { setFullName(e.target.value); setSaved(false) }}
                wrapperClassName="mb-0"
              />
              <Input
                label="Designation" type="text" placeholder="e.g. COO"
                value={designation} onChange={e => { setDesignation(e.target.value); setSaved(false) }}
                wrapperClassName="mb-0"
              />
            </div>

            <label className="block text-sm font-medium text-stone-700 mb-1.5">
              Signature <span className="text-red-500">*</span>
            </label>
            <SignaturePad
              mode={signatureMode}
              onModeChange={v => { setSignatureMode(v); setSaved(false) }}
              typedValue={fullName}
              onTypedChange={v => { setFullName(v); setSaved(false) }}
              imageValue={signatureImage}
              onImageChange={v => { setSignatureImage(v); setSaved(false) }}
              typedPlaceholder="Full name as it should appear"
            />

            <Button variant="primary" fullWidth loading={saving} className="mt-5 py-3" onClick={handleSave}>
              Save signature
            </Button>
          </div>
        )}
      </div>
    </AdminShell>
  )
}
