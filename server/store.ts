import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'
import type { CakeOrder, NewOrder } from '../src/types'
import { normalizeOrder } from '../src/normalize.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const DATA_DIR = path.join(__dirname, 'data')
export const UPLOADS_DIR = path.join(__dirname, 'uploads')
const DB_FILE = path.join(DATA_DIR, 'orders.json')

// Vercel's filesystem is read-only outside /tmp, and unused there anyway
// once DATABASE_URL + Supabase Storage are configured.
if (!process.env.VERCEL) {
  for (const dir of [DATA_DIR, UPLOADS_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  }
}

// ── Postgres backend (used when DATABASE_URL is set, e.g. on Render/Supabase) ──
// Falls back to a local JSON file when it isn't, so `npm run dev` needs no setup.

let pgReady: Promise<void> | null = null
// One pool for the life of the process. This used to build a fresh Pool on
// every call — and createOrder/deleteOrder call it twice each — so every
// request opened new connections that were never released, walking straight
// into Supabase's connection limit under any real use.
let pgPool: Awaited<ReturnType<typeof makePool>> | null = null

async function makePool() {
  const { Pool } = await import('pg')
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  })
  pool.on('error', (err) => console.error('[pg] idle client error', err.message))
  return pool
}

/*
 * Two things that only show up against a real hosted database:
 *
 *  - If this first query fails, the rejected promise used to stay cached in
 *    `pgReady` forever, so every later request rejected with the same stale
 *    error. One blip while Supabase was waking up bricked the server until
 *    someone redeployed it. Clearing it on failure lets the next request retry.
 *  - A pool with no 'error' listener turns a dropped idle connection into an
 *    unhandled 'error' event, which takes the whole process down. Supabase
 *    closes idle connections routinely, so this is a matter of when.
 */
async function getPool() {
  const pool = (pgPool ??= await makePool())
  if (!pgReady) {
    pgReady = pool
      .query(
        `create table if not exists orders (
          id text primary key,
          created_at timestamptz not null default now(),
          data jsonb not null
        )`
      )
      .then(() => undefined)
      .catch((err) => {
        pgReady = null
        throw err
      })
  }
  await pgReady
  return pool
}

function rowToOrder(row: { id: string; created_at: Date; data: Record<string, unknown> }): CakeOrder {
  // normalised on the way out too: a row written by an older version can be
  // missing fields the reminder job reads without a guard.
  return normalizeOrder({ ...row.data, id: row.id, createdAt: row.created_at.toISOString() })
}

const pgStore = {
  async listOrders(): Promise<CakeOrder[]> {
    const pool = await getPool()
    const { rows } = await pool.query('select id, created_at, data from orders order by created_at asc')
    return rows.map(rowToOrder)
  },
  async getOrder(id: string): Promise<CakeOrder | undefined> {
    const pool = await getPool()
    const { rows } = await pool.query('select id, created_at, data from orders where id = $1', [id])
    return rows[0] ? rowToOrder(rows[0]) : undefined
  },
  async createOrder(input: NewOrder): Promise<CakeOrder> {
    const pool = await getPool()
    // never store a half-formed record — one bad row used to blank the whole app
    const { id: wantId, createdAt: wantAt, ...clean } = normalizeOrder(input)
    // A restore replays records that already have an id. Keeping it is what
    // makes restoring the same file twice a no-op instead of a duplicate.
    const free = wantId ? !(await pgStore.getOrder(wantId)) : false
    const id = wantId && free ? wantId : crypto.randomUUID()
    const createdAt = wantAt ? new Date(wantAt) : new Date()
    const data = { ...clean, remindersSent: {} }
    await pool.query('insert into orders (id, created_at, data) values ($1, $2, $3)', [id, createdAt, data])
    return { ...(data as NewOrder & { remindersSent: {} }), id, createdAt: createdAt.toISOString() }
  },
  async updateOrder(id: string, patch: Partial<CakeOrder>): Promise<CakeOrder | undefined> {
    const pool = await getPool()
    const existing = await pgStore.getOrder(id)
    if (!existing) return undefined
    const { id: _id, createdAt: _c, ...rest } = patch
    const merged = normalizeOrder({ ...existing, ...rest })
    const { id: mid, createdAt: mCreatedAt, ...data } = merged
    await pool.query('update orders set data = $2 where id = $1', [id, data])
    return merged
  },
  async deleteOrder(id: string): Promise<boolean> {
    const pool = await getPool()
    const existing = await pgStore.getOrder(id)
    const { rowCount } = await pool.query('delete from orders where id = $1', [id])
    if (existing) {
      const { deleteUploadedFile } = await import('./storage.ts')
      for (const url of existing.imageUrls ?? []) await deleteUploadedFile(url)
    }
    return (rowCount ?? 0) > 0
  },
}

// ── Local JSON file backend (dev / no DATABASE_URL) ──

interface Db {
  orders: CakeOrder[]
}

function load(): Db {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8')) as Db
  } catch {
    return { orders: [] }
  }
}

function save(db: Db): void {
  const tmp = DB_FILE + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2))
  fs.renameSync(tmp, DB_FILE)
}

const fileStore = {
  async listOrders(): Promise<CakeOrder[]> {
    return load().orders
  },
  async getOrder(id: string): Promise<CakeOrder | undefined> {
    return load().orders.find((o) => o.id === id)
  },
  async createOrder(input: NewOrder): Promise<CakeOrder> {
    const db = load()
    const clean = normalizeOrder(input)
    // keep a restored record's own id/date so re-running a restore adds nothing
    const free = clean.id ? !db.orders.some((o) => o.id === clean.id) : false
    const order: CakeOrder = {
      ...clean,
      id: clean.id && free ? clean.id : crypto.randomUUID(),
      createdAt: clean.createdAt || new Date().toISOString(),
      remindersSent: {},
    }
    db.orders.push(order)
    save(db)
    return order
  },
  async updateOrder(id: string, patch: Partial<CakeOrder>): Promise<CakeOrder | undefined> {
    const db = load()
    const idx = db.orders.findIndex((o) => o.id === id)
    if (idx === -1) return undefined
    const { id: _id, createdAt: _c, ...rest } = patch
    const prev = db.orders[idx]
    db.orders[idx] = { ...normalizeOrder({ ...prev, ...rest }), id: prev.id, createdAt: prev.createdAt }
    save(db)
    return db.orders[idx]
  },
  async deleteOrder(id: string): Promise<boolean> {
    const db = load()
    const before = db.orders.length
    const removed = db.orders.filter((o) => o.id === id)
    db.orders = db.orders.filter((o) => o.id !== id)
    save(db)
    for (const o of removed) {
      for (const url of o.imageUrls ?? []) {
        const file = path.join(UPLOADS_DIR, path.basename(url))
        if (fs.existsSync(file)) fs.unlinkSync(file)
      }
    }
    return db.orders.length < before
  },
}

const backend = process.env.DATABASE_URL ? pgStore : fileStore

export const listOrders = backend.listOrders
export const getOrder = backend.getOrder
export const createOrder = backend.createOrder
export const updateOrder = backend.updateOrder
export const deleteOrder = backend.deleteOrder
