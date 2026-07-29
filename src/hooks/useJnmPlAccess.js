import { useAuthStore } from '../stores/authStore'
import { useProfileStore } from '../stores/profileStore'
import { canAccessJnmPlFeatures, canSeeMonthlyExpenseHeader } from '../utils/jnmAccess'

export function useJnmPlAccess() {
  const email = useAuthStore((s) => s.session?.user?.email)
  const orgMembership = useProfileStore((s) => s.orgMembership)
  return canAccessJnmPlFeatures(email, orgMembership)
}

export function useCanSeeMonthlyExpenseHeader() {
  const email = useAuthStore((s) => s.session?.user?.email)
  const orgMembership = useProfileStore((s) => s.orgMembership)
  return canSeeMonthlyExpenseHeader(email, orgMembership)
}
