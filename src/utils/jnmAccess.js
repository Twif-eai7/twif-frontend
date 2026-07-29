/** Users who may access P&L JNM, Overall P&L, monthly P&L modal, and Expences & EBIDTA */
export const JNM_ALLOWED_EMAILS = new Set([
  "shyam@jnitin.com",
  "sk@twif.io",
  "lokesh.sharma@jnitin.com",
  "nishant@jnitin.com",
  "nitin@jnitin.com",
  "abhishek.singh@abia.in",
  "ajay.goyal@abia.in",
  "manas@jnitin.com",
  "siddarth@abia.in",
]);

export function canAccessJnm(email) {
  return JNM_ALLOWED_EMAILS.has((email || "").trim().toLowerCase());
}

/**
 * JNM P&L surfaces (sub-tabs, P&L JNM / Overall P&L, monthly P&L modal).
 * Regular merchant members are excluded — same admin gate as profileStore useIsAdmin.
 */
export function canAccessJnmPlFeatures(email, orgMembership) {
  if (!canAccessJnm(email)) return false;
  const om = orgMembership;
  if (!om || om.orgType !== "merchant") return false;
  return (
    (om.role === "admin" || om.role === "owner") &&
    (om.department === "tech" || om.department === null)
  );
}

/** M. Expenses / Exp % in PO schedule header — tech-dept JNM admins only (not merchandising merchants). */
export function canSeeMonthlyExpenseHeader(email, orgMembership) {
  if (!canAccessJnm(email)) return false;
  const om = orgMembership;
  if (!om || om.orgType !== "merchant") return false;
  return om.role === "admin" && om.department === "tech";
}
