import { useState } from 'react'
import { createPortal } from 'react-dom'
import { downloadImages } from '../../lib/downloadImages'

function Spinner() {
  return (
    <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )
}

// Generic multi-select photo gallery with bulk download - reached from a
// "+N" overflow tile elsewhere (see CalloutModal.jsx's PhotoStrip), as a
// different affordance from ImageLightbox's single-image pager: here the
// point is picking a subset (or everything) to save, not just viewing one
// at a time. Takes the same plain `images: [{ key, src }]` shape
// PhotoStrip already builds, so no caller needs a second data mapping.
export default function PhotoGalleryModal({ images, title, zipBaseName, onClose }) {
  const [selected, setSelected] = useState(() => new Set())
  const [downloading, setDownloading] = useState(false)

  const toggle = (key) => setSelected(prev => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })
  const allSelected = images.length > 0 && selected.size === images.length

  const handleDownload = async (imgs) => {
    setDownloading(true)
    try {
      await downloadImages(imgs, zipBaseName || 'photos')
    } finally {
      setDownloading(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[280] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-3xl h-[85vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="min-w-0">
            <div className="text-sm font-bold text-gray-900 truncate">{title || 'Photos'}</div>
            <div className="text-xs text-gray-500 mt-0.5">
              {images.length} photo{images.length !== 1 ? 's' : ''}
              {selected.size > 0 && <span className="font-semibold text-gray-700"> · {selected.size} selected</span>}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button type="button" onClick={() => setSelected(allSelected ? new Set() : new Set(images.map(img => img.key)))}
              className="text-xs font-semibold text-gray-600 hover:text-gray-900 px-2.5 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors">
              {allSelected ? 'Clear' : 'Select All'}
            </button>
            <button type="button" onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors cursor-pointer">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* Grid */}
        <div className="overflow-y-auto px-5 py-4 flex-1">
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
            {images.map(img => {
              const isSelected = selected.has(img.key)
              return (
                <div key={img.key} onClick={() => toggle(img.key)}
                  className={`relative aspect-square rounded-lg overflow-hidden border cursor-pointer transition-colors
                    ${isSelected ? 'border-gray-900 ring-2 ring-gray-900' : 'border-gray-200'}`}>
                  <img src={img.src} alt="" className="w-full h-full object-cover" />
                  <span className={`absolute top-1.5 left-1.5 w-5 h-5 rounded-full border-2 flex items-center justify-center
                    ${isSelected ? 'bg-gray-900 border-gray-900' : 'bg-white/80 border-gray-300'}`}>
                    {isSelected && <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><path d="M20 6L9 17l-5-5" /></svg>}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100">
          <button type="button" onClick={() => handleDownload([...selected].map(key => images.find(img => img.key === key)))}
            disabled={selected.size === 0 || downloading}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40 transition-colors">
            {downloading && <Spinner />}
            Download Selected {selected.size > 0 ? `(${selected.size})` : ''}
          </button>
          <button type="button" onClick={() => handleDownload(images)}
            disabled={images.length === 0 || downloading}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-900 text-xs font-semibold text-white hover:bg-gray-700 disabled:opacity-40 transition-colors">
            {downloading && <Spinner />}
            Download All
          </button>
        </div>

      </div>
    </div>,
    document.body
  )
}
