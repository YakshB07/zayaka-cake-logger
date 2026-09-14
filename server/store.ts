import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'
import type { CakeOrder, NewOrder } from '../src/types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const DATA_DIR = path.join(__dirname, 'data')
export const UPLOADS_DIR = path.join(__dirname, 'uploads')
const DB_FILE = path.join(DATA_DIR, 'orders.json')

for (const dir of [DATA_DIR, UPLOADS_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

// ── Postgres backend (used when DATABASE_URL is set, e.g. on Render/Supabase) ──
// Falls back to a local JSON file when it isn't, so `npm run dev` needs no setup.

let pgReady: Promise<void> | null = null

async function getPool() {
  const { Pool } = await import('pg')
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  })
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
  }
  await pgReady
  return pool
}

function rowToOrder(row: { id: string; created_at: Date; data: Record<string, unknown> }): CakeOrder {
  return { ...(row.data as CakeOrder), id: row.id, createdAt: row.created_at.toISOString() }
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
    const id = crypto.randomUUID()
    const createdAt = new Date()
    const data = { ...input, remindersSent: {} }
    await pool.query('insert into orders (id, created_at, data) values ($1, $2, $3)', [id, createdAt, data])
    return { ...(data as NewOrder & { remindersSent: {} }), id, createdAt: createdAt.toISOString() }
  },
  async updateOrder(id: string, patch: Partial<CakeOrder>): Promise<CakeOrder | undefined> {
    const pool = await getPool()
    const existing = await pgStore.getOrder(id)
    if (!existing) return undefined
    const { id: _id, createdAt: _c, ...rest } = patch
    const merged = { ...existing, ...rest }
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
      for (const url of existing.imageUrls) await deleteUploadedFile(url)
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
    const order: CakeOrder = {
      ...input,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
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
    db.orders[idx] = { ...db.orders[idx], ...rest }
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
      for (const url of o.imageUrls) {
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
