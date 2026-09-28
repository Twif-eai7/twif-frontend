/** Tech-department merchant members get a "master key" — full view+act override across
 *  all PLM workspaces/SKUs, bypassing normal merchant/buyer/supplier role gating. */
export function isPlmMasterKeyEligible(orgMembership) {
  if (!orgMembership || orgMembership.orgType !== 'merchant') return false
  return orgMembership.department === 'tech'
}
