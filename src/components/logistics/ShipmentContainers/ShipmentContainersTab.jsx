import { useState } from 'react'
import { useOrgDepartment, useIsAdmin } from '../../../stores/profileStore'
import { useShipmentContainers } from '../../../hooks/useShipmentContainers'
import { useShipmentContainerDetail } from '../../../hooks/useShipmentContainerDetail'
import { useShipmentGroups } from '../../../hooks/useShipmentGroups'
import PendingWorkOverview from './PendingWorkOverview'
import ContainerList from './ContainerList'
import ContainerDetail from './ContainerDetail'
import NewContainerForm from './NewContainerForm'
import InvoiceGroupsPane from './InvoiceGroupsPane'
import AttachInvoicesModal from './AttachInvoicesModal'
import { useShipmentExport } from '../../../hooks/useShipmentExport'

const STAGES = [
  { key: 'invoices',   label: 'Invoices' },
  { key: 'containers', label: 'Containers' },
]

export default function ShipmentContainersTab() {
  const dept = useOrgDepartment()
  const isAdmin = useIsAdmin()
  const canManage = dept === 'logistics' || isAdmin

  const [selectedBuyerOrgId, setSelectedBuyerOrgId] = useState(null)
  const [selectedBuyerName, setSelectedBuyerName]   = useState('')
  const [stage, setStage] = useState('invoices')
  const [selectedContainerId, setSelectedContainerId] = useState(null)
  const [isCreating, setIsCreating] = useState(false)
  const [attachInvoicesFor, setAttachInvoicesFor] = useState(null)

  const {
    containers, loading,
    search, onSearchChange,
    selectedMonth, onMonthChange, monthOptions, hasFilters, clearFilters,
    refetch: refetchList,
  } = useShipmentContainers(selectedBuyerOrgId)
  const { container, refetch: refetchDetail } = useShipmentContainerDetail(selectedContainerId)
  const { groups, loading: groupsLoading, refetch: refetchGroups } = useShipmentGroups(selectedBuyerOrgId)
  const { exportToExcel, exporting } = useShipmentExport()

  const openGroupsCount = groups.filter(g => g.status !== 'booked').length

  // Enters a buyer's environment, landing on whichever stage actually has
  // the item the user clicked in the cross-buyer overview (or 'invoices' by
  // default, for the "Open workspace" link) — grouping happens on the
  // merchant side now, so logistics never lands anywhere but Invoices/Containers.
  const jumpToBuyer = (id, name, targetStage) => {
    setSelectedBuyerOrgId(id)
    setSelectedBuyerName(name)
    setStage(targetStage)
    setSelectedContainerId(null)
    setIsCreating(false)
  }

  const backToBuyers = () => {
    setSelectedBuyerOrgId(null)
    setSelectedBuyerName('')
    setSelectedContainerId(null)
    setIsCreating(false)
  }

  const selectContainer = (c) => { setIsCreating(false); setSelectedContainerId(c.id) }
  const closeDetail = () => setSelectedContainerId(null)
  const startCreating = () => { setSelectedContainerId(null); setIsCreating(true) }

  const handleCreateContainer = async (newId) => {
    await refetchList()
    setIsCreating(false)
    setSelectedContainerId(newId)
  }

  const handleGroupsChanged = async () => {
    await refetchGroups()
  }

  // Booked invoices are read-only from the Invoices stage — this jumps
  // straight to the container that owns them instead of leaving the user to
  // find it manually in the Containers list.
  const goToContainer = (containerId) => {
    setStage('containers')
    setSelectedContainerId(containerId)
    setIsCreating(false)
  }

  const handleShipmentRecorded = async () => {
    await refetchDetail()
    await refetchList()
  }

  const detailOpen = isCreating || !!container

  return (
    <div className="flex flex-col overflow-hidden h-full">
      {/* Buyer environment top bar (back + name + stage tabs) — only shown
          once a buyer is selected; the overview landing screen has no top
          bar of its own. */}
      {selectedBuyerOrgId && (
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-200 bg-white flex-shrink-0">
          <button type="button" onClick={backToBuyers}
            className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <span className="text-sm font-bold text-gray-900 truncate">{selectedBuyerName}</span>

          <div className="flex items-center gap-1.5 ml-auto">
            {STAGES.map(s => {
              const count = s.key === 'invoices' ? openGroupsCount : containers.length
              const active = stage === s.key
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setStage(s.key)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors
                    ${active ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                >
                  {s.label}
                  {count > 0 && (
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0
                      ${active ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-600'}`}>
                      {count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row overflow-hidden flex-1">
        {!selectedBuyerOrgId ? (
          <PendingWorkOverview onJumpToBuyer={jumpToBuyer} />
        ) : stage === 'invoices' ? (
          <InvoiceGroupsPane
            buyerOrgId={selectedBuyerOrgId}
            groups={groups}
            loading={groupsLoading}
            onUpdated={handleGroupsChanged}
            onGoToContainer={goToContainer}
          />
        ) : (
          <>
            <ContainerList
              containers={containers}
              loading={loading}
              search={search}
              onSearchChange={onSearchChange}
              selectedMonth={selectedMonth}
              onMonthChange={onMonthChange}
              monthOptions={monthOptions}
              hasFilters={hasFilters}
              clearFilters={clearFilters}
              selectedContainerId={selectedContainerId}
              detailOpen={detailOpen}
              onSelect={selectContainer}
              canManage={canManage}
              onNewContainer={startCreating}
              onExport={() => exportToExcel(containers, selectedBuyerName)}
              exporting={exporting}
            />

            {isCreating ? (
              <NewContainerForm
                onClose={() => setIsCreating(false)}
                onCreate={handleCreateContainer}
                buyerOrgId={selectedBuyerOrgId}
                buyerName={selectedBuyerName}
              />
            ) : (
              <ContainerDetail
                container={selectedContainerId ? container : null}
                onClose={closeDetail}
                canManage={canManage}
                onShipmentRecorded={handleShipmentRecorded}
                onContainerUpdated={handleShipmentRecorded}
                onContainerDeleted={() => { setSelectedContainerId(null); refetchList() }}
                onAddInvoice={() => setAttachInvoicesFor(container)}
              />
            )}
          </>
        )}
      </div>

      <AttachInvoicesModal
        open={!!attachInvoicesFor}
        container={attachInvoicesFor}
        onClose={() => setAttachInvoicesFor(null)}
        onAttached={handleShipmentRecorded}
      />
    </div>
  )
}
