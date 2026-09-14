// One-time helper: copies orders + photos from the local server/data + server/uploads
// folders into Supabase (Postgres + Storage). Run after DATABASE_URL, SUPABASE_URL
// and SUPABASE_SERVICE_KEY are set in .env:
//
//   npx tsx scripts/migrate-to-supabase.ts
//
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const envFile = path.join(__dirname, '..', '.env')
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL in .env first')
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.warn('SUPABASE_URL / SUPABASE_SERVICE_KEY not set — photos will be skipped, only order data migrated.')
}

const DATA_FILE = path.join(__dirname, '..', 'server', 'data', 'orders.json')
const UPLOADS_DIR = path.join(__dirname, '..', 'server', 'uploads')

async function main() {
  const { Pool } = await import('pg')
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  await pool.query(
    `create table if not exists orders (
      id text primary key,
      created_at timestamptz not null default now(),
      data jsonb not null
    )`
  )

  if (!fs.existsSync(DATA_FILE)) {
    console.log('No local orders.json found — nothing to migrate.')
    return
  }
  const { orders } = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')) as { orders: Record<string, unknown>[] }
  console.log(`Found ${orders.length} local order(s).`)

  const canUploadPhotos = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY)
  const bucket = process.env.SUPABASE_BUCKET ?? 'cake-photos'

  for (const order of orders) {
    const id = order.id as string
    const createdAt = (order.createdAt as string) ?? new Date().toISOString()

    let imageUrls = (order.imageUrls as string[]) ?? []
    if (canUploadPhotos) {
      const newUrls: string[] = []
      for (const url of imageUrls) {
        const localPath = path.join(UPLOADS_DIR, path.basename(url))
        if (!fs.existsSync(localPath)) continue
        const buffer = fs.readFileSync(localPath)
        const name = path.basename(url)
        const res = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/${bucket}/${name}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_KEY}` },
          body: buffer,
        })
        if (res.ok) newUrls.push(`${process.env.SUPABASE_URL}/storage/v1/object/public/${bucket}/${name}`)
        else console.warn(`  photo upload failed for ${name}: ${res.status}`)
      }
      imageUrls = newUrls
    }

    const { id: _id, createdAt: _c, ...rest } = order
    await pool.query(
      `insert into orders (id, created_at, data) values ($1, $2, $3)
       on conflict (id) do update set data = excluded.data`,
      [id, createdAt, { ...rest, imageUrls }]
    )
    console.log(`  migrated ${order.customerName ?? id}`)
  }

  console.log('Done.')
  await pool.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
