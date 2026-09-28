import JSZip from 'jszip'

// Fetches by plain URL (not tied to any table's storage_path column), so
// this works for any photo source - Supabase-storage-backed images today,
// but nothing here assumes that specifically. A single selected image
// downloads directly (no zip overhead); two or more get bundled into one
// zip so the browser doesn't spawn N separate downloads at once.
// Shared by PhotoGalleryModal.jsx's own bulk download and CalloutModal.jsx's
// per-callout "Download Images" button - a plain module (not exported from
// either component file) so neither trips react-refresh's
// only-export-components rule.
export async function downloadImages(images, zipBaseName) {
  if (images.length === 1) {
    const res = await fetch(images[0].src)
    const blob = await res.blob()
    const ext = (images[0].src.split('.').pop() || 'jpg').split('?')[0].toLowerCase()
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `${zipBaseName}.${ext}`
    link.click()
    URL.revokeObjectURL(link.href)
    return
  }
  const zip = new JSZip()
  await Promise.all(images.map(async (img, i) => {
    const res = await fetch(img.src)
    const blob = await res.blob()
    const ext = (img.src.split('.').pop() || 'jpg').split('?')[0].toLowerCase()
    zip.file(`${zipBaseName}-${i + 1}.${ext}`, blob)
  }))
  const content = await zip.generateAsync({ type: 'blob' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(content)
  link.download = `${zipBaseName}.zip`
  link.click()
  URL.revokeObjectURL(link.href)
}
