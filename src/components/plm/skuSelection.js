// Whether a SKU can be selected at all for the given role. Shared between SKUCard.jsx (the
// individual checkbox) and SKUGroupSection.jsx (the group-level "select all in this batch"
// header) so both use the exact same rule — previously the group header ignored this entirely
// and would select every SKU in a group regardless of role/read-only status.
export const isSkuSelectable = (sku, role) =>
  (role === 'merchant' && !sku.is_read_only) || (role === 'buyer' && !!sku.workspace_id)