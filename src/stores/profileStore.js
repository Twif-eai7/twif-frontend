import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { supabase } from '../lib/supabase'
import { useAuthStore } from './authStore'

const ORG_TYPE_TO_ROLE = {
  merchant: 'Merchant',
  buyer: 'Buyer',
  supplier: 'Supplier',
}

/** Map legacy JNG / J Nitin Global org labels to Twif for UI display. */
function displayOrgBrand(name) {
  if (!name) return ''
  const normalized = name.trim().replace(/\s+/g, ' ')
  if (/^j\s*nitin\s*global(\s+llp)?$/i.test(normalized)) return 'TWIF TECH LLP'
  if (/^jnitin\s+global(\s+llp)?$/i.test(normalized)) return 'TWIF TECH LLP'
  if (/^jng(\s+llp)?$/i.test(normalized)) return 'TWIF TECH LLP'
  return name
}

function computeProfileHeader(pu, orgMembership) {
  if (!pu && !orgMembership) return null
  const fullName     = orgMembership?.fullName || ''
  const businessName = displayOrgBrand(
    orgMembership?.orgDisplayName || orgMembership?.orgName || ''
  )
  const roleName     = orgMembership?.orgType ? ORG_TYPE_TO_ROLE[orgMembership.orgType] ?? '' : ''
  const initials = (fullName || businessName)
    .split(' ').map((w) => w[0]).filter(Boolean).join('').toUpperCase().slice(0, 2) || '--'
  return {
    name: fullName || businessName || '--',
    businessName,
    businessLogo: orgMembership?.orgLogoUrl ?? null,
    role: roleName,
    initials,
  }
}

export const useProfileStore = create(
  devtools(
    (set) => ({
      portalUser: null,
      orgMembership: null,
      profileHeader: null, // pre-computed, stable reference
      profileLoading: false,
      profileFetched: false,
      profileError: null,

      fetchProfile: async (userId) => {
        if (!userId) return
        if (!supabase) {
          set(
            {
              profileLoading: false,
              profileFetched: true,
              profileError: 'Supabase is not configured.',
            },
            false,
            'profile/no-supabase'
          )
          return
        }
        set({ profileLoading: true, profileError: null }, false, 'profile/fetchStart')

        try {
          const { data: pu, error: puErr } = await supabase
            .from('portal_users')
            .select('id, email, onboarding_completed')
            .eq('id', userId)
            .maybeSingle()

          if (puErr) throw puErr

          const { data: om, error: omErr } = await supabase
            .from('organization_members')
            .select('id, role, full_name, department, allowed_modules, assigned_regions, organizations(id, type, name, display_name)')
            .eq('user_id', userId)
            .maybeSingle()

          if (omErr) throw omErr

          const org = om?.organizations ?? null
          const orgMembership = org
            ? {
                memberId: om.id,
                orgId: org.id,
                orgType: org.type,
                orgName: org.name,
                orgDisplayName: org.display_name,
                orgLogoUrl: org.logo_url,
                role: om.role,
                fullName: om.full_name || null,
                department: om.department || null,
                allowedModules: om.allowed_modules ?? null,
                assignedRegions: om.assigned_regions ?? null,
              }
            : null

          set(
            {
              portalUser: pu ?? null,
              orgMembership,
              profileHeader: computeProfileHeader(pu, orgMembership),
              profileLoading: false,
              profileFetched: true,
            },
            false,
            'profile/fetchDone'
          )
        } catch (err) {
          console.warn('profileStore.fetchProfile error:', err.message)
          set(
            { profileError: err.message, profileLoading: false, profileFetched: true },
            false,
            'profile/fetchError'
          )
        }
      },

      clearProfile: () =>
        set(
          {
            portalUser: null,
            orgMembership: null,
            profileHeader: null,
            profileError: null,
            profileFetched: false,
          },
          false,
          'profile/clear'
        ),
    }),
    { name: 'Profile Store' }
  )
)

// Subscribe to authStore — re-fetch profile whenever user changes
useAuthStore.subscribe(
  (state) => state.user,
  (user) => {
    if (user?.id) {
      useProfileStore.getState().fetchProfile(user.id)
    } else {
      useProfileStore.getState().clearProfile()
    }
  }
)

// ── Selector hooks — all return primitives or stable state references ──────────

export function useRole() {
  return useProfileStore((s) =>
    s.orgMembership?.orgType ? ORG_TYPE_TO_ROLE[s.orgMembership.orgType] ?? null : null
  )
}

export function useIsAdmin() {
  return useProfileStore((s) => {
    const om = s.orgMembership
    if (!om) return false
    return (
      om.orgType === 'merchant' &&
      (om.role === 'admin' || om.role === 'owner') &&
      (om.department === 'tech' || om.department === null)
    )
  })
}

export function useMemberId() {
  return useProfileStore((s) => s.orgMembership?.memberId ?? null)
}

/** True only for role=admin — owners are view-only regardless of department. */
export function useCanEdit() {
  return useProfileStore((s) => s.orgMembership?.role === 'admin')
}

/** The member's department: 'erp' | 'it' | 'tech' | 'merchandising' | 'logistics' | 'qa' | null */
export function useOrgDepartment() {
  return useProfileStore((s) => s.orgMembership?.department ?? null)
}

export function useOrgId() {
  return useProfileStore((s) => s.orgMembership?.orgId ?? null)
}

/** Reads the pre-computed stable reference — no inline object construction */
export function useProfileHeader() {
  return useProfileStore((s) => s.profileHeader)
}

/** Returns the member's assigned regions (array of city strings), or null if unrestricted */
export function useAssignedRegions() {
  return useProfileStore((s) => s.orgMembership?.assignedRegions ?? null)
}

/** Returns null (unrestricted) for owners and null-department admins; otherwise the stored allowed_modules */
export function useAllowedModules() {
  return useProfileStore((s) => {
    const om = s.orgMembership
    if (!om) return null
    if (om.role === 'owner') return null
    if (om.role === 'admin' && !om.department) return null
    return om.allowedModules ?? null
  })
}
