import { create } from 'zustand'
import { PO_ROWS_FROM_EXCEL } from '../data/poRowsFromExcel'
import {
  PO_DEMO_ROW,
  STAGE_CARDS,
  EXCEPTION_CARDS,
  MANDATORY_TO_ALERT_DEPENDENCIES,
  MANDATORY_TO_ALERT_ITEM_DEPENDENCIES,
  CURRENT_USER_NAME,
  CURRENT_USER_ROLE,
  ACCOUNTS,
  alertNeedsFileUpload,
  getAlertChecklist,
  REAL_DATA,
} from '../constants'
import {
  workflowLineKey,
  worstRowForPo,
  createInitialStageProgressForPO,
  createInitialStageChecksForPO,
  variedCompletedTimestamp,
  activityTimestampNow,
  timestampNow,
} from '../utils'
import * as pctApi from '../../../api/pctApi'
import { supabase } from '../../../lib/supabase'
import { useAuthStore } from '../../../stores/authStore'

const USE_MOCK = import.meta.env.VITE_PCT_MOCK === 'true'
const PO_ROWS = USE_MOCK
  ? [PO_DEMO_ROW, ...(Array.isArray(PO_ROWS_FROM_EXCEL) ? PO_ROWS_FROM_EXCEL : [])]
  : []

function createInitialStageAlertChecksForPO(progress, po) {
  const lineKey = `${po && po.po ? po.po : ''}|${po && po.sku != null ? po.sku : ''}`
  const poSeed = lineKey.split('').reduce((a, ch) => a + ch.charCodeAt(0), 0)
  return STAGE_CARDS.reduce((acc, s, stageIdx) => {
    const isCompleted = progress[s.id] && progress[s.id].status === 'completed'
    acc[s.id] = s.alerts.map((alertText, alertIdx) =>
      getAlertChecklist(s.id, alertText).map((label, checkIdx) => ({
        label,
        requiresFile: alertNeedsFileUpload(alertText),
        done: isCompleted,
        by: isCompleted ? CURRENT_USER_NAME : '',
        ts: isCompleted ? variedCompletedTimestamp(poSeed + stageIdx * 151 + alertIdx * 23 + checkIdx * 5) : '',
        fileName: '',
        fileUrl: '',
      })),
    )
    return acc
  }, {})
}

function buildInitialWorkflowState(po) {
  const progress = createInitialStageProgressForPO(po)
  return {
    stageProgress: progress,
    stageChecks: createInitialStageChecksForPO(progress, po),
    stageAlertChecks: createInitialStageAlertChecksForPO(progress, po),
    inlineInspectionUploads: [],
  }
}

function buildInitialChat() {
  if (!USE_MOCK) return []
  return PO_ROWS.slice(0, 80).flatMap((p, idx) => [
    { role: 'buyer', text: `Please share latest status for ${p.sku}.`, ts: `${String(8 + (idx % 10)).padStart(2, '0')} Apr 2026, 09:4${idx % 10}`, po: p.po, sku: p.sku },
    { role: 'merchant', text: `Working on ${p.stage}. Will update by EOD.`, ts: `${String(8 + (idx % 10)).padStart(2, '0')} Apr 2026, 10:1${idx % 10}`, po: p.po, sku: p.sku },
    { role: 'system', actorRole: 'merchant', actorName: 'merchant', text: `Activity created for PO ${p.po}`, ts: `${String(8 + (idx % 10)).padStart(2, '0')} Apr 2026, 10:3${idx % 10}`, po: p.po, sku: p.sku },
  ])
}

function getAlertDependencies(stageId, alertIdx) {
  const explicit = MANDATORY_TO_ALERT_DEPENDENCIES[stageId] && MANDATORY_TO_ALERT_DEPENDENCIES[stageId][alertIdx]
  if (explicit && explicit.length) return explicit
  const stage = STAGE_CARDS.find((s) => s.id === stageId)
  if (!stage || !stage.alerts[alertIdx]) return []
  const alertText = (stage.alerts[alertIdx] || '').toLowerCase()
  const checks = stage.checks || []
  const byKeyword = []
  checks.forEach((checkLabel, idx) => {
    const check = (checkLabel || '').toLowerCase()
    if (
      (alertText.includes('tech pack') && check.includes('tech pack')) ||
      (alertText.includes('spec') && (check.includes('spec') || check.includes('size') || check.includes('material') || check.includes('finish'))) ||
      (alertText.includes('weight') && (check.includes('weight') || check.includes('material'))) ||
      (alertText.includes('artwork') && (check.includes('artwork') || check.includes('color'))) ||
      (alertText.includes('currency') && (check.includes('price') || check.includes('value'))) ||
      (alertText.includes('price') && (check.includes('price') || check.includes('value') || check.includes('cost'))) ||
      (alertText.includes('cost') && (check.includes('price') || check.includes('cost'))) ||
      (alertText.includes('rm') && (check.includes('rm') || check.includes('bom') || check.includes('lead time') || check.includes('source'))) ||
      (alertText.includes('delay') && (check.includes('date') || check.includes('lead time') || check.includes('inline') || check.includes('final'))) ||
      (alertText.includes('barcode') && (check.includes('barcode') || check.includes('label'))) ||
      (alertText.includes('label') && check.includes('label')) ||
      (alertText.includes('carton') && check.includes('carton')) ||
      (alertText.includes('approval') && check.includes('approval')) ||
      (alertText.includes('inspection') && (check.includes('inspection') || check.includes('final'))) ||
      (alertText.includes('qty') && (check.includes('qty') || check.includes('quantity'))) ||
      (alertText.includes('shipment') && (check.includes('invoice') || check.includes('packing') || check.includes('etd'))) ||
      (alertText.includes('vessel') && check.includes('etd')) ||
      (alertText.includes('bl') && check.includes('bl'))
    ) byKeyword.push(idx)
  })
  return [...new Set(byKeyword)]
}

function getAlertItemDependencies(stageId, alertIdx, checkIdx) {
  const stageMap = MANDATORY_TO_ALERT_ITEM_DEPENDENCIES[stageId]
  const alertMap = stageMap && stageMap[alertIdx]
  if (alertMap && Object.prototype.hasOwnProperty.call(alertMap, checkIdx)) return alertMap[checkIdx] || []
  return []
}

function finalInspectionOutcomeAlertIdx() {
  const fin = STAGE_CARDS.find((s) => s.id === 'final')
  if (!fin || !fin.alerts) return -1
  return fin.alerts.findIndex((a) => /inspection outcome/i.test(String(a)))
}

export const usePctBetaStore = create((set, get) => {
  const initialPO = PO_ROWS[0] || null
  const initialKey = initialPO ? workflowLineKey(initialPO) : ''
  const initialWorkflow = initialKey ? { [initialKey]: buildInitialWorkflowState(initialPO) } : {}

  const getToken = () => useAuthStore.getState().session?.access_token

  const applyWorkflowPayload = (row, payload) => {
    const key = workflowLineKey(row)
    set((s) => ({
      workflowStateByPoSku: {
        ...s.workflowStateByPoSku,
        [key]: {
          stageProgress: payload.stageProgress,
          stageChecks: payload.stageChecks,
          stageAlertChecks: payload.stageAlertChecks,
          inlineInspectionUploads: payload.inlineInspectionUploads || [],
        },
      },
    }))
    if (payload.line) {
      set((s) => ({
        poRows: s.poRows.map((r) => (workflowLineKey(r) === key ? { ...r, ...payload.line } : r)),
        selectedPO: s.selectedPO && workflowLineKey(s.selectedPO) === key ? { ...s.selectedPO, ...payload.line } : s.selectedPO,
      }))
    }
  }

  return {
    useMockMode: USE_MOCK,
    loading: false,
    loadError: null,
    kpis: USE_MOCK ? REAL_DATA : null,
    allPoLines: [],

    poRows: PO_ROWS,

    activeTab: 'dashboard',
    activeFilter: 'all',
    selectedPO: initialPO,

    workflowStateByPoSku: initialWorkflow,
    exceptionChecksByPO: {},
    tabChecksByPO: {},

    aiChatMessages: buildInitialChat(),
    pendingAttachment: null,
    attachMenuOpen: false,

    po360MediaDrawerOpen: false,
    accountMenuOpen: false,
    activeAccountIdx: 0,
    triggerOpenState: {},

    toast: { open: false, kicker: '', headline: '', html: '', variant: 'success', timer: null },

    hydrateFromApi: ({ rows, kpis, allLines }) => {
      const representative = rows || []
      const list = allLines || rows || []
      set({
        poRows: representative.length ? representative : list,
        allPoLines: list,
        kpis: kpis || null,
        selectedPO: (representative[0] || list[0]) || null,
        loading: false,
        loadError: null,
      })
      const first = representative[0] || list[0]
      if (first?.pctLineId) get().loadWorkflowForRow(first)
    },

    fetchDashboard: async (buyerOrgId) => {
      if (USE_MOCK) return
      const token = getToken()
      if (!token) return
      set({ loading: true, loadError: null })
      try {
        const data = await pctApi.fetchPctDashboard(token, buyerOrgId ? { buyer_org_id: buyerOrgId } : {})
        get().hydrateFromApi({ rows: data.rows, kpis: data.kpis, allLines: data.allLines })
      } catch (err) {
        set({ loading: false, loadError: err.message })
        get().showToast({ kicker: 'Load failed', headline: 'Could not load PCT data', html: err.message, variant: 'warn' })
      }
    },

    loadWorkflowForRow: async (row) => {
      if (USE_MOCK || !row?.pctLineId) {
        get().ensureWorkflowStateFor(row)
        return
      }
      const token = getToken()
      if (!token) return
      try {
        const data = await pctApi.fetchPctWorkflow(row.pctLineId, token)
        applyWorkflowPayload(row, data)
      } catch (err) {
        get().showToast({ kicker: 'Workflow', headline: 'Failed to load workflow', html: err.message, variant: 'warn' })
      }
    },

    loadActivityForSelected: async () => {
      const { selectedPO } = get()
      if (USE_MOCK || !selectedPO?.pctLineId) return
      const token = getToken()
      if (!token) return
      try {
        const data = await pctApi.fetchPctActivity(selectedPO.pctLineId, token)
        set({ aiChatMessages: data.messages || [] })
      } catch {
        // keep existing messages
      }
    },

    loadExceptionsForSelected: async () => {
      const { selectedPO } = get()
      if (USE_MOCK || !selectedPO?.po) return
      const token = getToken()
      if (!token) return
      try {
        const data = await pctApi.fetchPctExceptions(selectedPO.po, token)
        set((s) => ({
          exceptionChecksByPO: { ...s.exceptionChecksByPO, [selectedPO.po]: data.checks },
        }))
      } catch {
        // ignore
      }
    },

    loadTabChecksFromApi: async (tabKey, labels) => {
      const { selectedPO } = get()
      if (USE_MOCK || !selectedPO?.po) return
      const token = getToken()
      if (!token) return
      try {
        const data = await pctApi.fetchPctTabChecks(selectedPO.po, tabKey, labels, token)
        set((s) => ({
          tabChecksByPO: {
            ...s.tabChecksByPO,
            [tabKey]: { ...(s.tabChecksByPO[tabKey] || {}), [selectedPO.po]: data.rows },
          },
        }))
      } catch {
        // ignore
      }
    },

    subscribeRealtime: (pctLineId) => {
      if (USE_MOCK || !pctLineId || !supabase) return () => {}
      const channel = supabase.channel(`pct-line-${pctLineId}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'pct_stage_progress',
          filter: `pct_line_id=eq.${pctLineId}`,
        }, () => {
          const row = get().selectedPO
          if (row?.pctLineId === pctLineId) get().loadWorkflowForRow(row)
        })
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'pct_activity',
          filter: `pct_line_id=eq.${pctLineId}`,
        }, () => get().loadActivityForSelected())
        .subscribe()
      return () => { supabase.removeChannel(channel) }
    },

    setActiveTab: (key) => {
      const next = key
      set((s) => ({ activeTab: next, po360MediaDrawerOpen: next === 'po360' ? s.po360MediaDrawerOpen : false }))
    },

    setActiveFilter: (f) => set({ activeFilter: f }),

    ensureWorkflowStateFor: (po) => {
      if (!po || !po.po || po.sku == null || po.sku === '') return
      const key = workflowLineKey(po)
      const cur = get().workflowStateByPoSku
      if (cur[key]) return
      set({ workflowStateByPoSku: { ...cur, [key]: buildInitialWorkflowState(po) } })
    },

    selectPO: (poStr) => {
      const found = worstRowForPo(poStr, get().poRows)
      if (!found) return
      set({ selectedPO: found })
      get().loadWorkflowForRow(found)
      get().loadActivityForSelected()
      get().loadExceptionsForSelected()
    },

    selectPOSku: (po, sku) => {
      const found = get().poRows.find((r) => r.po === po && String(r.sku) === String(sku))
        || get().allPoLines.find((r) => r.po === po && String(r.sku) === String(sku))
      if (!found) return
      set({ selectedPO: found, po360MediaDrawerOpen: false })
      get().loadWorkflowForRow(found)
      get().loadActivityForSelected()
    },

    searchPO: (val) => {
      const v = (val || '').toLowerCase()
      const hits = get().poRows.filter((r) => r.po.toLowerCase().includes(v))
      if (!hits.length) return
      get().selectPO(hits[0].po)
    },

    toggleStageCheck: async (stageId, checkIdx, checked) => {
      const { selectedPO, workflowStateByPoSku, aiChatMessages, useMockMode } = get()
      if (!useMockMode && selectedPO?.pctLineId) {
        const token = getToken()
        const ws = workflowStateByPoSku[workflowLineKey(selectedPO)]
        const expectedDoneAt = ws?.stageChecks?.[stageId]?.[checkIdx]?.doneAt || null
        try {
          await pctApi.patchStageCheck(selectedPO.pctLineId, {
            stageId, checkIndex: checkIdx, done: checked, expectedDoneAt,
          }, token)
          await get().loadWorkflowForRow(selectedPO)
          return
        } catch (err) {
          get().showToast({ kicker: 'Update failed', headline: err.message, html: 'Reload and retry.', variant: 'warn' })
          return
        }
      }
      const key = workflowLineKey(selectedPO)
      const ws = workflowStateByPoSku[key]
      if (!ws || !ws.stageChecks[stageId] || !ws.stageChecks[stageId][checkIdx]) return
      const stage = STAGE_CARDS.find((s) => s.id === stageId)
      const checkName = stage && stage.checks[checkIdx] ? stage.checks[checkIdx] : 'Checklist item'
      const ts = activityTimestampNow()
      const newChecks = ws.stageChecks[stageId].map((c, i) =>
        i === checkIdx ? { done: !!checked, by: checked ? CURRENT_USER_NAME : '', ts: checked ? ts : '' } : c,
      )
      const stageChecks = { ...ws.stageChecks, [stageId]: newChecks }

      let stageAlertChecks = ws.stageAlertChecks
      const alertRows = stageAlertChecks[stageId] || []
      const synced = alertRows.map((checkRows, alertIdx) => {
        const requiredIdx = getAlertDependencies(stageId, alertIdx)
        const ok = requiredIdx.length === 0 || requiredIdx.every((i) => newChecks[i] && newChecks[i].done)
        if (ok) return checkRows
        return checkRows.map((c) => ({ ...c, done: false, by: '', ts: '', fileName: '', fileUrl: '' }))
      })
      stageAlertChecks = { ...stageAlertChecks, [stageId]: synced }

      const updated = { ...ws, stageChecks, stageAlertChecks }
      const newChat = [...aiChatMessages, {
        role: 'system',
        actorRole: CURRENT_USER_ROLE,
        actorName: CURRENT_USER_NAME,
        text: checked ? `"${checkName}" marked complete` : `"${checkName}" marked incomplete`,
        ts,
        po: selectedPO.po,
        sku: selectedPO.sku,
      }]
      set({
        workflowStateByPoSku: { ...workflowStateByPoSku, [key]: updated },
        aiChatMessages: newChat,
      })
    },

    toggleTriggerCheck: async (stageId, alertIdx, checkIdx, checked) => {
      const { selectedPO, workflowStateByPoSku, aiChatMessages, useMockMode } = get()
      if (!useMockMode && selectedPO?.pctLineId) {
        const token = getToken()
        const ws = workflowStateByPoSku[workflowLineKey(selectedPO)]
        const expectedDoneAt = ws?.stageAlertChecks?.[stageId]?.[alertIdx]?.[checkIdx]?.doneAt || null
        try {
          await pctApi.patchAlertCheck(selectedPO.pctLineId, {
            stageId, alertIndex: alertIdx, checkIndex: checkIdx, done: checked, expectedDoneAt,
          }, token)
          await get().loadWorkflowForRow(selectedPO)
          return
        } catch (err) {
          get().showToast({ kicker: 'Update failed', headline: err.message, html: 'Reload and retry.', variant: 'warn' })
          return
        }
      }
      const key = workflowLineKey(selectedPO)
      const ws = workflowStateByPoSku[key]
      if (!ws || !ws.stageAlertChecks[stageId] || !ws.stageAlertChecks[stageId][alertIdx] || !ws.stageAlertChecks[stageId][alertIdx][checkIdx]) return
      const ts = activityTimestampNow()
      const stage = STAGE_CARDS.find((s) => s.id === stageId)

      let newStageChecks = ws.stageChecks
      if (checked) {
        const requiredIdx = getAlertItemDependencies(stageId, alertIdx, checkIdx)
        if (requiredIdx.length) {
          const cur = newStageChecks[stageId] || []
          newStageChecks = {
            ...newStageChecks,
            [stageId]: cur.map((c, i) =>
              requiredIdx.includes(i) && !c.done ? { done: true, by: CURRENT_USER_NAME, ts } : c,
            ),
          }
        }
      }

      let alertRows = ws.stageAlertChecks[stageId].map((rows, ai) =>
        ai === alertIdx
          ? rows.map((c, ci) => ci === checkIdx
              ? { ...c, done: !!checked, by: checked ? CURRENT_USER_NAME : '', ts: checked ? ts : '' }
              : c)
          : rows,
      )
      const outcomeIdx = finalInspectionOutcomeAlertIdx()
      if (stageId === 'final' && outcomeIdx === alertIdx && checked && alertRows[alertIdx].length === 2) {
        const other = checkIdx === 0 ? 1 : 0
        alertRows = alertRows.map((rows, ai) =>
          ai === alertIdx ? rows.map((c, ci) => (ci === other ? { ...c, done: false, by: '', ts: '' } : c)) : rows,
        )
      }
      const newAlertChecks = { ...ws.stageAlertChecks, [stageId]: alertRows }
      const updated = { ...ws, stageChecks: newStageChecks, stageAlertChecks: newAlertChecks }

      const check = alertRows[alertIdx][checkIdx]
      const newChat = [...aiChatMessages, {
        role: 'system',
        actorRole: CURRENT_USER_ROLE,
        actorName: CURRENT_USER_NAME,
        text: `"${check.label}" ${checked ? 'marked complete' : 'marked incomplete'} for alert "${stage?.alerts[alertIdx] ?? ''}"`,
        ts,
        po: selectedPO.po,
        sku: selectedPO.sku,
      }]
      set({
        workflowStateByPoSku: { ...workflowStateByPoSku, [key]: updated },
        aiChatMessages: newChat,
      })
    },

    attachTriggerFile: async (stageId, alertIdx, checkIdx, file) => {
      const { selectedPO, workflowStateByPoSku, useMockMode } = get()
      if (!useMockMode && selectedPO?.pctLineId) {
        const token = getToken()
        const fd = new FormData()
        fd.append('file', file)
        fd.append('stageId', stageId)
        fd.append('alertIndex', String(alertIdx))
        fd.append('checkIndex', String(checkIdx))
        try {
          await pctApi.uploadPctFile(selectedPO.pctLineId, fd, token)
          await get().loadWorkflowForRow(selectedPO)
          return
        } catch (err) {
          get().showToast({ kicker: 'Upload failed', headline: err.message, variant: 'warn' })
          return
        }
      }
      const key = workflowLineKey(selectedPO)
      const ws = workflowStateByPoSku[key]
      if (!ws || !ws.stageAlertChecks[stageId] || !ws.stageAlertChecks[stageId][alertIdx] || !ws.stageAlertChecks[stageId][alertIdx][checkIdx]) return
      const url = URL.createObjectURL(file)
      const alertRows = ws.stageAlertChecks[stageId].map((rows, ai) =>
        ai === alertIdx
          ? rows.map((c, ci) => (ci === checkIdx ? { ...c, fileName: file.name, fileUrl: url } : c))
          : rows,
      )
      const updated = { ...ws, stageAlertChecks: { ...ws.stageAlertChecks, [stageId]: alertRows } }
      set({ workflowStateByPoSku: { ...workflowStateByPoSku, [key]: updated } })
    },

    handleInlineInspectionUpload: async (file) => {
      const { selectedPO, workflowStateByPoSku, showToast, useMockMode } = get()
      if (!useMockMode && selectedPO?.pctLineId) {
        const token = getToken()
        const fd = new FormData()
        fd.append('file', file)
        fd.append('stageId', 'inline')
        try {
          await pctApi.uploadPctFile(selectedPO.pctLineId, fd, token)
          await get().loadWorkflowForRow(selectedPO)
          showToast({ kicker: 'Inline QC', headline: 'Inspection file added', html: `${file.name} uploaded.`, variant: 'success', autoMs: 4800 })
          return
        } catch (err) {
          showToast({ kicker: 'Upload failed', headline: err.message, variant: 'warn' })
          return
        }
      }
      const key = workflowLineKey(selectedPO)
      const ws = workflowStateByPoSku[key]
      if (!ws) return
      const updated = { ...ws, inlineInspectionUploads: [...(ws.inlineInspectionUploads || []), { name: file.name, url: URL.createObjectURL(file) }] }
      set({ workflowStateByPoSku: { ...workflowStateByPoSku, [key]: updated } })
      showToast({ kicker: 'Inline QC', headline: 'Inspection file added', html: `${file.name} appears under Attachments.`, variant: 'success', autoMs: 4800 })
    },

    advanceStage: async (stageId) => {
      const { selectedPO, workflowStateByPoSku, aiChatMessages, showToast, useMockMode } = get()
      if (!useMockMode && selectedPO?.pctLineId) {
        const token = getToken()
        try {
          await pctApi.advancePctStage(selectedPO.pctLineId, stageId, token)
          await get().fetchDashboard()
          await get().loadWorkflowForRow(selectedPO)
          showToast({ kicker: 'Workflow updated', headline: 'Stage advanced successfully', variant: 'success', autoMs: 6200 })
          return
        } catch (err) {
          showToast({ kicker: 'Blocked', headline: err.message || 'Cannot advance stage', html: 'Complete mandatory checks and resolve alerts.', variant: 'warn', autoMs: 6400 })
          return
        }
      }
      const idx = STAGE_CARDS.findIndex((s) => s.id === stageId)
      if (idx < 0) return
      const key = workflowLineKey(selectedPO)
      const ws = workflowStateByPoSku[key]
      if (!ws) return

      if (idx > 0) {
        const prevId = STAGE_CARDS[idx - 1].id
        const prev = ws.stageProgress[prevId]
        if (!prev || prev.status !== 'completed') {
          showToast({ kicker: 'Blocked', headline: 'Complete prior stage first', html: 'Finish all mandatory checks and hard stops in the previous stage, then try again.', variant: 'warn', autoMs: 6400 })
          return
        }
      }
      const current = ws.stageProgress[stageId]
      if (!current) return
      if (current.status === 'completed') {
        showToast({ kicker: 'Already done', headline: 'This stage is completed', html: current.timestamp, variant: 'warn', autoMs: 5600 })
        return
      }
      const mandatory = ws.stageChecks[stageId] || []
      if (!mandatory.length || !mandatory.every((c) => c.done)) {
        showToast({ kicker: 'Incomplete', headline: 'Mandatory checks pending', html: 'Complete every mandatory item for this stage before advancing.', variant: 'warn', autoMs: 6400 })
        return
      }
      const alertRows = ws.stageAlertChecks[stageId] || []
      const allAlertsOk = alertRows.every((checks, alertIdx) => {
        if (!checks.length) return true
        const requiredIdx = getAlertDependencies(stageId, alertIdx)
        const depsMet = requiredIdx.length === 0 || requiredIdx.every((i) => mandatory[i] && mandatory[i].done)
        if (!depsMet) return true
        const mode = stageId === 'final' && alertIdx === finalInspectionOutcomeAlertIdx() ? 'any' : 'all'
        return mode === 'any' ? checks.some((c) => c.done) : checks.every((c) => c.done)
      })
      if (!allAlertsOk) {
        showToast({ kicker: 'Hard stops open', headline: 'Resolve alerts first', html: 'Clear every auto-trigger / hard-stop checklist row for this stage.', variant: 'warn', autoMs: 6400 })
        return
      }

      const ts = activityTimestampNow()

      if (idx === STAGE_CARDS.length - 1) {
        const newProgress = {
          ...ws.stageProgress,
          [stageId]: { status: 'completed', timestamp: ts },
        }
        const updated = { ...ws, stageProgress: newProgress }
        const newChat = [...aiChatMessages, {
          role: 'system',
          systemKind: 'stage_complete',
          actorRole: CURRENT_USER_ROLE,
          actorName: CURRENT_USER_NAME,
          stageTitle: STAGE_CARDS[idx].title,
          nextStageTitle: null,
          ts,
          po: selectedPO.po,
          sku: selectedPO.sku,
        }]
        set({ workflowStateByPoSku: { ...workflowStateByPoSku, [key]: updated }, aiChatMessages: newChat })
        showToast({
          kicker: 'Workflow updated',
          headline: 'Final stage completed',
          html: `<strong>${STAGE_CARDS[idx].title}</strong> — workflow complete for this SKU line.`,
          variant: 'success',
          autoMs: 6200,
        })
        return
      }

      const nextId = STAGE_CARDS[idx + 1].id
      const nextStatus = ws.stageProgress[nextId]?.status
      const newProgress = {
        ...ws.stageProgress,
        [stageId]: { status: 'completed', timestamp: ts },
        [nextId]: nextStatus === 'pending' || nextStatus === 'risk'
          ? { status: 'active', timestamp: 'Activated on ' + timestampNow() }
          : ws.stageProgress[nextId],
      }
      const updated = { ...ws, stageProgress: newProgress }
      const newChat = [...aiChatMessages, {
        role: 'system',
        systemKind: 'stage_complete',
        actorRole: CURRENT_USER_ROLE,
        actorName: CURRENT_USER_NAME,
        stageTitle: STAGE_CARDS[idx].title,
        nextStageTitle: STAGE_CARDS[idx + 1].title,
        ts,
        po: selectedPO.po,
        sku: selectedPO.sku,
      }]
      set({ workflowStateByPoSku: { ...workflowStateByPoSku, [key]: updated }, aiChatMessages: newChat })
      showToast({
        kicker: 'Workflow updated',
        headline: 'Stage advanced successfully',
        html: `<strong>${STAGE_CARDS[idx].title}</strong> → <strong style="color:#1d4ed8">${STAGE_CARDS[idx + 1].title}</strong>`,
        variant: 'success',
        autoMs: 6200,
      })
    },

    toggleExceptionCheck: async (cardIdx, pointIdx, checked) => {
      const { selectedPO, exceptionChecksByPO, useMockMode } = get()
      if (!selectedPO || !selectedPO.po) return
      const po = selectedPO.po
      if (!useMockMode) {
        const token = getToken()
        try {
          await pctApi.patchPctException(po, { cardIndex: cardIdx, pointIndex: pointIdx, done: checked }, token)
          await get().loadExceptionsForSelected()
          return
        } catch (err) {
          get().showToast({ kicker: 'Update failed', headline: err.message, variant: 'warn' })
          return
        }
      }
      const cur = exceptionChecksByPO[po] || EXCEPTION_CARDS.map((c) => c.points.map(() => ({ done: false, by: '', ts: '' })))
      const next = cur.map((card, ci) =>
        ci === cardIdx ? card.map((it, pi) => pi === pointIdx ? { done: !!checked, by: checked ? CURRENT_USER_NAME : '', ts: checked ? activityTimestampNow() : '' } : it) : card,
      )
      set({ exceptionChecksByPO: { ...exceptionChecksByPO, [po]: next } })
    },

    toggleTabCheck: async (tabKey, itemIdx, checked, labelOrLabels) => {
      const { selectedPO, tabChecksByPO, useMockMode } = get()
      if (!selectedPO || !selectedPO.po) return
      const po = selectedPO.po
      const label = Array.isArray(labelOrLabels) ? labelOrLabels[itemIdx] : labelOrLabels
      if (!useMockMode) {
        const token = getToken()
        try {
          await pctApi.patchPctTabCheck(po, tabKey, { checkIndex: itemIdx, done: checked, label }, token)
          if (Array.isArray(labelOrLabels)) await get().loadTabChecksFromApi(tabKey, labelOrLabels)
          return
        } catch (err) {
          get().showToast({ kicker: 'Update failed', headline: err.message, variant: 'warn' })
          return
        }
      }
      const tab = tabChecksByPO[tabKey] ? { ...tabChecksByPO[tabKey] } : {}
      const rows = tab[po] ? [...tab[po]] : []
      if (!rows[itemIdx]) return
      rows[itemIdx] = { done: !!checked, by: checked ? CURRENT_USER_NAME : '', ts: checked ? activityTimestampNow() : '' }
      tab[po] = rows
      set({ tabChecksByPO: { ...tabChecksByPO, [tabKey]: tab } })
    },

    ensureTabChecks: (tabKey, itemCount, labels) => {
      const { selectedPO, tabChecksByPO, useMockMode } = get()
      if (!selectedPO || !selectedPO.po) return
      const po = selectedPO.po
      if (!useMockMode && labels) {
        get().loadTabChecksFromApi(tabKey, labels)
        return
      }
      const tab = tabChecksByPO[tabKey] || {}
      if (tab[po] && tab[po].length === itemCount) return
      const newRows = Array.from({ length: itemCount }, () => ({ done: false, by: '', ts: '' }))
      set({ tabChecksByPO: { ...tabChecksByPO, [tabKey]: { ...tab, [po]: newRows } } })
    },

    sendActivityMessage: (text) => {
      const { selectedPO, aiChatMessages, pendingAttachment } = get()
      const val = (text || '').trim()
      if (!val && !pendingAttachment) return
      set({
        aiChatMessages: [
          ...aiChatMessages,
          {
            role: 'merchant',
            text: val || (pendingAttachment && pendingAttachment.type === 'image' ? 'Image shared' : 'File shared'),
            ts: timestampNow(),
            po: selectedPO.po,
            sku: selectedPO.sku,
            attachment: pendingAttachment ? { ...pendingAttachment } : null,
          },
        ],
        pendingAttachment: null,
        attachMenuOpen: false,
      })
    },

    sendChecklistMessage: (text) => {
      const { selectedPO, aiChatMessages } = get()
      const msg = (text || '').trim() || 'Checklist update'
      set({
        aiChatMessages: [
          ...aiChatMessages,
          { role: 'system', text: msg, ts: timestampNow(), po: selectedPO.po, sku: selectedPO.sku },
        ],
      })
    },

    setPendingAttachment: (att) => set({ pendingAttachment: att }),
    setAttachMenuOpen: (open) => set({ attachMenuOpen: !!open }),
    clearAttachment: () => set({ pendingAttachment: null }),

    togglePO360MediaDrawer: () => set((s) => ({ po360MediaDrawerOpen: !s.po360MediaDrawerOpen })),

    setActiveAccount: (idx) => {
      if (idx < 0 || idx >= ACCOUNTS.length) return
      set({ activeAccountIdx: idx, accountMenuOpen: false })
      if (!USE_MOCK) get().fetchDashboard()
    },
    openAccountSwitcher: () => set({ accountMenuOpen: true }),
    closeAccountSwitcher: () => set({ accountMenuOpen: false }),
    toggleAccountSwitcher: () => set((s) => ({ accountMenuOpen: !s.accountMenuOpen })),

    setTriggerOpenState: (stageId, alertIdx, isOpen) => {
      const k = `${workflowLineKey(get().selectedPO) || 'default'}::${stageId}__${alertIdx}`
      set({ triggerOpenState: { ...get().triggerOpenState, [k]: !!isOpen } })
    },
    isTriggerOpen: (stageId, alertIdx) => {
      const k = `${workflowLineKey(get().selectedPO) || 'default'}::${stageId}__${alertIdx}`
      const s = get().triggerOpenState
      if (Object.prototype.hasOwnProperty.call(s, k)) return !!s[k]
      return alertIdx === 0
    },

    showToast: (opts) => {
      const cur = get().toast
      if (cur.timer) clearTimeout(cur.timer)
      const autoMs = typeof opts.autoMs === 'number' ? opts.autoMs : 5600
      const timer = autoMs > 0 ? setTimeout(() => get().hideToast(), autoMs) : null
      set({ toast: { open: true, kicker: opts.kicker || '', headline: opts.headline || '', html: opts.html || '', variant: opts.variant === 'warn' ? 'warn' : 'success', timer } })
    },
    hideToast: () => {
      const { toast } = get()
      if (toast.timer) clearTimeout(toast.timer)
      set({ toast: { ...toast, open: false, timer: null } })
    },
  }
})
