/**
 * Displays a matched organization with a status badge.
 * Used in the onboarding org-lookup step.
 */
export default function OrgMatchCard({ org, badge = 'Found' }) {
  return (
    <div className="flex items-center gap-3.5 p-4 bg-stone-50 border border-stone-200 rounded-xl mb-5">
      {/* Avatar */}
      <div
        className="w-11 h-11 rounded-xl bg-stone-900 text-white flex items-center justify-center text-lg flex-shrink-0"
        style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}
      >
        {org.displayName?.[0]?.toUpperCase()}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-stone-900 truncate">
          {org.displayName}
        </div>
        <div className="text-xs text-stone-500 capitalize">
          {org.type} {org.country ? `· ${org.country}` : ''}
        </div>
      </div>

      {/* Badge */}
      <span className="px-2.5 py-1 bg-green-50 text-green-700 text-xs font-semibold rounded-full uppercase tracking-wide flex-shrink-0">
        {badge}
      </span>
    </div>
  )
}