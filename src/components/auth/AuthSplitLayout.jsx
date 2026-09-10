import { LogoMark } from '../ui'

const PANEL_COPY = {
  login: {
    label: 'TECHNOLOGY',
    title: 'Welcome to eai7 Portal',
    body: 'Sign in to access the complete platform—sourcing intelligence, supply chain visibility, and your operations workspace.',
  },
  signup: {
    label: 'TECHNOLOGY',
    title: 'Request access to eai7 Portal',
    body: 'Create your workspace account to collaborate on product development, orders, and supply chain operations.',
  },
  otp: {
    label: 'TECHNOLOGY',
    title: 'Verify your email',
    body: 'Enter the one-time code we sent to your inbox to finish signing in securely.',
  },
}

function BrandMark() {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark size={36} />
      <span
        className="text-[17px] font-semibold tracking-tight text-[#1e293b]"
        style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}
      >
        eai7
      </span>
    </div>
  )
}

export default function AuthSplitLayout({ mode = 'login', children }) {
  const copy = PANEL_COPY[mode] || PANEL_COPY.login

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-[#eef2f7]">
      <div
        className="w-full max-w-[920px] bg-white rounded-[28px] shadow-[0_24px_80px_rgba(15,23,42,0.12)] overflow-hidden flex flex-col md:flex-row min-h-[560px]"
        style={{ animation: 'fadeUp 0.35s ease forwards' }}
      >
        {/* Left panel */}
        <aside className="relative hidden md:flex md:w-[46%] flex-col justify-between p-10 bg-[#f8fafc] overflow-hidden">
          <div
            className="absolute -top-6 right-6 w-28 h-28 rounded-2xl rotate-[18deg] opacity-90"
            style={{ background: 'linear-gradient(135deg, #b8ebe3 0%, #9fded4 100%)' }}
          />
          <div
            className="absolute bottom-10 -left-8 w-32 h-32 rounded-2xl -rotate-[12deg] opacity-80"
            style={{ background: 'linear-gradient(135deg, #c8d4ff 0%, #a8b8f5 100%)' }}
          />

          <div className="relative z-10">
            <BrandMark />
            <p className="mt-8 text-[11px] font-semibold tracking-[0.22em] text-[#2bb8a8] uppercase">
              {copy.label}
            </p>
            <h1 className="mt-3 text-[26px] font-bold text-[#0f172a] leading-tight max-w-[260px]">
              {copy.title}
            </h1>
            <p className="mt-4 text-sm text-[#64748b] leading-relaxed max-w-[300px]">
              {copy.body}
            </p>
          </div>

          <p className="relative z-10 text-xs text-[#94a3b8]">© {new Date().getFullYear()} eai7</p>
        </aside>

        {/* Right panel */}
        <main className="flex-1 flex flex-col justify-center px-8 py-10 sm:px-12 sm:py-12">
          <div className="md:hidden mb-8">
            <BrandMark />
          </div>

          {children}
        </main>
      </div>
    </div>
  )
}
