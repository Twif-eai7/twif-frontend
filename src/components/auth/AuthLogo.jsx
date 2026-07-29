import { useNavigate } from 'react-router-dom'

/**
 * Clickable brand label shown at the top of every auth card.
 * Navigates back to landing on click.
 */
export default function AuthLogo({ suffix, label }) {
  const navigate = useNavigate()

  return (
    <button
      onClick={() => navigate('/')}
      className="flex items-center gap-2.5 mb-7 hover:opacity-75 transition-opacity"
    >
      <span
        className="text-stone-900 text-xl"
        style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}
      >
        {label || `Twif Portal${suffix ? ` - ${suffix}` : ''}`}
      </span>
    </button>
  )
}
