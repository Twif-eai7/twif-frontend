import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import SKUCard from './SKUCard'

export default function SortableCard({ sku, role, onEdit, onCardClick, onEditImage, isDuplicateLink }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sku.id })

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.45 : 1,
        cursor: isDragging ? 'grabbing' : 'grab',
        touchAction: 'none',
      }}
      {...attributes}
      {...listeners}
    >
      <SKUCard sku={sku} role={role} onEdit={onEdit} onCardClick={onCardClick} onEditImage={onEditImage} isDuplicateLink={isDuplicateLink} />
    </div>
  )
}
