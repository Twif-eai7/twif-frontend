import { useProfileStore } from '../stores/profileStore'
import { isTechDeptEligible } from '../utils/plmTechAccess'

/** True for tech-dept merchant members — powers org-wide Activity Log visibility and the
 *  "By Contact" filter. See utils/plmTechAccess.js for why this is kept separate from the
 *  PLM Master Key toggle. */
export function usePlmTechDeptEligible() {
  const orgMembership = useProfileStore((s) => s.orgMembership)
  return isTechDeptEligible(orgMembership)
}
