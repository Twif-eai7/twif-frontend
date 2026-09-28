/** Tech-department merchant members get org-wide PLM visibility — the Activity Log, its unread
 *  badge, and the "By Contact" filter all cover every workspace in the org, not just their own
 *  (or peer-shared) ones. Independent of the PLM Master Key toggle (plmMasterKey.js) — this is
 *  a pure department check with no override/bypass behavior attached. */
export function isTechDeptEligible(orgMembership) {
  if (!orgMembership || orgMembership.orgType !== 'merchant') return false
  return orgMembership.department === 'tech'
}
