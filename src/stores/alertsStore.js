import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

export const useAlertsStore = create(
  devtools(
    (set) => ({
      alerts:          [],
      drawerOpen:      false,
      loading:         false,
      activeFilter:    'all',
      searchQuery:     '',
      summaryOpen:     false,
      initUnreadCount: 0,

      setAlerts:        (alerts)  => set({ alerts, initUnreadCount: 0 }, false, 'alerts/set'),
      setLoading:       (loading) => set({ loading },                    false, 'alerts/loading'),
      setInitUnreadCount: (n)     => set({ initUnreadCount: n },         false, 'alerts/initUnread'),
      openDrawer:    ()        => set({ drawerOpen: true },  false, 'alerts/open'),
      closeDrawer:   ()        => set(
        { drawerOpen: false, searchQuery: '', activeFilter: 'all' },
        false, 'alerts/close'
      ),
      setFilter:     (f) => set({ activeFilter: f }, false, 'alerts/filter'),
      setSearch:     (q) => set({ searchQuery: q },  false, 'alerts/search'),
      toggleSummary: ()  => set(s => ({ summaryOpen: !s.summaryOpen }), false, 'alerts/summary'),
    }),
    { name: 'Alerts Store' }
  )
)
