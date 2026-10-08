import { useEffect, useState } from 'react'
import { Factory, Package, Scissors, Search, X } from 'lucide-react'
import { usePmStore } from '../../../stores/pmStore'
import { PCT_STAGE_LABELS } from './pmConstants'
import { PmIcon } from './PmUi'

export default function TaskLinkedEntity({ task, editable = false }) {
  const resolveLinks = usePmStore(s => s.resolveLinks)
  const updateTask = usePmStore(s => s.updateTask)
  const [details, setDetails] = useState(null)

  useEffect(() => {
    if (!task?.linked_po_id && !task?.linked_workspace_id && !task?.linked_inspection_id) {
      setDetails(null)
      return
    }
    let cancelled = false
    resolveLinks({
      po_id: task.linked_po_id,
      workspace_id: task.linked_workspace_id,
      inspection_id: task.linked_inspection_id,
    }).then(data => { if (!cancelled) setDetails(data) }).catch(() => {})
    return () => { cancelled = true }
  }, [task?.linked_po_id, task?.linked_workspace_id, task?.linked_inspection_id, resolveLinks])

  const links = []

  if (task.linked_pct_stage) {
    links.push({
      key: 'pct',
      icon: Factory,
      label: PCT_STAGE_LABELS[task.linked_pct_stage] || task.linked_pct_stage,
      color: 'bg-violet-50 text-violet-700 border-violet-100',
      clear: { linked_pct_stage: null },
    })
  }

  if (task.linked_po_id) {
    const po = details?.po
    links.push({
      key: 'po',
      icon: Package,
      label: po?.po_number ? `PO ${po.po_number}` : 'Purchase Order',
      sub: po?.buyer || po?.supplier ? [po.buyer, po.supplier].filter(Boolean).join(' · ') : null,
      color: 'bg-blue-50 text-blue-700 border-blue-100',
      href: '/dashboard/orders?tab=po-table',
      clear: { linked_po_id: null },
    })
  }

  if (task.linked_workspace_id) {
    const ws = details?.workspace
    links.push({
      key: 'ws',
      icon: Scissors,
      label: ws?.buyer_ref || ws?.sku_code || 'SKU Workspace',
      color: 'bg-emerald-50 text-emerald-700 border-emerald-100',
      href: '/plm',
      clear: { linked_workspace_id: null },
    })
  }

  if (task.linked_inspection_id) {
    const insp = details?.inspection
    const label = insp
      ? `${insp.inspection_type || 'Inspection'}${insp.round ? ` R${insp.round}` : ''}${insp.po_number ? ` · ${insp.po_number}` : ''}`
      : 'Inspection'
    links.push({
      key: 'insp',
      icon: Search,
      label,
      color: 'bg-amber-50 text-amber-700 border-amber-100',
      clear: { linked_inspection_id: null },
    })
  }

  if (links.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1.5">
      {links.map(l => {
        const inner = (
          <>
            <PmIcon icon={l.icon} size={11} />
            <span>{l.label}</span>
            {editable && (
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); updateTask(task.id, l.clear) }}
                className="ml-0.5 opacity-60 hover:opacity-100"
              >
                <PmIcon icon={X} size={10} />
              </button>
            )}
          </>
        )
        const cls = `inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-medium ${l.color}`
        return l.href ? (
          <a key={l.key} href={l.href} className={cls} title={l.sub || l.label}>{inner}</a>
        ) : (
          <span key={l.key} className={cls} title={l.sub || l.label}>{inner}</span>
        )
      })}
    </div>
  )
}
