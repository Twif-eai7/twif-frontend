import { useEffect } from 'react'
import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { resolveBuyerOrgsForMember, resolveSupplierNamesForMember } from '../lib/poQueries'
import { useProfileStore } from './profileStore'

export const useOrgsStore = create(
  devtools(
    (set, get) => ({
      buyerOrgs:    [],
      supplierOrgs: [],
      loading:      false,
      fetched:      false,
      _fetchedFor:  null,
      _fetchingFor: null,

      fetchOrgs: async (memberId) => {
        if (!memberId) return
        if (get()._fetchedFor === memberId || get()._fetchingFor === memberId) return
        set({ loading: true, _fetchingFor: memberId }, false, 'orgs/fetchStart')
        try {
          const [buyerOrgs, supplierOrgs] = await Promise.all([
            resolveBuyerOrgsForMember(memberId),
            resolveSupplierNamesForMember(memberId),
          ])
          set({ buyerOrgs, supplierOrgs, loading: false, fetched: true, _fetchedFor: memberId, _fetchingFor: null }, false, 'orgs/fetchDone')
        } catch (err) {
          console.error('[orgsStore] fetchOrgs failed:', err)
          set({ loading: false, _fetchingFor: null }, false, 'orgs/fetchError')
        }
      },
    }),
    { name: 'Orgs Store' }
  )
)

// ── Selector hooks ────────────────────────────────────────────────────────────
export const useBuyerOrgs    = () => useOrgsStore(s => s.buyerOrgs)
export const useSupplierOrgs = () => useOrgsStore(s => s.supplierOrgs)
export const useOrgsLoading  = () => useOrgsStore(s => s.loading)

// ── Init hook — call once from a top-level component (e.g. PLMPage) ──────────
export function useOrgsInit() {
  const memberId  = useProfileStore(s => s.orgMembership?.memberId)
  const fetchOrgs = useOrgsStore(s => s.fetchOrgs)

  useEffect(() => {
    if (memberId) fetchOrgs(memberId)
  }, [memberId])
}
