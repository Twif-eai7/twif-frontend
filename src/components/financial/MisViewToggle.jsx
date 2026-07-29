const VIEWS = [
  ["summary", "MIS Summary"],
  ["division", "MIS Division"],
  ["buyer", "MIS Buyer wise"],
];

export default function MisViewToggle({ value, onChange, className = "" }) {
  return (
    <div className={`max-w-full overflow-x-auto scrollbar-hide ${className}`}>
      <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden shrink-0 min-w-max">
        {VIEWS.map(([view, label]) => {
          const isActive = value === view;
          return (
            <button
              key={view}
              type="button"
              onClick={() => onChange(view)}
              className={`inline-flex items-center gap-1 px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap
                ${isActive ? "bg-indigo-600 text-white" : "bg-white text-black hover:bg-gray-50"}`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
