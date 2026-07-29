import { useState, useEffect, useRef } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import Dock from './components/shared/Dock'
// import AnalyticsV2Section from './pages/Dashboard/sections/AnalyticsV2Section'
// import AnalyticsV3Section from './pages/Dashboard/sections/AnalyticsV3Section'
import AnalyticsDummySection from './pages/Dashboard/sections/AnalyticsDummySection'
import HomePage from './pages/HomePage'
import AuthPage from './pages/Auth/AuthPage'
import OTPPage from './pages/Auth/OtpPage'
import OnboardingPage from './pages/Auth/OnboardingPage'
import Dashboard from './pages/Dashboard/Dashboard'
import AnalyticsSection from './pages/Dashboard/sections/AnalyticsSection'
import OrdersSection    from './pages/Dashboard/sections/OrdersSection'
import FinancialSection from './pages/Dashboard/sections/FinancialSection'
import NpdSection       from './pages/Dashboard/sections/NpdSection'
import ProfileSection   from './pages/Dashboard/sections/ProfileSection'
import SupportSection   from './pages/Dashboard/sections/SupportSection'
import CatalogsSection  from './pages/Dashboard/sections/CatalogsSection'
import LogisticsSection from './pages/Dashboard/sections/LogisticsSection'
import PctBetaPage from './pages/PctBetaPage'
import PLMPage from './pages/PLMPage'
import PLMVedeeoPage from './pages/PLMVedeeoPage'
import PLMAccessPage from './pages/PLMAccessPage'
import UserManualPage from './pages/UserManualPage'

import ApprovalsPage from './pages/Admin/ApprovalsPage'
import OrganisationsPage from './pages/Admin/OrganisationsPage'
import MembersPage from './pages/Admin/MembersPage'
import AnalyticsPage from './pages/Admin/AnalyticsPage'
import SignatureSettingsPage from './pages/Admin/SignatureSettingsPage'

import { useAuth } from './hooks/useAuth'
import { useRecentWorkspaces } from './hooks/useRecentWorkspaces'
import { useProfileStore } from './stores/profileStore'
import { Spinner } from './components/ui'

/**
 * Guards a route by auth session + profile load.
 * Shows a spinner until both are ready, then renders children.
 * Redirects to /auth if no session.
 */
function RequireAuth({ children }) {
  const { session, loading: authLoading, user } = useAuth()
  const profileLoading  = useProfileStore((s) => s.profileLoading)
  const profileFetched  = useProfileStore((s) => s.profileFetched)
  const portalUser      = useProfileStore((s) => s.portalUser)
  const orgMembership   = useProfileStore((s) => s.orgMembership)

  // Still initialising auth
  if (authLoading || (session && !profileFetched && profileLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="flex flex-col items-center gap-3">
          <Spinner light={false} size="w-6 h-6" />
          <span className="text-sm text-stone-400">Loading…</span>
        </div>
      </div>
    )
  }

  if (!session) return <Navigate to="/auth" replace />

  if (profileFetched) {
    // No portal_users row or onboarding form not yet submitted
    if (!portalUser || !portalUser.onboarding_completed) {
      return <Navigate to="/onboarding" state={{ email: user?.email }} replace />
    }

    // Form submitted but account still pending review (no approved org membership)
    if (!orgMembership) {
      return <Navigate to="/onboarding" state={{ email: user?.email, pendingReview: true }} replace />
    }
  }

  return children
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public */}
          <Route path="/" element={<Navigate to="/auth" replace />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/auth/buyer" element={<AuthPage forcedRole="buyer" />} />
          <Route path="/auth/vendor" element={<AuthPage forcedRole="supplier" />} />
          <Route path="/auth/vendor/verify-otp" element={<OTPPage forcedRole="supplier" />} />
          <Route path="/auth/vendor/onboarding_vendor" element={<OnboardingPage forcedRole="supplier" />} />
          <Route path="/verify-otp" element={<OTPPage />} />
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/login" element={<Navigate to="/auth" replace />} />
          <Route path="/signup" element={<Navigate to="/auth" replace />} />

          {/* Main dashboard — nested routes, one per NavCategory */}
          <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>}>
            <Route index            element={<AnalyticsSection />} />
            <Route path="orders"    element={<OrdersSection />} />
            <Route path="financial" element={<FinancialSection />} />
            <Route path="logistics" element={<LogisticsSection />} />
            <Route path="npd"       element={<NpdSection />} />
            <Route path="profile"   element={<ProfileSection />} />
            <Route path="support"   element={<SupportSection />} />
            {/* <Route path="analytics-v2" element={<AnalyticsV2Section />} />
            <Route path="analytics-v3" element={<AnalyticsV3Section />} /> */}
            <Route path="analytics-demo" element={<AnalyticsDummySection />} />
            <Route path="catalogs"  element={<CatalogsSection />} />
          </Route>
          {/* Legacy merchant-dashboard URL */}
          <Route path="/merchant-dashboard" element={<Navigate to="/dashboard" replace />} />
          {/* <Route path="analytics-v2" element={<AnalyticsV2Section />} /> */}
          <Route path="/pct-beta" element={<RequireAuth><PctBetaPage /></RequireAuth>} />
          <Route path="/plm/vedeeo" element={<RequireAuth><PLMVedeeoPage /></RequireAuth>} />
          <Route path="/plm" element={<RequireAuth><PLMPage /></RequireAuth>} />
          <Route path="/plm/accept" element={<PLMAccessPage />} />
          <Route path="/user-manual" element={ <RequireAuth><UserManualPage /> </RequireAuth>} />


          {/* Admin */}
          <Route path="/admin" element={<Navigate to="/admin/approvals" replace />} />
          <Route path="/admin/approvals"    element={<RequireAuth><ApprovalsPage /></RequireAuth>} />
          <Route path="/admin/organisations" element={<RequireAuth><OrganisationsPage /></RequireAuth>} />
          <Route path="/admin/members"      element={<RequireAuth><MembersPage /></RequireAuth>} />
          <Route path="/admin/analytics"    element={<RequireAuth><AnalyticsPage /></RequireAuth>} />
          <Route path="/admin/signature"    element={<RequireAuth><SignatureSettingsPage /></RequireAuth>} />

          <Route path="*" element={<Navigate to="/auth" replace />} />
        </Routes>
        <AppFloatingDock />
      </AuthProvider>
    </BrowserRouter>
  )
}

function wsInitials(supplier, label) {
  const src = supplier || label || ''
  if (!src) return '??'
  const words = src.trim().split(/\s+/)
  return words.length >= 2
    ? (words[0][0] + words[1][0]).toUpperCase()
    : src.slice(0, 2).toUpperCase()
}

function AppFloatingDock() {
  const { session }                   = useAuth()
  const navigate                      = useNavigate()
  const { unread, dismissAll }        = useRecentWorkspaces()
  const [visible, setVisible]         = useState(false)
  const [expanded, setExpanded]       = useState(false)
  const prevCountRef                  = useRef(0)
  const collapseTimerRef              = useRef(null)

  useEffect(() => {
    const prev = prevCountRef.current
    prevCountRef.current = unread.length

    if (unread.length > 0 && prev === 0) {
      // New activity arrived — pop up, briefly preview, then collapse
      setVisible(true)
      setExpanded(true)
      collapseTimerRef.current = setTimeout(() => setExpanded(false), 2200)
    }

    if (unread.length === 0) {
      clearTimeout(collapseTimerRef.current)
      setExpanded(false)
      setVisible(false)
    }
  }, [unread.length])

  if (!session || !visible) return null

  const activityIcon = (
    <span className="material-symbols-outlined" style={{ fontSize: 22, fontVariationSettings: "'FILL' 0, 'wght' 200, 'GRAD' 0, 'opsz' 24", color: '#1A1A18', lineHeight: 1 }}>
      azm
    </span>
  )

  const items = [
    {
      id:      'activity',
      label:   'Activity',
      badge:   !expanded && unread.length > 0,
      icon:    activityIcon,
      onClick: () => {
        clearTimeout(collapseTimerRef.current)
        setExpanded(e => !e)
      },
    },
    ...(expanded && unread.length > 0 ? [{
      id:      'clear-all',
      label:   'Clear all',
      icon:    <span className="material-symbols-outlined" style={{ fontSize: 20, fontVariationSettings: "'FILL' 0, 'wght' 300, 'GRAD' 0, 'opsz' 24", color: '#1A1A18', lineHeight: 1 }}>
                 done_all
               </span>,
      onClick: () => dismissAll(),
    }] : []),
    ...(expanded ? unread.map(w => ({
      id:      w.workspaceId,
      label:   w.label,
      badge:   true,
      icon:    <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.04em', color: '#1A1A18', lineHeight: 1 }}>
                 {wsInitials(w.supplier, w.label)}
               </span>,
      onClick: () => navigate(`/plm?workspace=${w.workspaceId}`),
    })) : []),
  ]

  return (
    <div style={{
      opacity:        visible ? 1 : 0,
      pointerEvents:  visible ? 'auto' : 'none',
      transition:     'opacity 0.3s ease',
    }}>
      <Dock items={items} />
    </div>
  )
}
