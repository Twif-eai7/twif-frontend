import { create } from 'zustand'
import { devtools, subscribeWithSelector } from 'zustand/middleware'
import { supabase } from '../lib/supabase'

async function ensurePortalUser(user) {
  if (!supabase || !user?.id || !user?.email) return
  const { error } = await supabase
    .from('portal_users')
    .upsert(
      { id: user.id, email: user.email },
      { onConflict: 'id', ignoreDuplicates: true }
    )
  if (error) console.warn('portal_users upsert failed:', error.message)
}

let _subscription = null

export const useAuthStore = create(
  devtools(
    subscribeWithSelector((set) => ({
      session: undefined, // undefined = loading, null = signed out
      user: null,

      _setSession: (session) =>
        set(
          { session, user: session?.user ?? null },
          false,
          'auth/setSession'
        ),

      signOut: async () => {
        if (!supabase) return
        await supabase.auth.signOut({ scope: 'local' })
      },

      _init: () => {
        // Prevent duplicate subscriptions
        if (_subscription) return () => {}

        if (!supabase) {
          set({ session: null, user: null }, false, 'auth/no-supabase')
          return () => {}
        }

        supabase.auth.getSession().then(({ data: { session } }) => {
          set({ session, user: session?.user ?? null }, false, 'auth/init')
          if (session?.user) ensurePortalUser(session.user)
        })

        const { data: { subscription } } = supabase.auth.onAuthStateChange(
          (event, session) => {
            set({ session, user: session?.user ?? null }, false, `auth/${event}`)
            if (event === 'SIGNED_IN' && session?.user) {
              ensurePortalUser(session.user)
            }
          }
        )

        _subscription = subscription
        return () => {
          subscription.unsubscribe()
          _subscription = null
        }
      },
    })),
    { name: 'Auth Store' }
  )
)
