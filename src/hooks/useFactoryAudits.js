import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useFactoryAudits() {
  const [audits, setAudits] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('factory_audits')
      .select(`
        id, audit_type, assessment_date, status, revision_no, created_at, updated_at, factory_representative, auditor_id,
        organizations(id, display_name),
        categories(id, name),
        organization_members!auditor_id(full_name)
      `)
      .order('assessment_date', { ascending: false })
    if (err) setError(err.message)
    else setAudits(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  return { audits, loading, error, refresh: load }
}

export function useAuditDetail(id) {
  const [audit, setAudit] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    if (!id) { setAudit(null); setLoading(false); return }
    setLoading(true)
    setError(null)
    const { data, error: err } = await supabase
      .from('factory_audits')
      .select(`
        *,
        organizations(id, display_name),
        categories(id, name),
        audit_general_info(*),
        audit_manufacturing_info(*),
        audit_machinery(*),
        audit_infrastructure(*),
        audit_quality_management(*),
        audit_capacity_review(*),
        audit_compliance_safety(*),
        audit_summary(*)
      `)
      .eq('id', id)
      .single()
    if (err) setError(err.message)
    else setAudit(data)
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  return { audit, loading, error, refresh: load }
}

export async function createAuditHeader(payload) {
  return supabase.from('factory_audits').insert(payload).select().single()
}

export async function upsertSection(table, payload) {
  return supabase.from(table).upsert(payload, { onConflict: 'audit_id' }).select().single()
}

export async function addMachineryRow(row) {
  return supabase.from('audit_machinery').insert(row).select().single()
}

export async function updateMachineryRow(id, changes) {
  return supabase.from('audit_machinery').update(changes).eq('id', id)
}

export async function deleteMachineryRow(id) {
  return supabase.from('audit_machinery').delete().eq('id', id)
}

export async function updateAuditStatus(id, status) {
  return supabase.from('factory_audits').update({ status }).eq('id', id)
}
