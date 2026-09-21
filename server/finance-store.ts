import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'
import type { FinanceData, FinanceKind } from '../src/types'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, 'data')
const DB_FILE = path.join(DATA_DIR, 'finance.json')

export const FINANCE_KINDS: FinanceKind[] = [
  'fixedCosts',
  'categories',
  'expenses',
  'income',
  'settings',
]

export function isFinanceKind(v: string): v is FinanceKind {
  return (FINANCE_KINDS as string[]).includes(v)
}

function empty(): FinanceData {
  return { fixedCosts: [], categories: [], expenses: [], income: [], settings: [] }
}

type Row = { id: string; createdAt: string; [k: string]: unknown }

// ── Postgres backend (DATABASE_URL set — Render/Supabase) ─────────────────────
// One table for all four collections: they're small, always read together, and
// a single `kind` column keeps migrations to zero when a new one is added.

let pgReady: Promise<void> | null = null
// One pool for the life of the process — a fresh Pool per request would hold
// open a new connection each time and eventually exhaust Supabase's limit.
let pgPool: Awaited<ReturnType<typeof makePool>> | null = null

async function makePool() {
  const { Pool } = await import('pg')
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  })
}

async function getPool() {
  const pool = (pgPool ??= await makePool())
  if (!pgReady) {
    pgReady = pool
      .query(
        `create table if not exists finance (
          id text primary key,
          kind text not null,
          created_at timestamptz not null default now(),
          data jsonb not null
        );
        create index if not exists finance_kind_idx on finance (kind);`
      )
      .then(() => undefined)
  }
  await pgReady
  return pool
}

const pgStore = {
  async readAll(): Promise<FinanceData> {
    const pool = await getPool()
    const { rows } = await pool.query(
      'select id, kind, created_at, data from finance order by created_at asc'
    )
    const out = empty()
    for (const r of rows) {
      if (!isFinanceKind(r.kind)) continue
      ;(out[r.kind] as Row[]).push({ ...r.data, id: r.id, createdAt: r.created_at.toISOString() })
    }
    return out
  },
  async create(kind: FinanceKind, input: Record<string, unknown>): Promise<Row> {
    const pool = await getPool()
    const id = crypto.randomUUID()
    const createdAt = new Date()
    const { id: _i, createdAt: _c, ...data } = input
    await pool.query('insert into finance (id, kind, created_at, data) values ($1, $2, $3, $4)', [
      id,
      kind,
      createdAt,
      data,
    ])
    return { ...data, id, createdAt: createdAt.toISOString() }
  },
  async update(kind: FinanceKind, id: string, patch: Record<string, unknown>): Promise<Row | undefined> {
    const pool = await getPool()
    const { rows } = await pool.query(
      'select id, created_at, data from finance where id = $1 and kind = $2',
      [id, kind]
    )
    if (!rows[0]) return undefined
    const { id: _i, createdAt: _c, ...rest } = patch
    const data = { ...rows[0].data, ...rest }
    await pool.query('update finance set data = $3 where id = $1 and kind = $2', [id, kind, data])
    return { ...data, id, createdAt: rows[0].created_at.toISOString() }
  },
  async remove(kind: FinanceKind, id: string): Promise<boolean> {
    const pool = await getPool()
    const { rowCount } = await pool.query('delete from finance where id = $1 and kind = $2', [id, kind])
    return (rowCount ?? 0) > 0
  },
}

// ── Local JSON file backend (dev / no DATABASE_URL) ───────────────────────────

function load(): FinanceData {
  try {
    return { ...empty(), ...(JSON.parse(fs.readFileSync(DB_FILE, 'utf-8')) as FinanceData) }
  } catch {
    return empty()
  }
}

function save(db: FinanceData): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
  const tmp = DB_FILE + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2))
  fs.renameSync(tmp, DB_FILE)
}

const fileStore = {
  async readAll(): Promise<FinanceData> {
    return load()
  },
  async create(kind: FinanceKind, input: Record<string, unknown>): Promise<Row> {
    const db = load()
    const { id: _i, createdAt: _c, ...data } = input
    const row: Row = { ...data, id: crypto.randomUUID(), createdAt: new Date().toISOString() }
    ;(db[kind] as Row[]).push(row)
    save(db)
    return row
  },
  async update(kind: FinanceKind, id: string, patch: Record<string, unknown>): Promise<Row | undefined> {
    const db = load()
    const list = db[kind] as Row[]
    const idx = list.findIndex((r) => r.id === id)
    if (idx === -1) return undefined
    const { id: _i, createdAt: _c, ...rest } = patch
    list[idx] = { ...list[idx], ...rest }
    save(db)
    return list[idx]
  },
  async remove(kind: FinanceKind, id: string): Promise<boolean> {
    const db = load()
    const list = db[kind] as Row[]
    const before = list.length
    ;(db[kind] as Row[]) = list.filter((r) => r.id !== id)
    save(db)
    return (db[kind] as Row[]).length < before
  },
}

const backend = process.env.DATABASE_URL ? pgStore : fileStore

export const readFinance = backend.readAll
export const createFinanceItem = backend.create
export const updateFinanceItem = backend.update
export const deleteFinanceItem = backend.remove
