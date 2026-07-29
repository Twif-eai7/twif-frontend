import { useState, useEffect, useRef } from "react";

export default function CommissionCell({ poNo, initialValue, onSave, readOnly = false }) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(initialValue ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => { if (!editing) setLocal(initialValue ?? ""); }, [initialValue, editing]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const commit = async () => {
    setEditing(false);
    setSaveError(null);
    const orig = String(initialValue ?? "");
    if (String(local) === orig) return;
    setSaving(true);
    try {
      await onSave(poNo, local);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      setSaveError(e.message || "Save failed");
      setLocal(initialValue ?? "");
    } finally {
      setSaving(false);
    }
  };

  if (readOnly) {
    return (
      <div className="flex items-center justify-start lg:justify-end min-w-[64px]">
        <span className="text-xs font-mono text-black font-semibold">
          {local !== "" && local != null ? `${local}%` : "—"}
        </span>
      </div>
    );
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") { setEditing(false); setLocal(initialValue ?? ""); }
        }}
        onClick={(e) => e.stopPropagation()}
        type="number" min="0" max="100" step="0.01"
        className="w-full max-w-[5rem] px-1.5 py-0.5 border border-blue-400 rounded text-xs font-mono text-right focus:outline-none focus:ring-2 focus:ring-blue-200"
      />
    );
  }

  return (
    <div
      onClick={(e) => { e.stopPropagation(); setEditing(true); }}
      title="Click to edit"
      className="flex items-center justify-start lg:justify-end gap-1.5 cursor-pointer group min-w-[64px]"
    >
      {saving ? (
        <div className="w-3 h-3 border border-gray-200 border-t-blue-500 rounded-full animate-spin" />
      ) : saved ? (
        <span className="text-green-500 text-xs">✓</span>
      ) : saveError ? (
        <span className="text-red-500 text-[10px]" title={saveError}>⚠ error</span>
      ) : (
        <>
          <span className={`text-xs font-mono ${local !== "" && local != null ? "text-black font-semibold" : "text-black"}`}>
            {local !== "" && local != null ? `${local}%` : "—"}
          </span>
          <svg className="w-3 h-3 text-black opacity-60 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity shrink-0"
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </>
      )}
    </div>
  );
}
