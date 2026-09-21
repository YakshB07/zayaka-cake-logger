import type { CakeOrder, CostCategory, Expense, FinanceData, FixedCost, OtherIncome } from './types'

/*
 * Every record is forced into the shape the app expects, on the way in and on
 * the way out.
 *
 * Without this one bad row takes the whole app down: a missing pickupDate ends
 * up as `undefined.split('-')`, React unmounts, and the screen goes blank on
 * every tab with no way back. Records can go bad from a restored backup written
 * by an older version, a hand-edited file, or anything that posts to the API
 * directly — so nothing is trusted, and a broken row degrades to a visibly
 * empty one instead of a broken app.
 */

/** Text, trimmed to a sane maximum so one absurd value can't bloat the page. */
const str = (v: unknown, max = 500): string => {
  const s = typeof v === 'string' ? v : v == null ? '' : String(v)
  return s.length > max ? s.slice(0, max) : s
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(str(v))
  return Number.isFinite(n) ? n : 0
}

const bool = (v: unknown): boolean => v === true

const strArray = (v: unknown, maxItems = 20): string[] =>
  Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, maxItems) : []

/** YYYY-MM-DD, or '' if it isn't one. Keeps every date comparison safe. */
const ymd = (v: unknown): string => {
  const s = str(v).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return ''
  // reject a well-formed impossible date ("2026-02-31") rather than let the
  // Date constructor quietly roll it into the next month
  const [y, m, d] = s.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d ? s : ''
}

/** YYYY-MM, or ''. Months outside 01–12 are not months. */

const ym = (v: unknown): string => {
  const s = str(v).slice(0, 7)
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(s) ? s : ''
}

/** HH:mm, or ''. */
const hhmm = (v: unknown): string => {
  const s = str(v).slice(0, 5)
  return /^\d{2}:\d{2}$/.test(s) ? s : ''
}

export function normalizeOrder(raw: unknown): CakeOrder {
  const o = (raw ?? {}) as Record<string, unknown>
  const tierSizes = strArray(o.tierSizes)
  const size = str(o.size, 60)
  const tierCount = Math.min(3, Math.max(1, Math.round(num(o.tierCount)) || 1))
  const method = (v: unknown) => {
    const m = str(v)
    return m === 'cash' || m === 'e-transfer' || m === 'card' ? m : ''
  }
  return {
    id: str(o.id),
    createdAt: str(o.createdAt),
    customerName: str(o.customerName, 120),
    customerPhone: str(o.customerPhone, 40),
    size: size || tierSizes.join(' + '),
    tierCount,
    tierSizes: tierSizes.length ? tierSizes : size ? [size] : [],
    flavour: str(o.flavour, 80),
    pickupDate: ymd(o.pickupDate),
    pickupTime: hhmm(o.pickupTime),
    price: num(o.price),
    depositAmount: num(o.depositAmount),
    depositMethod: method(o.depositMethod),
    balanceMethod: method(o.balanceMethod),
    balancePaid: bool(o.balancePaid),
    cakeText: str(o.cakeText, 300),
    designNotes: str(o.designNotes, 2000),
    imageUrls: strArray(o.imageUrls),
    status: str(o.status) === 'completed' ? 'completed' : 'upcoming',
    remindersSent:
      o.remindersSent && typeof o.remindersSent === 'object' && !Array.isArray(o.remindersSent)
        ? (o.remindersSent as CakeOrder['remindersSent'])
        : {},
  }
}

export const normalizeOrders = (raw: unknown): CakeOrder[] =>
  (Array.isArray(raw) ? raw : []).map(normalizeOrder)

function normalizeFixedCost(raw: unknown): FixedCost {
  const f = (raw ?? {}) as Record<string, unknown>
  const cadence = str(f.cadence)
  return {
    id: str(f.id),
    createdAt: str(f.createdAt),
    name: str(f.name, 80),
    amount: num(f.amount),
    cadence:
      cadence === 'weekly' || cadence === 'quarterly' || cadence === 'yearly' ? cadence : 'monthly',
    startMonth: ym(f.startMonth),
    endMonth: ym(f.endMonth),
    notes: str(f.notes, 500),
  }
}

function normalizeCategory(raw: unknown): CostCategory {
  const c = (raw ?? {}) as Record<string, unknown>
  return {
    id: str(c.id),
    createdAt: str(c.createdAt),
    name: str(c.name, 80),
    archived: bool(c.archived),
  }
}

function normalizeExpense(raw: unknown): Expense {
  const e = (raw ?? {}) as Record<string, unknown>
  return {
    id: str(e.id),
    createdAt: str(e.createdAt),
    date: ymd(e.date),
    categoryId: str(e.categoryId),
    amount: num(e.amount),
    vendor: str(e.vendor, 120),
    note: str(e.note, 500),
    orderId: str(e.orderId),
  }
}

function normalizeIncome(raw: unknown): OtherIncome {
  const i = (raw ?? {}) as Record<string, unknown>
  return {
    id: str(i.id),
    createdAt: str(i.createdAt),
    date: ymd(i.date),
    source: str(i.source, 120),
    amount: num(i.amount),
    note: str(i.note, 500),
  }
}

function normalizeSettings(raw: unknown) {
  const s = (raw ?? {}) as Record<string, unknown>
  const rate = num(s.hstRate)
  return {
    id: str(s.id),
    createdAt: str(s.createdAt),
    revenueGoal: Math.max(0, num(s.revenueGoal)),
    profitGoal: Math.max(0, num(s.profitGoal)),
    cakesGoal: Math.max(0, num(s.cakesGoal)),
    hstRegistered: bool(s.hstRegistered),
    // a nonsense rate would silently poison every tax figure
    hstRate: rate > 0 && rate < 1 ? rate : 0.13,
    pricesIncludeTax: s.pricesIncludeTax === undefined ? true : bool(s.pricesIncludeTax),
  }
}

export function normalizeFinance(raw: unknown): FinanceData {
  const f = (raw ?? {}) as Record<string, unknown>
  const list = (v: unknown) => (Array.isArray(v) ? v : [])
  return {
    fixedCosts: list(f.fixedCosts).map(normalizeFixedCost),
    categories: list(f.categories).map(normalizeCategory),
    expenses: list(f.expenses).map(normalizeExpense),
    income: list(f.income).map(normalizeIncome),
    settings: list(f.settings).map(normalizeSettings),
  }
}
