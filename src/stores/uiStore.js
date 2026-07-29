import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'

export const useUiStore = create(
  devtools(
    persist(
      (set) => ({
        // ── Layout ────────────────────────────────────────────────────────────
        sidebarCollapsed: false,
        mobileOpen: false,

        // ── MerchantDashboard filters ─────────────────────────────────────────
        otifYear: 'This Year',
        qualityYear: 'This Year',
        shippedPoType: 'Total',
        sourcingMode: 'country',
        volumeView: 'fiscal',
        openPoTableView: 'fiscal',
        volumeVendor: 'All',
        chartTotals: { totalShipped: 0, totalOpen: 0, hasOpenData: false },

        // ── Layout actions ────────────────────────────────────────────────────
        setSidebarCollapsed: (collapsed) =>
          set({ sidebarCollapsed: collapsed }, false, 'ui/setSidebarCollapsed'),
        setMobileOpen: (open) => set({ mobileOpen: open }, false, 'ui/setMobileOpen'),

        // ── Filter actions ────────────────────────────────────────────────────
        setOtifYear: (v) => set({ otifYear: v }, false, 'ui/setOtifYear'),
        setQualityYear: (v) => set({ qualityYear: v }, false, 'ui/setQualityYear'),
        setShippedPoType: (v) => set({ shippedPoType: v }, false, 'ui/setShippedPoType'),
        setSourcingMode: (v) => set({ sourcingMode: v }, false, 'ui/setSourcingMode'),
        setVolumeView: (v) => set({ volumeView: v }, false, 'ui/setVolumeView'),
        setOpenPoTableView: (v) => set({ openPoTableView: v }, false, 'ui/setOpenPoTableView'),
        setVolumeVendor: (v) => set({ volumeVendor: v }, false, 'ui/setVolumeVendor'),
        setChartTotals: (v) => set({ chartTotals: v }, false, 'ui/setChartTotals'),

        resetFilters: () =>
          set(
            {
              otifYear: 'This Year',
              qualityYear: 'This Year',
              shippedPoType: 'Total',
              sourcingMode: 'country',
              volumeView: 'fiscal',
              openPoTableView: 'fiscal',
              volumeVendor: 'All',
            },
            false,
            'ui/resetFilters'
          ),
      }),
      {
        name: 'jng-ui-prefs',
        partialize: (state) => ({
          sidebarCollapsed: state.sidebarCollapsed,
          otifYear: state.otifYear,
          qualityYear: state.qualityYear,
          shippedPoType: state.shippedPoType,
          sourcingMode: state.sourcingMode,
          volumeView: state.volumeView,
          openPoTableView: state.openPoTableView,
          volumeVendor: state.volumeVendor,
          // mobileOpen and chartTotals intentionally excluded
        }),
      }
    ),
    { name: 'UI Store' }
  )
)
