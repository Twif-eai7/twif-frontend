import { createContext, useEffect } from 'react'
import { useAuthStore } from '../stores/authStore'

// Context is kept only so AuthProvider still wraps the app as before.
// useAuth() no longer reads from context — it reads directly from authStore.
export const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  useEffect(() => useAuthStore.getState()._init(), [])
  return <AuthContext.Provider value={null}>{children}</AuthContext.Provider>
}

// Each selector returns a primitive or a stable store function reference —
// no object construction, no shallow needed, no infinite loop.
export function useAuth() {
  const session = useAuthStore((s) => s.session)
  const user = useAuthStore((s) => s.user)
  const signOut = useAuthStore((s) => s.signOut)
  return {
    session,
    user,
    loading: session === undefined,
    signOut,
  }
}
