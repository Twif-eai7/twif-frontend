import { useState, useEffect, useRef, Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import Dock from './components/shared/Dock'
// Every page below is route-level code-split (React.lazy) instead of a static import —
// previously ALL of them (dashboard, admin, financial, logistics, quality, PLM, etc.)
// were bundled into one ~6.8MB JS file, so visiting /plm alone forced downloading and
// parsing every other module in the app first. Now each route only pulls its own chunk.
const AnalyticsV2Section = lazy(() => import('./pages/Dashboard/sections/AnalyticsV2Section'))
const DashboardIndex = lazy(() => import('./pages/Dashboard/sections/DashboardIndex'))
// import AnalyticsV3Section from './pages/Dashboard/sections/AnalyticsV3Section'
const AnalyticsDummySection = lazy(() => import('./pages/Dashboard/sections/AnalyticsDummySection'))
const HomePage = lazy(() => import('./pages/HomePage'))
const AuthPage = lazy(() => import('./pages/Auth/AuthPage'))
const OTPPage = lazy(() => import('./pages/Auth/OtpPage'))
const OnboardingPage = lazy(() => import('./pages/Auth/OnboardingPage'))
const Dashboard = lazy(() => import('./pages/Dashboard/Dashboard'))
const AnalyticsSection = lazy(() => import('./pages/Dashboard/sections/AnalyticsSection'))
const OrdersSection    = lazy(() => import('./pages/Dashboard/sections/OrdersSection'))
const QualitySection   = lazy(() => import('./pages/Dashboard/sections/QualitySection'))
const FinancialSection = lazy(() => import('./pages/Dashboard/sections/FinancialSection'))
const NpdSection       = lazy(() => import('./pages/Dashboard/sections/NpdSection'))
const ProfileSection   = lazy(() => import('./pages/Dashboard/sections/ProfileSection'))
const SupportSection   = lazy(() => import('./pages/Dashboard/sections/SupportSection'))
const SignedAgreementSection = lazy(() => import('./pages/Dashboard/sections/SignedAgreementSection'))
const IrfSection        = lazy(() => import('./pages/Dashboard/sections/IrfSection'))
const QcReportsSection  = lazy(() => import('./pages/Dashboard/sections/QcReportsSection'))
const CatalogsSection        = lazy(() => import('./pages/Dashboard/sections/CatalogsSection'))
const LogisticsSection       = lazy(() => import('./pages/Dashboard/sections/LogisticsSection'))
const ProjectsSection        = lazy(() => import('./pages/Dashboard/sections/ProjectsSection'))
const ProjectBoardSection    = lazy(() => import('./pages/Dashboard/sections/ProjectBoardSection'))
const MyTasksSection         = lazy(() => import('./pages/Dashboard/sections/MyTasksSection'))
// Pulled out of production — no nav link points here anymore (Sidebar.jsx),
// and this was the last thing gating it. Re-enable both this import and the
// "mis" route below for local use whenever it's needed again.
// const MisSection = lazy(() => import('./pages/Dashboard/sections/MisSection'))
const PctBetaPage = lazy(() => import('./pages/PctBetaPage'))
const PLMPage = lazy(() => import('./pages/PLMPage'))
const PLMDemoPage = lazy(() => import('./pages/PLMDemoPage'))
const PLMVedeeoPage = lazy(() => import('./pages/PLMVedeeoPage'))
const PLMAccessPage = lazy(() => import('./pages/PLMAccessPage'))
const UserManualPage = lazy(() => import('./pages/UserManualPage'))

const ApprovalsPage = lazy(() => import('./pages/Admin/ApprovalsPage'))
const OrganisationsPage = lazy(() => import('./pages/Admin/OrganisationsPage'))
const MembersPage = lazy(() => import('./pages/Admin/MembersPage'))
const AnalyticsPage = lazy(() => import('./pages/Admin/AnalyticsPage'))
const SignatureSettingsPage = lazy(() => import('./pages/Admin/SignatureSettingsPage'))
const PLMSecurityPage = lazy(() => import('./pages/Admin/PLMSecurityPage'))
const ProjectsAdminPage = lazy(() => import('./pages/Admin/ProjectsAdminPage'))

import { useAuth } from './hooks/useAuth'
import { useRecentWorkspaces } from './hooks/useRecentWorkspaces'
import { isOrgLive, useProfileStore } from './stores/profileStore'
import { Spinner } from './components/ui'
import { unlockAudioForNotifications } from './utils/callSound'

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

  if (profileFetched && !isOrgLive(orgMembership)) {
    // No portal_users row or onboarding form not yet submitted
    if (!portalUser || !portalUser.onboarding_completed) {
      return <Navigate to="/onboarding" state={{ email: user?.email }} replace />
    }

    // Form submitted but org is still pending review (or no membership yet)
    return <Navigate to="/onboarding" state={{ email: user?.email, pendingReview: true }} replace />
  }

  return children
}

// Unlocks the notification AudioContext on the first real interaction anywhere in the
// app (mounted for the whole session, well before a user ever reaches /plm) — Chrome
// only allows an AudioContext to start/resume from inside a genuine user gesture, so
// this must fire early rather than waiting for a click on the PLM page itself.
function useUnlockAudioOnFirstInteraction() {
  useEffect(() => {
    const unlock = () => {
      unlockAudioForNotifications()
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [])
}

export default function App() {
  useUnlockAudioOnFirstInteraction()
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={
          <div className="min-h-screen flex items-center justify-center bg-stone-50">
            <Spinner light={false} size="w-6 h-6" />
          </div>
        }>
        <Routes>
          {/* Public */}
          <Route path="/" element={<Navigate to="/auth" replace />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/auth/buyer" element={<AuthPage forcedRole="buyer" />} />
          <Route path="/auth/vendor" element={<AuthPage forcedRole="supplier" />} />
          <Route path="/register/vendor" element={<OnboardingPage forcedRole="supplier" publicEntry />} />
          <Route path="/vendor-registration" element={<Navigate to="/register/vendor" replace />} />
          <Route path="/auth/vendor/verify-otp" element={<OTPPage forcedRole="supplier" />} />
          <Route path="/auth/vendor/onboarding_vendor" element={<OnboardingPage forcedRole="supplier" />} />
          <Route path="/verify-otp" element={<OTPPage />} />
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/login" element={<Navigate to="/auth" replace />} />
          <Route path="/signup" element={<Navigate to="/auth" replace />} />

          {/* Main dashboard — nested routes, one per NavCategory */}
          <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>}>
            <Route index            element={<DashboardIndex />} />
            <Route path="orders"    element={<OrdersSection />} />
            <Route path="quality"   element={<QualitySection />} />
            <Route path="financial" element={<FinancialSection />} />
            <Route path="logistics" element={<LogisticsSection />} />
            {/* <Route path="mis" element={<MisSection />} /> */}
            <Route path="npd"       element={<NpdSection />} />
            <Route path="signed-agreement" element={<SignedAgreementSection />} />
            <Route path="irf"       element={<IrfSection />} />
            <Route path="qc-reports" element={<QcReportsSection />} />
            <Route path="profile"   element={<ProfileSection />} />
            <Route path="support"   element={<SupportSection />} />
            {/* <Route path="analytics-v2" element={<AnalyticsV2Section />} />
            <Route path="analytics-v3" element={<AnalyticsV3Section />} /> */}
            <Route path="analytics-demo" element={<AnalyticsDummySection />} />
            <Route path="catalogs"  element={<CatalogsSection />} />
            <Route path="projects"          element={<ProjectsSection />} />
            <Route path="projects/my-tasks" element={<MyTasksSection />} />
            <Route path="projects/:projectId" element={<ProjectBoardSection />} />
          </Route>
          {/* Legacy merchant-dashboard URL */}
          <Route path="/merchant-dashboard" element={<Navigate to="/dashboard" replace />} />
          {/* <Route path="analytics-v2" element={<AnalyticsV2Section />} /> */}
          <Route path="/pct-beta" element={<RequireAuth><PctBetaPage /></RequireAuth>} />
          <Route path="/plm/vedeeo" element={<RequireAuth><PLMVedeeoPage /></RequireAuth>} />
          <Route path="/plm/demo" element={<RequireAuth><PLMDemoPage /></RequireAuth>} />
          <Route path="/plm" element={<RequireAuth><PLMPage /></RequireAuth>} />
          <Route path="/plm/accept" element={<PLMAccessPage />} />
          {/* QA Manual moved inline into the Quality & Compliance tab system
              (/dashboard/quality?tab=qa-manual, see QualitySection.jsx) so
              the sidebar/header stay visible instead of a bare standalone
              page - this keeps any old bookmark/shared link to the previous
              standalone route working, same "old link -> merged tab"
              pattern QualitySection.jsx's own audit-summary redirect uses. */}
          <Route path="/qa-manual" element={<Navigate to="/dashboard/quality?tab=qa-manual" replace />} />
          <Route path="/user-manual" element={ <RequireAuth><UserManualPage /> </RequireAuth>} />


          {/* Admin */}
          <Route path="/admin" element={<Navigate to="/admin/approvals" replace />} />
          <Route path="/dashboard/approvals" element={<LegacyApprovalsRedirect />} />
          <Route path="/admin/approvals"    element={<RequireAuth><ApprovalsPage /></RequireAuth>} />
          <Route path="/admin/organisations" element={<RequireAuth><OrganisationsPage /></RequireAuth>} />
          <Route path="/admin/members"      element={<RequireAuth><MembersPage /></RequireAuth>} />
          <Route path="/admin/analytics"    element={<RequireAuth><AnalyticsPage /></RequireAuth>} />
          <Route path="/admin/signature"    element={<RequireAuth><SignatureSettingsPage /></RequireAuth>} />
          <Route path="/admin/plm-security" element={<RequireAuth><PLMSecurityPage /></RequireAuth>} />
          <Route path="/admin/projects"     element={<RequireAuth><ProjectsAdminPage /></RequireAuth>} />

          <Route path="*" element={<Navigate to="/auth" replace />} />
        </Routes>
        </Suspense>
        <AppFloatingDock />
      </AuthProvider>
    </BrowserRouter>
  )
}

function LegacyApprovalsRedirect() {
  const { search } = useLocation()
  return <Navigate to={`/admin/approvals${search}`} replace />
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

  // Only gate on session — toggling visible unmounts/remounts Dock's WebGL canvas on every
  // unread-count transition, which churns through the browser's WebGL context limit and
  // eventually triggers "Context Lost". The opacity/pointerEvents below already handles hiding.
  if (!session) return null

  const activityIcon = (
    <span className="material-symbols-outlined" style={{ fontSize: 22, fontVariationSettings: "'FILL' 0, 'wght' 200, 'GRAD' 0, 'opsz' 24", color: '#1A1A18', lineHeight: 1 }}>
      azm
    </span>
  )

  const totalUnread = unread.reduce((sum, w) => sum + (w.unreadCount || 0), 0)

  const items = [
    {
      id:      'activity',
      label:   'Activity',
      badge:   !expanded ? totalUnread : false,
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
      label: (
        <>
          <span className="dock-label-sku">{w.skuCode || w.label}</span>
          <span className="dock-label-message">
            {w.lastAuthorName && <strong>{w.lastAuthorName}: </strong>}
            {w.lastMessage || 'Workspace updated'}
          </span>
        </>
      ),
      labelClassName: 'dock-label-rich',
      badge:   w.unreadCount || true,
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
      <Dock items={items} active={visible} />
    </div>
  )
}
