import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { useProfileStore } from "../stores/profileStore";

const API_BASE = import.meta.env.VITE_BACKEND_URL;

// ── Invoice number helper ─────────────────────────────────────────────────────
function parseInvoiceData(data, mode) {
  if (!data.configured) {
    return { prefix: "—", middle: "", suffix: "", hint: "No invoice series configured for this buyer.", readOnly: true, show: false };
  }

  if (mode === "manual") {
    return {
      prefix:   `${data.prefix}-`,
      middle:   "",
      suffix:   `N-${data.financial_year}`,
      hint:     data.auto_initialized
        ? `Manual entry. Auto-sequence is at ${String(data.current_number).padStart(3, "0")} and won't be affected.`
        : "Manual entry. Auto-sequence not yet initialized — it won't be affected.",
      readOnly: false,
      show:     true,
    };
  }

  // Auto mode — not yet initialized
  if (!data.auto_initialized) {
    return {
      prefix:   `${data.prefix}-`,
      middle:   "",
      suffix:   `N-${data.financial_year}`,
      hint:     "Series not yet initialized. Enter the first invoice number (e.g. 001) to start the auto-sequence.",
      readOnly: false,
      show:     true,
    };
  }

  // Auto mode — initialized (read-only)
  const match = data.invoiceNo?.match(/^([A-Z]+)-(\d+)N-(\d{2}-\d{2})$/);
  return {
    prefix:   match ? `${match[1]}-` : `${data.prefix}-`,
    middle:   match ? match[2] : "",
    suffix:   match ? `N-${match[3]}` : `N-${data.financial_year}`,
    hint:     "",
    readOnly: true,
    show:     true,
  };
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useInvoice({ onSuccess } = {}) {
  const { orgMembership } = useProfileStore();
  const counterRef = useRef(1);

  const [buyers,          setBuyers]          = useState([]);
  const [buyersLoading,   setBuyersLoading]   = useState(false);
  const [selectedBuyerId, setSelectedBuyerId] = useState("");
  const [selectedBuyer,   setSelectedBuyer]   = useState(null);
  const [invoiceMode,     setInvoiceMode]     = useState("system");
  const [invoiceDate,     setInvoiceDate]     = useState(new Date().toISOString().split("T")[0]);
  const [invoiceNoData,   setInvoiceNoData]   = useState({
    prefix: "—", middle: "", suffix: "", hint: "", readOnly: true, show: false,
  });
  const [lineItems,  setLineItems]  = useState([{ id: 1, description: "", amount: "" }]);
  const [submitting, setSubmitting] = useState(false);
  const [success,    setSuccess]    = useState("");
  const [error,      setError]      = useState("");

  // ── Derived ───────────────────────────────────────────────────────────────
  const total = lineItems.reduce((sum, item) => {
    const v = parseFloat(item.amount);
    return sum + (isNaN(v) ? 0 : v);
  }, 0);

  // ── Fetch buyers ──────────────────────────────────────────────────────────
  const fetchBuyers = useCallback(async () => {
    if (!orgMembership?.memberId) return;
    setBuyersLoading(true);
    try {
      const { data: accessRows, error: accessError } = await supabase
        .from("member_organization_access")
        .select(`
          organization_id,
          organizations (
            id,
            display_name,
            address,
            country
          )
        `)
        .eq("member_id", orgMembership.memberId)
        .eq("organizations.type", "buyer");

      if (accessError) throw accessError;

      setBuyers(
        (accessRows || [])
          .map(row => row.organizations)
          .filter(Boolean)
          .map(org => ({
            id:      org.id,
            name:    org.display_name || "Unknown",
            address: org.address || "",
            country: org.country || "",
          }))
      );
    } catch {
      setBuyers([]);
    } finally {
      setBuyersLoading(false);
    }
  }, [orgMembership?.memberId]);

  useEffect(() => { fetchBuyers(); }, [fetchBuyers]);

  // ── Fetch invoice number ──────────────────────────────────────────────────
  const fetchInvoiceNumber = useCallback(async (buyerId, mode) => {
    setInvoiceNoData({ prefix: "—", middle: "", suffix: "", hint: "", readOnly: true, show: false });
    try {
      // 1. Fetch the series config for this buyer
      const { data: series, error: seriesError } = await supabase
        .from("invoice_series")
        .select("*")
        .eq("buyer_org_id", buyerId)
        .maybeSingle();

      if (seriesError) throw seriesError;

      // No series configured
      if (!series) {
        setInvoiceNoData(parseInvoiceData({ configured: false }, mode));
        return;
      }

      // Series exists but auto not yet initialized
      if (!series.auto_initialized) {
        setInvoiceNoData(parseInvoiceData({
          configured:       true,
          auto_initialized: false,
          prefix:           series.prefix,
          financial_year:   series.financial_year,
        }, mode));
        return;
      }

      // 2. Walk forward from current_number to find the next free slot
      let nextNumber = series.auto_current_number + 1;
      const MAX_ATTEMPTS = 50;

      for (let attempts = 0; attempts < MAX_ATTEMPTS; attempts++) {
        const padded    = String(nextNumber).padStart(3, "0");
        const candidate = `${series.prefix}-${padded}N-${series.financial_year}`;

        const { data: existing } = await supabase
          .from("consultancy_invoices")
          .select("id")
          .eq("invoice_number", candidate)
          .maybeSingle();

        if (!existing) break;
        nextNumber++;
      }

      const padded    = String(nextNumber).padStart(3, "0");
      const invoiceNo = `${series.prefix}-${padded}N-${series.financial_year}`;

      setInvoiceNoData(parseInvoiceData({
        configured:       true,
        auto_initialized: true,
        invoiceNo,
        prefix:           series.prefix,
        financial_year:   series.financial_year,
        current_number:   series.auto_current_number,
      }, mode));
    } catch {
      setInvoiceNoData(prev => ({
        ...prev,
        hint: "Could not load invoice series. Please refresh and try again.",
      }));
    }
  }, []);

  // ── Buyer change ──────────────────────────────────────────────────────────
  const onBuyerChange = useCallback(async (id) => {
    setSelectedBuyerId(id);
    setError("");
    if (!id) {
      setSelectedBuyer(null);
      setInvoiceNoData({ prefix: "—", middle: "", suffix: "", hint: "", readOnly: true, show: false });
      return;
    }
    const buyer = buyers.find(b => String(b.id) === String(id));
    setSelectedBuyer(buyer || null);
    await fetchInvoiceNumber(id, invoiceMode);
  }, [buyers, invoiceMode, fetchInvoiceNumber]);

  // ── Mode change ───────────────────────────────────────────────────────────
  const onModeChange = useCallback(async (mode) => {
    setInvoiceMode(mode);
    if (selectedBuyerId) await fetchInvoiceNumber(selectedBuyerId, mode);
  }, [selectedBuyerId, fetchInvoiceNumber]);

  // ── Line items ────────────────────────────────────────────────────────────
  const addLineItem = useCallback(() => {
    counterRef.current += 1;
    setLineItems(prev => [...prev, { id: counterRef.current, description: "", amount: "" }]);
  }, []);

  const removeLineItem = useCallback((id) => {
    setLineItems(prev => prev.filter(item => item.id !== id));
  }, []);

  const updateLineItem = useCallback((id, field, value) => {
    setLineItems(prev =>
      prev.map(item => item.id === id ? { ...item, [field]: value } : item)
    );
  }, []);

  // ── Reset ─────────────────────────────────────────────────────────────────
  const resetForm = useCallback(() => {
    setSelectedBuyerId("");
    setSelectedBuyer(null);
    setInvoiceMode("system");
    setInvoiceDate(new Date().toISOString().split("T")[0]);
    setInvoiceNoData({ prefix: "—", middle: "", suffix: "", hint: "", readOnly: true, show: false });
    counterRef.current = 1;
    setLineItems([{ id: 1, description: "", amount: "" }]);
    setSuccess("");
    setError("");
  }, []);

  // ── Submit ────────────────────────────────────────────────────────────────
  const submitInvoice = useCallback(async (middleValue) => {
    setError("");
    setSuccess("");

    if (!selectedBuyerId)                     { setError("Please select a buyer.");                                    return; }
    if (!middleValue?.trim())                 { setError("Please enter the invoice sequence number.");                  return; }
    if (!/^\d+$/.test(middleValue.trim()))    { setError("Sequence number must be digits only (e.g. 001).");           return; }

    const validItems = lineItems.filter(
      item => item.description.trim() && parseFloat(item.amount) > 0
    );
    if (!validItems.length) { setError("Add at least one valid line item with a description and amount."); return; }

    const paddedNum      = middleValue.trim().padStart(3, "0");
    const prefix         = invoiceNoData.prefix.replace(/-$/, "").trim();
    const finalInvoiceNo = `${prefix}-${paddedNum}${invoiceNoData.suffix}`;

    setSubmitting(true);
    try {
      const payload = {
        invoiceNo:    finalInvoiceNo,
        invoiceDate,
        memberId:     orgMembership.memberId,
        buyer: {
          id:      selectedBuyerId,
          name:    selectedBuyer?.name    || "",
          address: selectedBuyer?.address || "",
          country: selectedBuyer?.country || "",
        },
        lineItems: validItems.map((item, i) => ({
          srNo:        i + 1,
          description: item.description.trim(),
          purposeCode: "P1006",
          total:       parseFloat(item.amount) || 0,
        })),
        totalAmount:  total,
        currency:     "USD",
        invoiceMode,
      };

      const res = await fetch(`${API_BASE}/consultancy/gen-invoice`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Generation failed");
      }

      const result = await res.json();
      if (!result.success) throw new Error(result.error || "Generation failed");

      setSuccess(result.message || "Invoice generated successfully!");
      await fetchInvoiceNumber(selectedBuyerId, invoiceMode);
      onSuccess?.({ invoiceId: result.invoiceId });
      resetForm();
      setTimeout(() => setSuccess(""), 5000);
    } catch (err) {
      setError(err.message || "Error generating invoice.");
    } finally {
      setSubmitting(false);
    }
  }, [
    selectedBuyerId, selectedBuyer, lineItems, invoiceNoData,
    invoiceDate, invoiceMode, total, orgMembership?.memberId,
    fetchInvoiceNumber, resetForm, onSuccess,
  ]);

  return {
    // state
    buyers, buyersLoading,
    selectedBuyerId, selectedBuyer,
    invoiceMode, invoiceDate, invoiceNoData,
    lineItems, total,
    submitting, success, error,
    // actions
    onBuyerChange, onModeChange,
    setInvoiceDate,
    addLineItem, removeLineItem, updateLineItem,
    submitInvoice, resetForm
  };
}