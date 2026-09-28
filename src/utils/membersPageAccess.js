/** Users who may open the Admin "Manage Members" page. Everyone else is redirected. */
export const MEMBERS_PAGE_ALLOWED_EMAILS = new Set([
  "hi@eai7.com",
  "siddhrthsaini@mail.com",
  "katuri20@gmail.com",
  "saini.workspace@gmail.com",
]);

export function canAccessMembersPage(email) {
  return MEMBERS_PAGE_ALLOWED_EMAILS.has((email || "").trim().toLowerCase());
}
