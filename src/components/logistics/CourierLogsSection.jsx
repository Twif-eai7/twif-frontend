import { useState } from 'react'
import CourierLogsTable from './CourierLogsTable'
import InternationalCourierLogsTable from './InternationalCourierLogsTable'

const TABS = [
  {
    id: 'domestic',
    label: 'Domestic',
    sub: 'Outward',
    icon: (
      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    id: 'international',
    label: 'International',
    sub: 'Export',
    icon: (
      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
      </svg>
    ),
  },
]

export default function CourierLogsSection() {
  const [activeTab, setActiveTab] = useState('domestic')

  return (
    <div>
      {/* ── Tab switcher ── */}
      <div className="px-4 md:px-6 pt-4 md:pt-6">
        <div className="inline-flex items-center bg-gray-100 rounded-xl p-1 gap-1">
          {TABS.map(tab => {
            const active = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all duration-150
                  ${active
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                  }`}
              >
                <span className={active ? 'text-gray-700' : 'text-gray-400'}>{tab.icon}</span>
                <span>{tab.label}</span>
                <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-md ${
                  active ? 'bg-gray-100 text-gray-500' : 'bg-gray-200 text-gray-400'
                }`}>
                  {tab.sub}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Active table ── */}
      {activeTab === 'domestic'
        ? <CourierLogsTable />
        : <InternationalCourierLogsTable />
      }
    </div>
  )
}
