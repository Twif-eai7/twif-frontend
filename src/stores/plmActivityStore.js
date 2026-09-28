import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

export const usePlmActivityStore = create(
  devtools(
    (set) => ({
      drawerOpen:   false,
      loading:      false,
      workspaces:   [],
      searchQuery:  '',
      expandedId:   null,
      activityFilter: 'all', // 'all' | 'unread' | 'read' | 'message' | 'milestone' | 'field_change'
      // Tech-only "By Contact" narrowing — id of the selected merchant/buyer/vendor contact, or '' for any.
      // 'conversation' is different from the other three: it's the id of someone who actually
      // authored a comment/milestone/field_change in the workspace, not just someone invited/assigned to it.
      contactFilters: { merchant: '', buyer: '', vendor: '', conversation: '' },
      // 'recent' = fast default (last 90 days, capped per workspace) for the everyday "what's new"
      // glance. 'all' = the actual log — every workspace with any activity ever, no date/row limit,
      // for when someone needs to check history rather than just recent nudges.
      timeRange: 'recent', // 'recent' | 'all'

      openDrawer:  () => set({ drawerOpen: true },  false, 'plmActivity/open'),
      closeDrawer: () => set({ drawerOpen: false, searchQuery: '', expandedId: null, activityFilter: 'all', contactFilters: { merchant: '', buyer: '', vendor: '', conversation: '' }, timeRange: 'recent' }, false, 'plmActivity/close'),
      setSearch:   (q) => set({ searchQuery: q }, false, 'plmActivity/search'),
      setActivityFilter: (f) => set({ activityFilter: f }, false, 'plmActivity/filter'),
      setContactFilter: (kind, value) => set(s => ({ contactFilters: { ...s.contactFilters, [kind]: value } }), false, 'plmActivity/contactFilter'),
      setTimeRange: (r) => set({ timeRange: r }, false, 'plmActivity/timeRange'),
      toggleExpanded: (id) => set(s => ({ expandedId: s.expandedId === id ? null : id }), false, 'plmActivity/expand'),
      setWorkspaces:  (workspaces) => set({ workspaces }, false, 'plmActivity/set'),
      setLoading:     (loading)    => set({ loading },    false, 'plmActivity/loading'),
    }),
    { name: 'PLM Activity Store' }
  )
)
