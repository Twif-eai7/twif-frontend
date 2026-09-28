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

        // ── Quality & Compliance tab memory ───────────────────────────────────
        // The sidebar's links are static hrefs (?tab=po-inspection etc.), so
        // switching tabs and back always lands on a bare URL with none of the
        // selection query params a component may have written — URL-only
        // restoration silently loses state on every tab switch. Kept here
        // instead, since a Zustand store isn't tied to the route or component
        // lifecycle, so it survives exactly that navigation.
        poInspectionSelection: null,   // { poId, skuId } | null
        inspectionScheduleDate: null,  // ISO date string ('YYYY-MM-DD') | null
        // QC Reports (QcReportsSummary.jsx) - same "survives navigating away
        // and back, not just a component remount" reasoning as
        // poInspectionSelection above, extended to cover scroll position too
        // (a real page-refresh/full-reload also needs it, which is why this
        // is in the persisted partialize list below, not sessionStorage).
        qcReportsViewState: null, // { scrollY, view, cursor, showRepositoryPanel, buyerFilter, vendorFilter, regionFilter, inspectorFilter, merchantFilter } | null

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
        // Accepts either a value or a React-style updater (prev) => next —
        // callers use the updater form to patch just skuId without a stale
        // read of the current selection.
        setPoInspectionSelection: (v) =>
          set(
            (state) => ({ poInspectionSelection: typeof v === 'function' ? v(state.poInspectionSelection) : v }),
            false,
            'ui/setPoInspectionSelection'
          ),
        setInspectionScheduleDate: (v) => set({ inspectionScheduleDate: v }, false, 'ui/setInspectionScheduleDate'),
        // Accepts either a value or an updater, same convention as
        // setPoInspectionSelection above - callers patch one field (e.g.
        // just scrollY) without a stale read of the rest.
        setQcReportsViewState: (v) =>
          set(
            (state) => ({ qcReportsViewState: typeof v === 'function' ? v(state.qcReportsViewState) : v }),
            false,
            'ui/setQcReportsViewState'
          ),

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
        name: 'twif-ui-prefs',
        partialize: (state) => ({
          sidebarCollapsed: state.sidebarCollapsed,
          otifYear: state.otifYear,
          qualityYear: state.qualityYear,
          shippedPoType: state.shippedPoType,
          sourcingMode: state.sourcingMode,
          volumeView: state.volumeView,
          openPoTableView: state.openPoTableView,
          volumeVendor: state.volumeVendor,
          poInspectionSelection: state.poInspectionSelection,
          inspectionScheduleDate: state.inspectionScheduleDate,
          qcReportsViewState: state.qcReportsViewState,
          // mobileOpen and chartTotals intentionally excluded
        }),
      }
    ),
    { name: 'UI Store' }
  )
)
