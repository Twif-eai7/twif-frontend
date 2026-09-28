import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './useAuth'
import { isPlmMasterKeyEligible } from '../utils/plmMasterKey'
import { useProfileStore } from '../stores/profileStore'
import { usePlmMasterKeyStore } from '../stores/plmMasterKeyStore'

const BASE = import.meta.env.VITE_BACKEND_URL

async function plmAdminFetch(path, session, options = {}) {
  const res = await fetch(`${BASE}/plm/admin${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      // Destructive console ops (reassign / remove-access / primary-role / restore) require
      // Super Admin Mode to be toggled on — this header is how the backend sees that.
      ...(usePlmMasterKeyStore.getState().active ? { 'X-PLM-Master-Key': '1' } : {}),
      ...options.headers,
    },
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return data
}

// Gates the /admin/plm-security page: tech-dept merchant (Super Admin) OR a promoted
// Admin-tier member. Redirects everyone else to /dashboard, mirroring useAdminCheck.
export function usePlmSecurityGuard() {
  const { session, loading: authLoading } = useAuth()
  const orgMembership = useProfileStore(s => s.orgMembership)
  const navigate = useNavigate()
  const [tier, setTier] = useState(null) // 'super_admin' | 'admin' | null
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    if (authLoading) return
    if (!session) { navigate('/auth', { replace: true }); return }

    // Tech-dept eligibility can be resolved locally without a round trip; anyone else
    // still needs the backend to say whether they've been promoted to Admin tier.
    if (isPlmMasterKeyEligible(orgMembership)) {
      setTier('super_admin')
      setChecking(false)
      return
    }

    let cancelled = false
    plmAdminFetch('/me', session)
      .then(data => { if (!cancelled) setTier(data.tier || null) })
      .catch(() => { if (!cancelled) setTier(null) })
      .finally(() => { if (!cancelled) setChecking(false) })
    return () => { cancelled = true }
  }, [session, authLoading, orgMembership, navigate])

  useEffect(() => {
    if (!checking && !tier) navigate('/dashboard', { replace: true })
  }, [checking, tier, navigate])

  return { tier, checking }
}

// Shared list-fetcher shape: {data, total, loading, error, refresh}, matching useMembers.js.
function usePlmAdminList(path, deps = []) {
  const { session } = useAuth()
  const [data, setData] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    if (!session) return
    setLoading(true)
    setError(null)
    try {
      const res = await plmAdminFetch(path, session)
      setData(res.data || [])
      setTotal(res.total || 0)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, path, ...deps])

  useEffect(() => { refresh() }, [refresh])

  return { data, total, loading, error, refresh }
}

export const usePlmAdminWorkspaces      = () => usePlmAdminList('/workspaces')
export const usePlmAdminSkus            = () => usePlmAdminList('/skus')
export const usePlmAdminUploads         = () => usePlmAdminList('/uploads')
export const usePlmAdminInvites         = () => usePlmAdminList('/invites')
export const usePlmAdminOrgRelationships = () => usePlmAdminList('/org-relationships')
export const usePlmAdminAdmins          = () => usePlmAdminList('/admins')
export const usePlmAdminAuditLog        = () => usePlmAdminList('/audit-log')
export const usePlmAdminPermissions = (workspaceId) =>
  usePlmAdminList(workspaceId ? `/permissions?workspace_id=${workspaceId}` : '/permissions', [workspaceId])

// Member/org pickers — scoped by organization_id/type so a reassign or grant form only
// ever offers members that actually belong to the relevant org, not the whole portal.
export const usePlmAdminMembers = ({ organizationId, type, department } = {}) => {
  const params = new URLSearchParams()
  if (organizationId) params.set('organization_id', organizationId)
  if (type) params.set('type', type)
  if (department) params.set('department', department)
  const qs = params.toString()
  return usePlmAdminList(`/members${qs ? `?${qs}` : ''}`, [organizationId, type, department])
}
export const usePlmAdminOrganizations = ({ type } = {}) =>
  usePlmAdminList(`/organizations${type ? `?type=${type}` : ''}`, [type])

// One-off mutations — each throws on failure so callers can catch + toast.
export function usePlmAdminActions() {
  const { session } = useAuth()
  const call = useCallback((path, method, body) =>
    plmAdminFetch(path, session, { method, body: body ? JSON.stringify(body) : undefined }),
  [session])

  return {
    // No createOrganization/createUser here — that lives on the existing Organisations/
    // Members admin pages (/org-customers/create-organization, /create-user) since it
    // isn't PLM-specific.
    setOrgRelationship: (body) => call('/org-relationships', 'POST', body),
    removeOrgRelationship: (id) => call(`/org-relationships/${id}`, 'DELETE'),
    promoteAdmin: (memberId) => call('/admins', 'POST', { member_id: memberId }),
    demoteAdmin: (id) => call(`/admins/${id}`, 'DELETE'),
    grantPermission: (body) => call('/permissions', 'POST', body),
    revokePermission: (id) => call(`/permissions/${id}`, 'DELETE'),
    // Deliberately no deleteWorkspace/deleteUpload/deleteInvite — those would be permanent
    // hard deletes with no undo; Moderation is view + reassign only for these three.
    reassignWorkspace: (id, body) => call(`/workspaces/${id}/reassign`, 'PATCH', body),
    restoreSku: (id) => call(`/skus/${id}/restore`, 'PATCH'),
    // Removes one person from just this one workspace (primary or co-buyer/co-supplier) —
    // not their org, not any other workspace. See routes/plmAdmin.js for what it clears.
    removeWorkspaceAccess: (workspaceId, memberId) => call(`/workspaces/${workspaceId}/access/${memberId}`, 'DELETE'),
  }
}
