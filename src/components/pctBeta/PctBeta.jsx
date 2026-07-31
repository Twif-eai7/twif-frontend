import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePctBetaStore } from './state/usePctBetaStore'
import { useAuthStore } from '../../stores/authStore'
import {
  ACCOUNTS,
  GLOBAL_TOPBAR_TABS,
  NAV_MAIN_TABS,
  NAV_EXEC_TABS,
  NAV_BUYERS,
  TABS,
} from './constants'
import { LogoMark } from '../ui'
import { Icon, IconChevron, IconBell, IconCheck, IconWarn } from './icons'
import DashboardScreen from './screens/DashboardScreen'
import WorkflowScreen from './screens/WorkflowScreen'
import Po360Screen from './screens/Po360Screen'
import QcScreen from './screens/QcScreen'
import ClaimsScreen from './screens/ClaimsScreen'
import IndentsScreen from './screens/IndentsScreen'
import ExceptionScreen from './screens/ExceptionScreen'

function GlobalTopbar() {
  const activeTab = usePctBetaStore((s) => s.activeTab)
  const setActiveTab = usePctBetaStore((s) => s.setActiveTab)
  const accountMenuOpen = usePctBetaStore((s) => s.accountMenuOpen)
  const toggleAccountSwitcher = usePctBetaStore((s) => s.toggleAccountSwitcher)
  const closeAccountSwitcher = usePctBetaStore((s) => s.closeAccountSwitcher)
  const setActiveAccount = usePctBetaStore((s) => s.setActiveAccount)
  const activeAccountIdx = usePctBetaStore((s) => s.activeAccountIdx)

  const wrapRef = useRef(null)

  useEffect(() => {
    if (!accountMenuOpen) return
    const onClick = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) closeAccountSwitcher() }
    const onKey = (e) => { if (e.key === 'Escape') closeAccountSwitcher() }
    document.addEventListener('click', onClick)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('click', onClick); document.removeEventListener('keydown', onKey) }
  }, [accountMenuOpen, closeAccountSwitcher])

  const active = ACCOUNTS[activeAccountIdx]

  return (
    <div className="flex items-center justify-between px-5 h-12 bg-[#0a1628] border-b border-white/10 flex-shrink-0 md:px-5">
      <div className="flex items-center gap-3">
        <LogoMark size={32} dark={false} />
        <span className="text-white text-[15px] font-bold tracking-[-.2px]">Twif Platform</span>
      </div>

      <div className="relative" ref={wrapRef}>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); toggleAccountSwitcher() }}
          aria-haspopup="menu"
          aria-expanded={accountMenuOpen}
          className={`flex items-center gap-2 border border-white/10 rounded-full pl-2 pr-4 py-1.5 cursor-pointer transition-colors hover:bg-white/[.08] ${accountMenuOpen ? 'bg-white/10' : 'bg-[#15263d]'}`}
        >
          <span className="w-7 h-7 rounded-full text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0" style={{ background: active.color }}>{active.initials}</span>
          <span className="text-white text-[13px] font-medium hidden sm:inline">{active.name}</span>
          <IconChevron className={`w-3.5 h-3.5 text-white/50 ml-1 transition-transform duration-[180ms] ${accountMenuOpen ? 'rotate-180' : ''}`} />
        </button>

        {accountMenuOpen && (
          <div role="menu" className="absolute top-[calc(100%+8px)] left-1/2 -translate-x-1/2 w-[340px] max-w-[92vw] bg-white border border-slate-200 rounded-xl shadow-[0_12px_32px_rgba(15,23,42,.18)] p-1.5 z-50 animate-[fadeUp_.16s_ease]">
            <div className="px-2.5 py-2 text-[11px] uppercase tracking-[.8px] font-bold text-slate-400">Switch buyer</div>
            <div className="grid grid-cols-1 gap-1 px-1 pb-1 max-h-[340px] overflow-y-auto">
              {ACCOUNTS.map((a, i) => (
                <button key={a.name} type="button" role="menuitem"
                  onClick={() => setActiveAccount(i)}
                  className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-left text-slate-800 transition-colors hover:bg-slate-50 ${i === activeAccountIdx ? 'bg-slate-100' : ''}`}>
                  <span className="w-6 h-6 rounded-full text-white text-[10px] font-bold flex items-center justify-center shrink-0" style={{ background: a.color }}>{a.initials}</span>
                  <span className="min-w-0 flex-1 text-[12px] font-semibold text-slate-900 leading-tight truncate">{a.name}</span>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className={`w-3.5 h-3.5 text-blue-600 shrink-0 ${i === activeAccountIdx ? 'opacity-100' : 'opacity-0'}`}>
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </button>
              ))}
            </div>
            <div className="h-px bg-slate-200 my-1.5 mx-1" />
            <button type="button" role="menuitem"
              onClick={() => { closeAccountSwitcher(); window.alert('Account settings — coming soon') }}
              className="flex items-center gap-2 w-full px-2.5 py-2 rounded-lg text-[12.5px] text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              Account settings
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1">
        {GLOBAL_TOPBAR_TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => setActiveTab(t.key)}
            className={`hidden md:inline-flex text-[13px] font-medium px-3.5 py-2 rounded-lg transition-colors ${activeTab === t.key ? 'text-white bg-white/[.12] font-semibold' : 'text-white/60 hover:text-white hover:bg-white/[.06]'}`}>
            {t.label}
          </button>
        ))}
        <button className="w-9 h-9 rounded-full flex items-center justify-center text-white/60 hover:text-white hover:bg-white/[.06] relative ml-1">
          <IconBell className="w-[18px] h-[18px]" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-amber-500 rounded-full border-2 border-[#0a1628]" />
        </button>
        <div className="w-9 h-9 rounded-full bg-[#15263d] border-2 border-white/20 text-white text-xs font-bold flex items-center justify-center ml-1">NM</div>
      </div>
    </div>
  )
}

function Sidebar() {
  const activeTab = usePctBetaStore((s) => s.activeTab)
  const setActiveTab = usePctBetaStore((s) => s.setActiveTab)

  const Section = ({ title, items }) => (
    <div className="mt-4 first:mt-0">
      <div className="text-[10.5px] font-bold text-slate-400 uppercase tracking-[.8px] px-2.5 mb-1.5">{title}</div>
      {items.map((t) => (
        <button key={t.key} type="button" onClick={() => setActiveTab(t.key)}
          className={`flex items-center gap-2.5 w-full py-2 px-2.5 rounded-md text-[13px] font-medium text-left transition-colors mb-px ${activeTab === t.key ? 'bg-slate-100 text-slate-900 font-semibold' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
          <Icon name={t.icon} className={`w-[18px] h-[18px] flex-shrink-0 ${activeTab === t.key ? 'opacity-100' : 'opacity-70'}`} />
          <span>{t.label}</span>
          {t.badge !== null && t.badge !== undefined && (
            <span className={`ml-auto text-[11px] font-semibold py-0.5 px-2 rounded-full min-w-[20px] text-center ${activeTab === t.key ? 'bg-slate-200 text-slate-800' : 'bg-slate-100 text-slate-600'}`}>{t.badge}</span>
          )}
        </button>
      ))}
    </div>
  )

  return (
    <aside className="w-60 border-r border-slate-200 bg-white flex-shrink-0 overflow-y-auto py-5 px-3.5 hidden md:flex flex-col gap-1">
      <Section title="Main" items={NAV_MAIN_TABS} />
      <Section title="Execution" items={NAV_EXEC_TABS} />
      <div className="mt-4">
        <div className="text-[10.5px] font-bold text-slate-400 uppercase tracking-[.8px] px-2.5 mb-1.5">Buyers</div>
        {NAV_BUYERS.map((b) => (
          <div key={b.name} className="flex items-center gap-2.5 w-full py-2 px-2.5 rounded-md text-[13px] font-medium text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer text-left">
            <div className="w-7 h-7 rounded-md text-[9px] font-bold text-white flex items-center justify-center flex-shrink-0" style={{ background: b.color }}>{b.initials}</div>
            <span>{b.name}</span>
          </div>
        ))}
      </div>
    </aside>
  )
}

function MobileNav() {
  const activeTab = usePctBetaStore((s) => s.activeTab)
  const setActiveTab = usePctBetaStore((s) => s.setActiveTab)
  const items = TABS.slice(0, 5)
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-2 z-20 md:hidden">
      <div className="flex justify-around">
        {items.map((t) => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`flex flex-col items-center gap-0.5 text-[10px] py-1.5 px-1.5 rounded-lg ${activeTab === t.key ? 'text-blue-600 bg-blue-100' : 'text-slate-500'}`}>
            <Icon name={t.icon} className="w-5 h-5" />
            <span>{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function AppToast() {
  const toast = usePctBetaStore((s) => s.toast)
  const hideToast = usePctBetaStore((s) => s.hideToast)
  if (!toast.open) return null
  const isWarn = toast.variant === 'warn'
  return (
    <div className="fixed inset-0 z-[9999] bg-slate-900/[.48] backdrop-blur-md flex items-center justify-center p-5 animate-[toastOverlayIn_.22s_ease]" onClick={(e) => { if (e.target === e.currentTarget) hideToast() }}>
      <div role="dialog" aria-modal="true" className="bg-white rounded-2xl border border-slate-200 shadow-[0_25px_50px_-12px_rgba(15,23,42,.28)] max-w-[440px] w-full p-0 overflow-hidden animate-[toastCardIn_.28s_ease] relative" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={hideToast} aria-label="Dismiss"
          className="absolute top-3 right-3.5 w-8 h-8 border-0 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-[10px] text-lg leading-none cursor-pointer">×</button>
        <div className="flex gap-3.5 px-[22px] pt-[22px] pb-[18px] items-start">
          <div className={`w-11 h-11 rounded-2xl flex-shrink-0 flex items-center justify-center ${isWarn ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
            {isWarn ? <IconWarn className="w-[22px] h-[22px]" /> : <IconCheck className="w-[22px] h-[22px]" />}
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-bold tracking-[.12em] uppercase text-slate-500 mb-1">{toast.kicker}</div>
            <h3 className="text-lg font-bold text-slate-900 m-0 mb-2.5 leading-tight pr-9">{toast.headline}</h3>
            <div className="text-sm text-slate-600 leading-relaxed m-0" dangerouslySetInnerHTML={{ __html: toast.html }} />
          </div>
        </div>
        <div className="px-[22px] pt-3.5 pb-[18px] border-t border-slate-100 bg-slate-50 flex justify-end">
          <button type="button" onClick={hideToast} className="bg-slate-900 hover:bg-[#020617] text-white font-bold text-[13px] px-5 py-2.5 rounded-lg cursor-pointer shadow-sm">Done</button>
        </div>
      </div>
    </div>
  )
}

function ScreenSwitcher() {
  const activeTab = usePctBetaStore((s) => s.activeTab)
  switch (activeTab) {
    case 'workflow': return <WorkflowScreen />
    case 'exceptions': return <ExceptionScreen />
    case 'po360': return <Po360Screen />
    case 'indents': return <IndentsScreen />
    case 'qc': return <QcScreen />
    case 'claims': return <ClaimsScreen />
    default: return <DashboardScreen />
  }
}

export default function PctBeta() {
  const navigate = useNavigate()
  const session = useAuthStore((s) => s.session)
  const fetchDashboard = usePctBetaStore((s) => s.fetchDashboard)
  const subscribeRealtime = usePctBetaStore((s) => s.subscribeRealtime)
  const selectedPO = usePctBetaStore((s) => s.selectedPO)
  const useMockMode = usePctBetaStore((s) => s.useMockMode)
  const ACTIVE_ACCOUNT = usePctBetaStore((s) => s.activeAccountIdx)
  const account = ACCOUNTS[ACTIVE_ACCOUNT]

  useEffect(() => {
    if (useMockMode || !session?.access_token) return
    fetchDashboard()
  }, [session?.access_token, useMockMode, fetchDashboard])

  useEffect(() => {
    if (!selectedPO?.pctLineId || useMockMode) return undefined
    return subscribeRealtime(selectedPO.pctLineId)
  }, [selectedPO?.pctLineId, useMockMode, subscribeRealtime])

  return (
    <div className="h-screen w-screen flex flex-col font-[system-ui,-apple-system,'Segoe_UI',Arial,sans-serif] text-[13px] text-slate-900 bg-slate-50 overflow-hidden">
      <GlobalTopbar />
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <main className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
          <header className="flex items-center justify-between px-7 pt-5 pb-4 bg-white border-b border-slate-200 sticky top-0 z-[5] gap-4 max-md:flex-col max-md:items-start max-md:gap-3">
            <div>
              <h1 className="text-[22px] font-bold text-slate-900">Production Control Tower</h1>
              <div className="text-[12.5px] text-slate-500 mt-0.5">{account.name} — {account.category} · Live from database{useMockMode ? ' (mock)' : ''}</div>
            </div>
            <div className="flex gap-2 max-md:w-full">
              <button className="border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 rounded-lg px-4 py-2 text-[12.5px] font-semibold" onClick={() => navigate('/dashboard')}>← Back to Dashboard</button>
              <button className="border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 rounded-lg px-4 py-2 text-[12.5px] font-semibold" onClick={() => window.alert('Export View — coming soon')}>Export CSV</button>
              <button className="border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 rounded-lg px-4 py-2 text-[12.5px] font-semibold" onClick={() => window.alert('Filter View — coming soon')}>Filter</button>
              <button className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2 text-[12.5px] font-semibold" onClick={() => window.alert('Create PO — coming soon')}>+ New PO</button>
            </div>
          </header>
          <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
            <ScreenSwitcher />
          </div>
        </main>
      </div>
      <MobileNav />
      <AppToast />
    </div>
  )
}
