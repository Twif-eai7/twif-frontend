/**
 * Centered card shell used by all auth and onboarding pages.
 * `maxWidth` lets wider steps (e.g. the org-details form) grow the card
 * without affecting the narrower login/OTP screens that share this shell.
 */
export default function AuthShell({ children, maxWidth = 'max-w-md' }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-6 bg-stone-50"
      style={{
        backgroundImage:
          'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(200,200,195,0.3) 0%, transparent 70%)',
      }}
    >
      <div
        className={`w-full ${maxWidth} bg-white border border-stone-200 rounded-2xl shadow-xl p-9`}
        style={{ animation: 'fadeUp 0.35s ease forwards' }}
      >
        {children}
      </div>
    </div>
  )
}