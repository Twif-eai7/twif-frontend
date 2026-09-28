import { create } from 'zustand'

// Controls PO-level filtering in useOpenPO / useShippedPO.
// poNos: null  → no filtering (normal mode)
// poNos: Set   → filter rows by poNo
//   mode 'include' → only show rows IN the set  (Lakshit viewing his own data)
//   mode 'exclude' → hide rows IN the set       (Shayni minus Lakshit's POs)
export const useLakshitStore = create(set => ({
  poNos: null,
  mode:  'include',
  setPoNos: (nos, mode = 'include') => set({ poNos: nos, mode }),
}))
