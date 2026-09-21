import type { CakeOrder, FinanceData, FinanceKind } from '../types'
import { api } from '../api'

/**
 * Whole-business backup. Her orders, photos-links, costs and settings all live
 * on one little server — this gives her a file she owns, and a way to put it
 * back if anything ever goes wrong.
 */

export interface Backup {
  app: 'zayaka-cake-logger'
  version: 1
  exportedAt: string
  orders: CakeOrder[]
  finance: FinanceData
}

export function makeBackup(orders: CakeOrder[], finance: FinanceData): Backup {
  return {
    app: 'zayaka-cake-logger',
    version: 1,
    exportedAt: new Date().toISOString(),
    orders,
    finance,
  }
}

export function downloadBackup(orders: CakeOrder[], finance: FinanceData): void {
  const blob = new Blob([JSON.stringify(makeBackup(orders, finance), null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `zayaka-backup-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function parseBackup(text: string): Backup {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error("That file isn't readable — is it the backup file the app made?")
  }
  const b = data as Partial<Backup>
  if (b?.app !== 'zayaka-cake-logger' || !Array.isArray(b.orders) || !b.finance) {
    throw new Error("That doesn't look like a Zayaka backup file.")
  }
  return b as Backup
}

export interface RestoreResult {
  orders: number
  finance: number
  skipped: number
}

const FINANCE_KINDS: FinanceKind[] = ['categories', 'fixedCosts', 'expenses', 'income', 'settings']

/**
 * Adds everything in the backup that isn't already there, matched on id.
 * Deliberately additive — restoring never deletes anything she has now, so a
 * mistaken restore can't wipe a season of orders.
 */
export async function restoreBackup(
  backup: Backup,
  current: { orders: CakeOrder[]; finance: FinanceData },
  onProgress?: (done: number, total: number) => void
): Promise<RestoreResult> {
  const haveOrders = new Set(current.orders.map((o) => o.id))
  const haveFinance = new Set(
    FINANCE_KINDS.flatMap((k) => (current.finance[k] ?? []).map((r) => (r as { id: string }).id))
  )

  const orderJobs = backup.orders.filter((o) => !haveOrders.has(o.id))
  const financeJobs = FINANCE_KINDS.flatMap((kind) =>
    (backup.finance[kind] ?? [])
      .filter((r) => !haveFinance.has((r as { id: string }).id))
      .map((row) => ({ kind, row }))
  )

  const total = orderJobs.length + financeJobs.length
  let done = 0
  const tick = () => onProgress?.(++done, total)

  // The id and createdAt are sent through deliberately: the server keeps them
  // when they're free, which is what makes restoring the same file twice add
  // nothing the second time instead of duplicating every record.
  let orders = 0
  for (const o of orderJobs) {
    const { remindersSent: _r, ...rest } = o
    await api.createOrder(rest as unknown as Parameters<typeof api.createOrder>[0])
    orders++
    tick()
  }

  let finance = 0
  for (const job of financeJobs) {
    await api.createFinance(job.kind, job.row)
    finance++
    tick()
  }

  return {
    orders,
    finance,
    skipped: backup.orders.length + FINANCE_KINDS.reduce((s, k) => s + (backup.finance[k]?.length ?? 0), 0) - total,
  }
}
