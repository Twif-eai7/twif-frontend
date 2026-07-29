import { useNavigate } from 'react-router-dom'
const FEATURES = [
  { icon: '📦', name: 'Order Management', desc: 'Track purchase orders, shipments, and delivery status in real time.' },
  { icon: '✅', name: 'Quality & Compliance', desc: 'QA reports, audit summaries, and compliance docs unified.' },
  { icon: '💰', name: 'Financial Hub', desc: 'Invoices, payment history, and claims — full visibility.' },
  { icon: '🔗', name: 'Buyer–Supplier Links', desc: 'Structured relationships with category-level permissions.' },
  { icon: '📊', name: 'Analytics & KPIs', desc: 'Live metrics: POs, shipped value, on-time delivery, SKUs.' },
  { icon: '🏢', name: 'Org Management', desc: 'Domain-verified onboarding with team approval flows.' },
]

const TRUSTED = ['Nkuku', 'Marks & Spencer', 'NEXT', 'Dunelm', 'John Lewis']

const FLOW = [
  { n: '01', t: 'Verify email', d: 'A one-time code confirms identity before anything happens.' },
  { n: '02', t: 'Select role', d: 'Buyer or Supplier — domain matches you to your org.' },
  { n: '03', t: 'Join or create', d: 'Request to join existing org or create a new one.' },
  { n: '04', t: 'Access granted', d: 'Approved? Full dashboard unlocked for your role.' },
]

const SECURITY = [
  { icon: '🔒', label: 'Domain-verified', sub: 'Email domain gates org access' },
  { icon: '✉️', label: 'OTP auth', sub: 'Supabase-powered email codes' },
  { icon: '👥', label: 'Role-based access', sub: 'Buyer, Supplier, Merchant, Admin' },
  { icon: '🛡️', label: 'Approval flows', sub: 'Org admins control team access' },
]

const gridBg = {
  backgroundImage: `
    linear-gradient(rgba(0,0,0,0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0,0,0,0.04) 1px, transparent 1px)
  `,
  backgroundSize: '27px 27px',
}

function Pill({ children, accent = false }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium
      ${accent ? 'bg-sky-50 text-sky-700 border border-sky-200' : 'bg-stone-100 text-stone-500 border border-stone-200'}`}>
      {children}
    </span>
  )
}

export default function HomePage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>

      {/* ── Floating nav ──────────────────────────────────────── */}
      <div className="sticky top-3 z-50 mx-auto px-4 max-w-6xl">
        <nav
          className="flex items-center justify-between px-4 py-2 rounded-xl border border-stone-200/80 bg-white/90 backdrop-blur-md"
          style={{ boxShadow: '0 0 0 0.5px rgba(19,19,22,0.12), 0 2px 3px rgba(0,0,0,0.04), 0 4px 6px rgba(34,42,53,0.04)' }}
        >
          <button onClick={() => navigate('/')} className="flex items-center gap-2.5 hover:opacity-75 transition-opacity">
            <span className="text-stone-900 text-lg hidden sm:block" style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}>
              Twif Portal
            </span>
          </button>

          <div className="hidden md:flex items-center gap-0.5 text-sm font-medium text-stone-600">
            {['Buyers', 'Suppliers', 'Features'].map(l => (
              <button key={l} className="px-3 py-1.5 rounded-lg hover:bg-stone-100 hover:text-stone-900 transition-colors">{l}</button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/auth')}
              className="px-3 py-1.5 text-sm font-medium text-stone-600 rounded-lg hover:bg-stone-100 hover:text-stone-900 transition-colors"
            >
              Sign in
            </button>
            <button
              onClick={() => navigate('/auth')}
              className="px-3.5 py-1.5 text-sm font-medium text-white bg-stone-900 rounded-lg hover:bg-stone-800 transition-all hover:-translate-y-px"
              style={{ boxShadow: '0 1px rgba(255,255,255,0.07) inset, 0 1px 3px rgba(19,19,22,0.25)' }}
            >
              Request access
            </button>
          </div>
        </nav>
      </div>

      {/* ── Hero ──────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0" style={gridBg} />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/50 to-white" />

        <div className="relative max-w-4xl mx-auto px-6 pt-20 pb-24 text-center">
          <Pill accent>
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse inline-block" />
            B2B Trade Portal · Buyers &amp; Suppliers
          </Pill>

          <h1
            className="mt-6 text-stone-900 leading-[1.07] tracking-tight"
            style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 'clamp(40px, 6.5vw, 68px)', fontWeight: 400 }}
          >
            Your supply chain,<br />
            <em className="text-stone-400" style={{ fontStyle: 'italic' }}>finally organised</em>
          </h1>

          <p className="mt-5 text-lg text-stone-500 leading-relaxed font-light max-w-xl mx-auto">
            A unified portal for buyers and suppliers to manage orders, compliance,
            financials, and collaboration — all in one verified workspace.
          </p>

          <div className="mt-8 flex items-center justify-center gap-3 flex-wrap">
            <button
              onClick={() => navigate('/auth')}
              className="flex items-center gap-2 px-6 py-2.5 text-sm font-medium text-white bg-stone-900 rounded-lg hover:bg-stone-800 transition-all hover:-translate-y-px hover:shadow-lg"
              style={{ boxShadow: '0 1px rgba(255,255,255,0.07) inset, 0 1px 3px rgba(19,19,22,0.2)' }}
            >
              Request access
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2.5 6h7M6.5 2.5l3.5 3.5-3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              onClick={() => navigate('/auth')}
              className="px-6 py-2.5 text-sm font-medium text-stone-700 bg-white border border-stone-300 rounded-lg hover:bg-stone-50 transition-all"
              style={{ boxShadow: '0 0 0 0.5px rgba(19,19,22,0.12), 0 1px 2px rgba(0,0,0,0.04)' }}
            >
              Sign in to portal
            </button>
          </div>

          <div className="mt-12 flex flex-col items-center gap-4">
            <p className="text-xs font-semibold text-stone-400 uppercase tracking-widest">Trusted by</p>
            <div className="flex items-center gap-8 flex-wrap justify-center">
              {TRUSTED.map(b => (
                <span key={b} className="text-stone-400 text-sm" style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontStyle: 'italic' }}>
                  {b}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Security bar ──────────────────────────────────────── */}
      <div className="border-y border-stone-200 bg-stone-50/50 py-6 px-6">
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6">
          {SECURITY.map(s => (
            <div key={s.label} className="flex items-start gap-3">
              <span className="text-base mt-0.5">{s.icon}</span>
              <div>
                <div className="text-sm font-medium text-stone-800">{s.label}</div>
                <div className="text-xs text-stone-500 mt-0.5">{s.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Features ──────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 py-20">
        <div className="mb-12">
          <Pill>Platform features</Pill>
          <h2
            className="mt-4 text-stone-900 leading-tight"
            style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 'clamp(26px, 3.5vw, 40px)', fontWeight: 400 }}
          >
            Everything your team needs,<br />nothing they don't
          </h2>
          <p className="mt-3 text-base text-stone-500 font-light max-w-md">
            Purpose-built for international trade ops — from sample dev to final shipment.
          </p>
        </div>

        {/* Clerk-style gap-px grid */}
        <div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 rounded-2xl overflow-hidden border border-stone-200"
          style={{ gap: '1px', backgroundColor: '#e7e5e4' }}
        >
          {FEATURES.map(f => (
            <div key={f.name} className="bg-white p-7 hover:bg-stone-50/80 transition-colors group">
              <div className="w-9 h-9 rounded-lg bg-stone-100 border border-stone-200 flex items-center justify-center text-base mb-4 group-hover:border-stone-300 transition-colors">
                {f.icon}
              </div>
              <div className="text-sm font-medium text-stone-900 mb-1.5">{f.name}</div>
              <div className="text-xs text-stone-500 leading-relaxed">{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works (dark) ───────────────────────────────── */}
      <section className="relative overflow-hidden bg-stone-950 py-20 px-6">
        <div
          className="absolute inset-0 opacity-20"
          style={{ backgroundImage: `radial-gradient(rgba(255,255,255,0.2) 1px, transparent 1px)`, backgroundSize: '27px 27px' }}
        />
        <div className="absolute inset-x-0 top-0 h-12 bg-gradient-to-b from-stone-950" />
        <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-stone-950" />

        <div className="relative max-w-4xl mx-auto">
          <span className="text-xs font-semibold text-sky-400 uppercase tracking-widest">How it works</span>
          <h2
            className="mt-3 mb-12 text-white leading-snug"
            style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 'clamp(26px, 3.5vw, 40px)', fontWeight: 400 }}
          >
            From sign-up to dashboard,<br />
            <em className="text-stone-500" style={{ fontStyle: 'italic' }}>in under five minutes</em>
          </h2>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-6">
            {FLOW.map((s, i) => (
              <div key={s.n} className="relative">
                {i < FLOW.length - 1 && (
                  <div className="hidden lg:block absolute top-3.5 left-full w-full h-px bg-stone-800 z-0 -translate-x-2" />
                )}
                <div className="relative z-10 w-7 h-7 rounded-full border border-stone-700 bg-stone-950 flex items-center justify-center text-xs font-medium text-stone-500 mb-3">
                  {i + 1}
                </div>
                <div className="text-[10px] font-bold text-stone-600 uppercase tracking-widest mb-1.5">{s.n}</div>
                <div className="text-sm font-semibold text-white mb-1.5">{s.t}</div>
                <div className="text-xs text-stone-500 leading-relaxed">{s.d}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <div className="relative overflow-hidden rounded-2xl bg-sky-600 px-10 py-12 text-center">
          <div
            className="absolute inset-0 opacity-10"
            style={{
              backgroundImage: `linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)`,
              backgroundSize: '27px 27px',
            }}
          />
          <div
            className="absolute inset-0"
            style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.15) 0%, transparent 60%)' }}
          />
          <div className="relative">
            <h2
              className="text-white mb-3"
              style={{ fontFamily: "'Instrument Serif', Georgia, serif", fontSize: 'clamp(22px, 3vw, 34px)', fontWeight: 400 }}
            >
              Start now, no strings attached.
            </h2>
            <p className="text-sky-100 text-sm max-w-sm mx-auto mb-7 leading-relaxed font-light">
              Request access and get your team onboarded in minutes.
              Domain-verified, approval-gated.
            </p>
            <button
              onClick={() => navigate('/auth')}
              className="px-6 py-2.5 text-sm font-medium text-stone-900 bg-white rounded-lg hover:bg-stone-50 transition-all hover:-translate-y-px"
              style={{ boxShadow: '0 1px rgba(255,255,255,0.9) inset, 0 0 0 0.5px rgba(25,28,33,0.08)' }}
            >
              Request access
            </button>
          </div>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────── */}
      <footer className="border-t border-stone-200 px-6 py-8">
        <div className="max-w-5xl mx-auto flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-2.5">
            <span className="text-sm text-stone-400">© 2025 Twif Portal. All rights reserved.</span>
          </div>
          <div className="flex gap-6">
            {['Privacy', 'Terms', 'Support'].map(l => (
              <span key={l} className="text-sm text-stone-400 hover:text-stone-700 cursor-pointer transition-colors">{l}</span>
            ))}
          </div>
        </div>
      </footer>

    </div>
  )
}