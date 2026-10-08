import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useProfileStore } from '../stores/profileStore';
import { normStr } from '../utils/plDataHelpers';

// Same list as AnalyticsV2Section.jsx's own merchant dropdown (and
// MerchantDashboard before it) - internal/admin accounts that aren't real
// merchandising-team "merchants" a PO can be filtered by.
export const EXCLUDED_MERCHANTS = new Set([
  'nitin@jnitin.com', 'nishant@jnitin.com', 'erp2@jnitn.com', 'faisal@jnitin.com',
  'ritika@jnitin.com', 'manas@jnitin.com', 'shyam@jnitin.com', 'rahul.kulkarni@jnitin.com',
  'shalini@jnitin.com', 'vishal@jnitin.com', 'milan.aggarwal@arpl-alm.in', 'mis@jnitin.com',
  'erp2@jnitin.com', 'amit.sharma@jnitin.com', 'siddarth@abia.in', 'suresh@jnitin.com',
  'inspection@jnitin.com', 'dharinie.mittal@jnitin.com',
]);

const AMBIGUOUS_MERCHANT_PAIR = new Set(['Lakshit Bohra', 'Shayni Sharma']);

// Which buyer orgs (and, for link-restricted grants, which specific
// buyer+vendor pairs) a merchandising-team member has access to - same
// member_organization_access -> buyer_supplier_links -> organizations
// resolution DashboardAnalyticsModal.jsx's loadMerchantMap uses, kept at
// buyer+vendor PAIR granularity rather than collapsing to just the buyer
// org (resolveBuyerOrgsForMember does that collapse, which is wrong here:
// a buyer like NKUKU can be split across multiple merchants by vendor
// link, so crediting a merchant with every row for that buyer name,
// regardless of vendor, overstates their numbers with other merchants'
// share of the same buyer).
async function resolveMerchantAccess(memberId) {
  if (!memberId) return { unrestrictedBuyers: new Set(), linkPairs: new Set() };

  const { data: access } = await supabase
    .from('member_organization_access')
    .select('buyer_supplier_link_id, organization_id')
    .eq('member_id', memberId);
  if (!access?.length) return { unrestrictedBuyers: new Set(), linkPairs: new Set() };

  const directLinkIds = access.map((r) => r.buyer_supplier_link_id).filter(Boolean);
  const fallbackOrgIds = access.filter((r) => !r.buyer_supplier_link_id).map((r) => r.organization_id).filter(Boolean);

  let links = [];
  if (directLinkIds.length) {
    const { data } = await supabase
      .from('buyer_supplier_links')
      .select('id, buyer_org_id, supplier_org_id')
      .in('id', directLinkIds);
    links = data || [];
  }

  const orgIds = new Set(fallbackOrgIds);
  links.forEach((l) => { if (l.buyer_org_id) orgIds.add(l.buyer_org_id); if (l.supplier_org_id) orgIds.add(l.supplier_org_id); });
  if (!orgIds.size) return { unrestrictedBuyers: new Set(), linkPairs: new Set() };

  const { data: orgs } = await supabase
    .from('organizations')
    .select('id, display_name, name')
    .in('id', [...orgIds]);
  const nameById = new Map((orgs || []).map((o) => [o.id, o.display_name || o.name]));

  const unrestrictedBuyers = new Set(fallbackOrgIds.map((id) => nameById.get(id)).filter(Boolean).map(normStr));
  const linkPairs = new Set(
    links
      .map((l) => {
        const buyerName = nameById.get(l.buyer_org_id);
        const vendorName = nameById.get(l.supplier_org_id);
        return buyerName && vendorName ? `${normStr(buyerName)}||${normStr(vendorName)}` : null;
      })
      .filter(Boolean)
  );
  return { unrestrictedBuyers, linkPairs };
}

/**
 * "View as that merchant" narrowing - shared by every Financial page that
 * offers a Merchant filter (first built in WeeklyPoSchedule.jsx). Resolves
 * the selected merchandising-team member's real buyer+vendor access
 * (resolveMerchantAccess above), then exposes merchantMatchesRow() so each
 * page can filter its own already-fetched rows client-side without a
 * server round trip - switching merchants should feel instant, not reload
 * the page.
 *
 * @param {object} buyersAccess - the object returned by useMerchantPoBuyersAccess()
 */
export function useMerchantSwitcher(buyersAccess) {
  const orgId = useProfileStore((s) => s.orgMembership)?.orgId;
  const [merchantList, setMerchantList] = useState([]);
  const [selectedMerchant, setSelectedMerchant] = useState('');
  const [merchantAccess, setMerchantAccess] = useState(null);

  useEffect(() => {
    if (!orgId) return;
    supabase.from('organization_members').select('id, full_name, email')
      .eq('organization_id', orgId).eq('department', 'merchandising').is('removed_at', null)
      .then(({ data }) => {
        setMerchantList((data || []).filter((m) => m.id && m.email && !EXCLUDED_MERCHANTS.has(m.email)));
      });
  }, [orgId]);

  useEffect(() => {
    if (!selectedMerchant) { setMerchantAccess(null); return; }
    let cancelled = false;
    const member = merchantList.find((m) => (m.full_name || m.email) === selectedMerchant);
    if (!member) { setMerchantAccess({ unrestrictedBuyers: new Set(), linkPairs: new Set() }); return; }
    resolveMerchantAccess(member.id).then((access) => {
      if (!cancelled) setMerchantAccess(access);
    });
    return () => { cancelled = true; };
  }, [selectedMerchant, merchantList]);

  const merchantMatchesRow = useMemo(() => {
    if (!selectedMerchant) return null;
    return (row) => {
      if (!merchantAccess) return false;
      const baseMatch = merchantAccess.unrestrictedBuyers.has(normStr(row.customer))
        || merchantAccess.linkPairs.has(`${normStr(row.customer)}||${normStr(row.vendor)}`);
      if (!baseMatch) return false;
      // Lakshit Bohra and Shayni Sharma share one identical org-wide
      // member_organization_access grant over House Doctor (same root
      // cause DashboardAnalyticsModal.jsx's resolveAmbiguousMerchantPair
      // handles) - access alone can't tell their rows apart, so fall back
      // to each row's created_by, same default-to-Shayni-unless-created-by-
      // says-Lakshit rule used there. Only shipped rows carry createdBy
      // today (open-po-summary's RPC doesn't yet) - an open-PO row for
      // this pair falls through to the Shayni default either way.
      if (AMBIGUOUS_MERCHANT_PAIR.has(selectedMerchant)) {
        const isLakshitRow = (row.createdBy || '').toLowerCase().includes('lakshit bohra');
        return selectedMerchant === 'Lakshit Bohra' ? isLakshitRow : !isLakshitRow;
      }
      return true;
    };
  }, [selectedMerchant, merchantAccess]);

  return { merchantList, selectedMerchant, setSelectedMerchant, merchantMatchesRow };
}
