import { useJnmPlAccess } from "../../hooks/useJnmPlAccess";

const MODES = [
  ["jng", "P&L Twif", false],
  ["jnm", "P&L JNM", true],
  ["overall", "Overall P&L", true],
];

export default function PlModeToggle({ value, onChange, className = "" }) {
  const hasJnmPlAccess = useJnmPlAccess();
  const options = MODES.filter(([mode]) => mode === "jng" || hasJnmPlAccess);

  return (
    <div className={`max-w-full overflow-x-auto scrollbar-hide ${className}`}>
      <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden shrink-0 min-w-max">
      {options.map(([mode, label, beta]) => {
        const isActive = value === mode;
        return (
          <button
            key={mode}
            type="button"
            onClick={() => onChange(mode)}
            className={`inline-flex items-center gap-1 px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap
              ${isActive ? "bg-indigo-600 text-white" : "bg-white text-black hover:bg-gray-50"}`}
          >
            {label}
            {beta && hasJnmPlAccess ? (
              <span className={`text-[9px] font-bold px-1 py-px rounded tracking-wide ${isActive ? "bg-white/20 text-white" : "bg-indigo-100 text-indigo-600"}`}>
                BETA
              </span>
            ) : null}
          </button>
        );
      })}
      </div>
    </div>
  );
}
