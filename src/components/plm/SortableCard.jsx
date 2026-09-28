import { memo } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import SKUCard from './SKUCard'

function SortableCard({ sku, role, onEdit, onCardClick, onEditImage, isDuplicateLink, priority = false }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sku.id })

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.45 : 1,
        cursor: isDragging ? 'grabbing' : 'grab',
        // `manipulation` (not `none`): a plain finger swipe scrolls the grid; the TouchSensor's
        // 200ms delay constraint still lets a deliberate press-and-hold start a reorder drag.
        // `none` here meant swiping over a card scrolled nothing — the page felt frozen.
        touchAction: 'manipulation',
      }}
      {...attributes}
      {...listeners}
    >
      <SKUCard sku={sku} role={role} onEdit={onEdit} onCardClick={onCardClick} onEditImage={onEditImage} isDuplicateLink={isDuplicateLink} priority={priority} />
    </div>
  )
}

export default memo(SortableCard)
