// Client-side checks from the PRD: max 5 MB, PDF/PNG/JPG only, max 10 files.
// Images are resized to max 2000 px and re-encoded as JPEG ~80% before upload.
export const MAX_MB = 5
export const MAX_FILES = 10
const OK = ['application/pdf', 'image/png', 'image/jpeg']

export async function prepareFile(file) {
  if (!OK.includes(file.type)) throw new Error(`${file.name}: only PDF, PNG and JPG are accepted`)
  if (file.type === 'application/pdf') {
    if (file.size > MAX_MB * 1024 * 1024) throw new Error(`${file.name}: PDFs must be under ${MAX_MB} MB`)
    return file
  }
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height))
  // Small screenshots are already fine; keep PNG text crisp for OCR.
  if (scale === 1 && file.size < 1.5 * 1024 * 1024) return file
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.8))
  if (blob.size > MAX_MB * 1024 * 1024) throw new Error(`${file.name}: still over ${MAX_MB} MB after compression`)
  return new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' })
}

export function guessTag(name) {
  const n = name.toLowerCase()
  if (/track|shipment|awb|courier/.test(n)) return 'Tracking'
  if (/invoice|receipt|bill/.test(n)) return 'Invoice'
  if (/chat|whatsapp|message|conversation/.test(n)) return 'Chat'
  if (/photo|door|pod|delivery/.test(n)) return 'Delivery photo'
  if (/order/.test(n)) return 'Order'
  return 'Other'
}
