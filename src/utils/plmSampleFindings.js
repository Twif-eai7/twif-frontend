// Master carton details used to be single flat fields (master_l/w/h/qty/pack_weight_kg) —
// one product can now ship across several cartons with different sizes each, so they live
// as findings.master_cartons: [{ qty, l, w, h, weight }]. This synthesizes that array from
// an older sample order's flat fields (or a blank single row for a brand-new one) so nothing
// entered before this feature existed gets lost, and so WorkspaceModal's live editor and
// PLMGuestChatPage's read-only view (which may still see the old flat shape in a past
// round's findings_json) share one derivation instead of two hand-kept copies. A plain
// function, not a component — kept out of BriefFields.jsx so that file stays component-only
// for Fast Refresh.
export function deriveMasterCartons(findings) {
  if (Array.isArray(findings?.master_cartons) && findings.master_cartons.length) return findings.master_cartons
  if (findings?.master_l || findings?.master_w || findings?.master_h || findings?.master_qty || findings?.master_pack_weight_kg) {
    return [{
      qty:    findings.master_qty ?? '',
      l:      findings.master_l ?? '',
      w:      findings.master_w ?? '',
      h:      findings.master_h ?? '',
      weight: findings.master_pack_weight_kg ?? '',
    }]
  }
  return [{ qty: '', l: '', w: '', h: '', weight: '' }]
}
