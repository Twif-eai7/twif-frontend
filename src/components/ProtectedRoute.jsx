import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { Spinner } from '../components/ui'

export default function ProtectedRoute() {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="flex flex-col items-center gap-3">
          <Spinner light={false} size="w-6 h-6" />
          <span className="text-sm text-stone-400">Loading…</span>
        </div>
      </div>
    )
  }

  return session ? <Outlet /> : <Navigate to="/auth" replace />
}