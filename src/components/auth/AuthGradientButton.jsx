import { Spinner } from '../ui/Spinner'

export default function AuthGradientButton({ children, loading, disabled, type = 'submit', onClick }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={loading || disabled}
      className="w-full py-3.5 rounded-xl text-sm font-semibold tracking-[0.12em] text-white uppercase transition-all disabled:opacity-60 disabled:pointer-events-none hover:brightness-105 active:scale-[0.99]"
      style={{
        background: 'linear-gradient(90deg, #4d68f0 0%, #38c2b5 100%)',
        boxShadow: '0 10px 28px rgba(77, 104, 240, 0.28)',
      }}
    >
      <span className="inline-flex items-center justify-center gap-2">
        {loading && <Spinner light size="w-4 h-4" />}
        {children}
      </span>
    </button>
  )
}
