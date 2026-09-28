import { create } from 'zustand'
import { devtools, persist, createJSONStorage } from 'zustand/middleware'
import { useProfileStore } from './profileStore'
import { isPlmMasterKeyEligible } from '../utils/plmMasterKey'

// Session-scoped (not localStorage) so the override never silently carries into a new
// browser session — a tech-dept member must explicitly re-enable it each time.
export const usePlmMasterKeyStore = create(
  devtools(
    persist(
      (set) => ({
        active: false,
        toggle: () => set((state) => ({ active: !state.active }), false, 'plmMasterKey/toggle'),
        setActive: (v) => set({ active: v }, false, 'plmMasterKey/setActive'),
      }),
      {
        name: 'twif-plm-master-key',
        storage: createJSONStorage(() => sessionStorage),
      }
    ),
    { name: 'PLM Master Key Store' }
  )
)

/** Re-checks eligibility at read time (not just at toggle time) — the effective flag
 *  used everywhere else in PLM to decide whether to unlock buyer/supplier-only UI. */
export function usePlmMasterKeyActive() {
  const active = usePlmMasterKeyStore((s) => s.active)
  const orgMembership = useProfileStore((s) => s.orgMembership)
  return active && isPlmMasterKeyEligible(orgMembership)
}
