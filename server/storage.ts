import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { UPLOADS_DIR } from './store.ts'

// ── Photo storage: Supabase Storage when configured, else local disk (dev). ──

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
const BUCKET = encodeURIComponent(process.env.SUPABASE_BUCKET ?? 'cake-photos')

const useSupabase = Boolean(SUPABASE_URL && SUPABASE_SERVICE_KEY)

/*
 * Uploads are served back from /uploads by express.static, which sets the
 * Content-Type from the file extension. The extension came straight off the
 * uploaded filename, so a file named `cake.html` (or .svg) sent with an image
 * MIME type would be served as a document on the app's own origin — stored
 * XSS. Only these extensions are ever written; anything else becomes .jpg.
 */
const SAFE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic', '.heif', '.avif'])

function filenameFor(originalname: string): string {
  const raw = path.extname(path.basename(originalname || '')).toLowerCase()
  const ext = SAFE_EXT.has(raw) ? raw : '.jpg'
  return `${Date.now()}-${crypto.randomUUID().slice(0, 8)}${ext}`
}

export interface UploadedFile {
  originalname: string
  mimetype: string
  buffer: Buffer
}

export async function saveUploadedFiles(files: UploadedFile[]): Promise<string[]> {
  if (useSupabase) {
    const urls: string[] = []
    for (const file of files) {
      const name = filenameFor(file.originalname)
      const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${name}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          apikey: SUPABASE_SERVICE_KEY!,
          'Content-Type': file.mimetype || 'application/octet-stream',
        },
        body: file.buffer,
      })
      if (!res.ok) throw new Error(`Supabase upload failed: ${res.status} ${await res.text()}`)
      urls.push(`${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${name}`)
    }
    return urls
  }

  const urls: string[] = []
  for (const file of files) {
    const name = filenameFor(file.originalname)
    fs.writeFileSync(path.join(UPLOADS_DIR, name), file.buffer)
    urls.push(`/uploads/${name}`)
  }
  return urls
}

export async function deleteUploadedFile(url: string): Promise<void> {
  if (useSupabase && url.startsWith(`${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`)) {
    const name = url.split('/').pop()
    if (!name) return
    await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${name}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, apikey: SUPABASE_SERVICE_KEY! },
    }).catch(() => undefined)
    return
  }
  const file = path.join(UPLOADS_DIR, path.basename(url))
  if (fs.existsSync(file)) fs.unlinkSync(file)
}
