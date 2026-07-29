import { useEffect, useTransition, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useRole } from '../../../stores/profileStore'
import ComingSoon from '../ComingSoon'
import GoogleSheetEmbed from '../../../components/issues/GoogleSheetEmbed'
import { ISSUE_TRACKER_SHEET } from '../../../components/issues/issueTrackerConfig'

const DEFAULT_TAB = 'issue-tracker'

function IssueTrackerTab() {
  return (
    <div className="px-4 pb-8 pt-2 lg:px-6">
      <div className="mb-4">
        <h1 className="text-xl font-bold text-gray-900">Issue Tracker</h1>
        <p className="mt-1 text-sm text-gray-500">Live spreadsheet — zoom, refresh, or open in Google Sheets.</p>
      </div>
      <GoogleSheetEmbed
        sheetId={ISSUE_TRACKER_SHEET.sheetId}
        gid={ISSUE_TRACKER_SHEET.gid}
        title={ISSUE_TRACKER_SHEET.title}
        height={ISSUE_TRACKER_SHEET.height}
        width={ISSUE_TRACKER_SHEET.width}
        viewMode={ISSUE_TRACKER_SHEET.viewMode}
        showToolbar={ISSUE_TRACKER_SHEET.showToolbar}
        allowFullscreen={ISSUE_TRACKER_SHEET.allowFullscreen}
        lazyLoad={ISSUE_TRACKER_SHEET.lazyLoad}
      />
    </div>
  )
}

function TabContent({ tab }) {
  if (tab === DEFAULT_TAB) return <IssueTrackerTab />
  if (tab) return <ComingSoon />
  return null
}

export default function IssuesSection() {
  const role = useRole()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const tab = params.get('tab')

  const [isPending, startTransition] = useTransition()
  const [activeTab, setActiveTab] = useState(tab)

  useEffect(() => {
    if (!tab && role === 'Merchant') {
      navigate(`/dashboard/issues?tab=${DEFAULT_TAB}`, { replace: true })
    }
  }, [tab, role, navigate])

  useEffect(() => {
    if (tab) startTransition(() => setActiveTab(tab))
  }, [tab, startTransition])

  if (role !== 'Merchant') {
    return <ComingSoon />
  }

  return (
    <div className="relative">
      {isPending && (
        <div className="absolute inset-x-0 top-0 z-50 h-0.5 animate-pulse bg-blue-500" />
      )}
      <TabContent tab={activeTab} />
    </div>
  )
}
