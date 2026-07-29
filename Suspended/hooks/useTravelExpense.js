import { useState, useCallback } from 'react';
import { useProfileStore } from '../stores/profileStore';

const PAGE_SIZE = 10;

const baseUrl = import.meta.env.VITE_BACKEND_URL || '';

export function useTravelExpense() {
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);

  const memberId = useProfileStore(s => s.orgMembership?.memberId);

  // ── Fetch all bills ───────────────────────────────────────
  const fetchBills = useCallback(async () => {
    if (!memberId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${baseUrl}/travel-expenses?memberId=${encodeURIComponent(memberId)}`
      );
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json();
      setBills(data.bills || []);
      setCurrentPage(1);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [memberId]);

  // ── Submit a new bill ─────────────────────────────────────
  const submitBill = useCallback(async ({ travelDate, amount, comments, file }) => {
    const fd = new FormData();
    fd.append('memberId', memberId);
    fd.append('travelDate', travelDate);
    fd.append('amount', amount);
    fd.append('comments', comments);
    if (file) fd.append('billFile', file);

    const res = await fetch(`${baseUrl}/travel-expenses/upload`, {
      method: 'POST',
      body: fd,
    });
    const result = await res.json();
    if (!res.ok) throw new Error(result.error || 'Upload failed');

    await fetchBills();
    return result;
  }, [memberId, fetchBills]);

  // ── Derived stats ─────────────────────────────────────────
  const stats = {
    total: bills.length,
    pending: bills.filter(b => b.status === 'pending').length,
    approved: bills.filter(b => b.status === 'approved').length,
    totalAmount: bills.reduce((s, b) => s + Number(b.amount || 0), 0),
  };

  // ── Pagination ────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(bills.length / PAGE_SIZE));
  const pagedBills = bills.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const goNext = () => setCurrentPage(p => Math.min(p + 1, totalPages));
  const goPrev = () => setCurrentPage(p => Math.max(p - 1, 1));

  return {
    bills,
    pagedBills,
    loading,
    error,
    stats,
    currentPage,
    totalPages,
    goNext,
    goPrev,
    fetchBills,
    submitBill,
  };
}