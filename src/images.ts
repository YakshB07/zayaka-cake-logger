/**
 * Shrink a photo in the browser before it's uploaded.
 *
 * A picture straight off a phone is routinely 4–12MB, and the server caps an
 * upload at 4MB (Vercel's request-body limit sits just above that). Without
 * this, photographing a reference cake — the single most obvious thing to do
 * with this feature — failed, and failed silently.
 *
 * Reference photos only ever get displayed as a thumbnail or a lightbox, so a
 * long edge of 1600px is plenty and brings a typical phone photo under 500KB.
 */

const MAX_EDGE = 1600
const QUALITY = 0.82
/** Leave headroom under the server's 4MB cap. */
export const MAX_UPLOAD_BYTES = 3.5 * 1024 * 1024

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("that file doesn't look like a photo"))
    }
    img.src = url
  })
}

/**
 * Returns a smaller version of the photo, or the original when it's already
 * small enough or can't be processed. Never throws for a resize failure — a
 * slightly-too-big upload is better than losing the photo entirely.
 */
export async function shrinkImage(file: File): Promise<File> {
  // already small and in a web-friendly format: leave it alone
  if (file.size <= 600 * 1024 && /jpeg|jpg|png|webp/i.test(file.type)) return file

  try {
    const img = await loadImage(file)
    const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight))
    const w = Math.max(1, Math.round(img.naturalWidth * scale))
    const h = Math.max(1, Math.round(img.naturalHeight * scale))

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(img, 0, 0, w, h)

    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', QUALITY))
    if (!blob || blob.size >= file.size) return file

    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg'
    return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() })
  } catch {
    return file
  }
}

export function describeSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)}MB` : `${Math.round(bytes / 1024)}KB`
}
