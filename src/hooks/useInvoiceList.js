import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase'; 
import { useProfileStore } from '../stores/profileStore'; 

const PAGE_SIZE = 15;

export function formatDate(str) {
  if (!str) return '—';
  const d = new Date(str + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatAmount(num, currency = 'USD') {
  return `${currency} ${Number(num).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function getPdfUrl(path) {
  return `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/invoice-documents/${path}`;
}

export function useInvoiceList() {
  const { orgMembership } = useProfileStore();

  const [allInvoices, setAllInvoices] = useState([]);
  const [buyerMap, setBuyerMap] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [buyerFilter, setBuyerFilter] = useState('');
  const [yearFilter,  setYearFilter]  = useState('');
  const [modeFilter,  setModeFilter]  = useState('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchInvoices = useCallback(async () => {
    if (!orgMembership?.memberId) return;
    setIsLoading(true);
    setError('');

    try {
      // 1. Fetch buyers accessible to this member
      let buyers = window.sharedBuyersData;
      if (!buyers?.length) {
        const { data: accessRows, error: accessError } = await supabase
          .from('member_organization_access')
          .select(`
            organizations (
              id,
              name,
              display_name,
              address,
              country,
              type
            )
          `)
          .eq('member_id', orgMembership.memberId)
          .eq('organizations.type', 'buyer');

        if (accessError) throw new Error(accessError.message);

        buyers = (accessRows || [])
          .map(row => row.organizations)
          .filter(Boolean);

        window.sharedBuyersData = buyers;
      }

      const map = {};
      buyers.forEach(b => { map[b.id] = b.display_name || b.name; });
      setBuyerMap(map);

      // 2. Fetch all invoices
      const { data, error: invoicesError } = await supabase
        .from('consultancy_invoices')
        .select(`
          id,
          invoice_number,
          invoice_date,
          amount,
          currency,
          status,
          invoice_mode,
          financial_year,
          pdf_path,
          created_at,
          buyer_org_id
        `)
        .order('created_at', { ascending: false });

      if (invoicesError) throw new Error(invoicesError.message);

      setAllInvoices(data || []);
    } catch (err) {
      console.error('Failed to load invoices', err);
      setError('Failed to load invoices. Please refresh.');
    } finally {
      setIsLoading(false);
    }
  }, [orgMembership?.memberId]);

  useEffect(() => {
    fetchInvoices();
    window.refreshInvoiceList = fetchInvoices;
  }, [fetchInvoices]);

  // ── Filter options ────────────────────────────────────────────────────────
  const buyerOptions = useMemo(() => {
    const ids = [...new Set(allInvoices.map(inv => inv.buyer_org_id))];
    return ids.map(id => ({ value: id, label: buyerMap[id] || id }));
  }, [allInvoices, buyerMap]);

  const yearOptions = useMemo(() => {
    const years = [...new Set(allInvoices.map(inv => inv.financial_year).filter(Boolean))];
    return years.sort().reverse().map(y => ({ value: y, label: y }));
  }, [allInvoices]);

  // ── Filtered invoices ─────────────────────────────────────────────────────
  const filteredInvoices = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return allInvoices.filter(inv => {
      const matchSearch = !q
        || inv.invoice_number?.toLowerCase().includes(q)
        || (buyerMap[inv.buyer_org_id] || '').toLowerCase().includes(q);
      const matchBuyer = !buyerFilter || inv.buyer_org_id === buyerFilter;
      const matchYear  = !yearFilter  || inv.financial_year === yearFilter;
      const matchMode  = !modeFilter  || inv.invoice_mode   === modeFilter;
      return matchSearch && matchBuyer && matchYear && matchMode;
    });
  }, [allInvoices, buyerMap, searchQuery, buyerFilter, yearFilter, modeFilter]);

  // Reset to page 1 whenever filters change
  useEffect(() => { setCurrentPage(1); }, [searchQuery, buyerFilter, yearFilter, modeFilter]);

  // ── Paginated invoices ────────────────────────────────────────────────────
  const totalPages   = Math.max(1, Math.ceil(filteredInvoices.length / PAGE_SIZE));
  const safePage     = Math.min(currentPage, totalPages);
  const pageStart    = (safePage - 1) * PAGE_SIZE;
  const pageInvoices = filteredInvoices.slice(pageStart, pageStart + PAGE_SIZE);

  // ── Stats ─────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total        = allInvoices.length;
    const totalValue   = allInvoices.reduce((s, inv) => s + Number(inv.amount || 0), 0);
    const uniqueBuyers = new Set(allInvoices.map(inv => inv.buyer_org_id)).size;
    const currentFY    = allInvoices[0]?.financial_year || null;
    const fyCount      = currentFY
      ? allInvoices.filter(inv => inv.financial_year === currentFY).length
      : 0;
    return { total, totalValue, uniqueBuyers, currentFY, fyCount };
  }, [allInvoices]);

  // Add this inside useInvoiceList(), before the return
const getInvoiceViewUrl = useCallback(async (invoiceId) => {
  try {
    const { data: invoice, error: invoiceError } = await supabase
      .from('consultancy_invoices')
      .select('pdf_path')
      .eq('id', invoiceId)
      .single();

    if (invoiceError || !invoice) throw new Error('Not found');

    const { data: signedData, error: signedError } = await supabase
      .storage
      .from('invoice-documents')
      .createSignedUrl(invoice.pdf_path, 300);

    if (signedError) throw signedError;
    return signedData.signedUrl;
  } catch (err) {
    console.error('Failed to get invoice URL', err);
    return null;
  }
}, []);

// And add to the return:
// getInvoiceViewUrl,

  return {
    // Data
    isLoading,
    error,
    allInvoices,
    filteredInvoices,
    pageInvoices,
    buyerMap,

    // Filter options
    buyerOptions,
    yearOptions,

    // Active filters
    searchQuery,  setSearchQuery,
    buyerFilter,  setBuyerFilter,
    yearFilter,   setYearFilter,
    modeFilter,   setModeFilter,

    // Pagination
    currentPage: safePage,
    totalPages,
    setCurrentPage,

    // Stats
    stats,

    getInvoiceViewUrl,

    // Actions
    refresh: fetchInvoices,
  };
}