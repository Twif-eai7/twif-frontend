const AUDIT_DATA = [
  { type: "SMETA Certified",   count: 67, coverage: 70.5 },
  { type: "BSCI Certified",    count: 8,  coverage: 8.4  },
  { type: "SA 8000 Certified", count: 5,  coverage: 5.3  },
  { type: "ICS Certified",     count: 1,  coverage: 1.1  },
];

const STATS = [
  { label: "Total Suppliers",      value: 95,   meta: null,    style: "default"   },
  { label: "Certified Suppliers",  value: 81,   meta: "85.3%", style: "highlight" },
  { label: "No Audit Certificate", value: 14,   meta: "14.7%", style: "muted"     },
];

const statTileClass = {
  default:   "bg-white border border-gray-200 hover:border-black",
  highlight: "bg-white border border-black",
  muted:     "bg-gray-50 border border-gray-200 hover:border-black",
};

export default function QaReport() {
  return (
    <div className=" p-4">

      {/* Page Title */}
      <h2 className="text-lg font-semibold text-black mb-4">
        Supplier Audit Summary
      </h2>

      {/* Stat Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-7">
        {STATS.map((stat) => (
          <div
            key={stat.label}
            className={`rounded-lg p-4 transition-colors duration-200 ${statTileClass[stat.style]}`}
          >
            <span className="block text-xs text-gray-500 mb-1">{stat.label}</span>
            <span className="text-2xl font-semibold text-black">{stat.value}</span>
            {stat.meta && (
              <span className="text-xs text-gray-500 ml-2">{stat.meta}</span>
            )}
          </div>
        ))}
      </div>

      {/* Audit Distribution Table */}
      <div className="bg-white">

        {/* Header */}
        <div className="grid grid-cols-[2fr_1fr_2fr] border-b border-gray-200 pb-2 mb-1">
          <span className="text-sm font-semibold text-black">Type of Audit</span>
          <span className="text-sm font-semibold text-black">No. of Suppliers</span>
          <span className="text-sm font-semibold text-black">Coverage</span>
        </div>

        {/* Rows */}
        {AUDIT_DATA.map((item) => (
          <div
            key={item.type}
            className="grid grid-cols-[2fr_1fr_2fr] items-center py-3 border-b border-gray-100 text-sm"
          >
            <span className="text-gray-900">{item.type}</span>
            <span className="text-gray-700">{item.count}</span>

            <div>
              <div className="h-[5px] bg-gray-200 rounded overflow-hidden mb-1">
                <div
                  className="h-full bg-black rounded"
                  style={{ width: `${item.coverage}%` }}
                />
              </div>
              <small className="text-xs text-gray-500">{item.coverage}%</small>
            </div>
          </div>
        ))}

      </div>
    </div>
  );
}