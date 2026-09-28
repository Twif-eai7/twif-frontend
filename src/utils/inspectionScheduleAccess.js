/** Individually named QA staff who may manage the Inspection Schedule calendar, on top of Admins and the tech team. */
export const INSPECTION_SCHEDULE_MANAGER_EMAILS = new Set([
  "hi@eai7.com",
  "siddhrthsaini@mail.com",
  "katuri20@gmail.com",
  "saini.workspace@gmail.com",
]);

/** Create/edit/cancel/complete rights on the Inspection Schedule calendar. Everyone else with module access is read-only. */
export function canManageInspectionSchedule(email, orgMembership) {
  if (INSPECTION_SCHEDULE_MANAGER_EMAILS.has((email || "").trim().toLowerCase())) return true;
  const om = orgMembership;
  if (!om || om.orgType !== "merchant") return false;
  if (om.role === "admin" || om.role === "owner") return true;
  return om.department === "tech";
}

/**
 * Returns the email to restrict schedule visibility to, or null for no restriction.
 * The named schedule managers only see the entries they personally created
 * (created_by_email) unless they're a merchant Admin/Owner, who still see everything.
 */
export function ownScheduleRestrictionEmail(email, orgMembership) {
  const normalized = (email || "").trim().toLowerCase();
  if (!INSPECTION_SCHEDULE_MANAGER_EMAILS.has(normalized)) return null;
  const om = orgMembership;
  if (om && om.orgType === "merchant" && (om.role === "admin" || om.role === "owner")) return null;
  return normalized;
}

/**
 * Who may review/approve-or-reject a Rework request (PO Inspection - a QA
 * asking to redo a SKU's already-accepted stage). Deliberately department-
 * independent, unlike useIsAdmin() (which also requires department==='tech')
 * - any merchant org admin/owner, since Rework approval isn't a tech-team
 * concern specifically.
 */
export function isQaReworkAdmin(orgMembership) {
  const om = orgMembership;
  return !!om && om.orgType === "merchant" && (om.role === "admin" || om.role === "owner");
}
