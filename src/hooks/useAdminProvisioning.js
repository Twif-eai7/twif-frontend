import { useCallback } from 'react'
import { useAuth } from './useAuth'

const BASE = import.meta.env.VITE_BACKEND_URL

// Org/user creation for the Organisations and Members admin pages — same
// requireSuperAdmin (merchant org admin/owner) gate those pages already use.
export function useAdminProvisioning() {
  const { session } = useAuth()

  const call = useCallback(async (path, body, method = 'POST') => {
    const res = await fetch(`${BASE}/org-customers/${path}`, {
      method,
      headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
    return data
  }, [session])

  return {
    createOrganization: (body) => call('create-organization', body),
    createUser: (body) => call('create-user', body),
    updateMember: (memberId, updates) => call(`members/${memberId}`, updates, 'PATCH'),
  }
}
