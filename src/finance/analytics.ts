import type { CakeOrder, CostCategory, FinanceData, FixedCost } from '../types'

/* ══════════════════════════════════════════════════════════════════════════
   How the money maths works — the two rules everything else follows:

   1. A cake counts as REVENUE on its PICKUP DATE, at its full price.
      That's when the cake leaves the shop and the money is settled, so a
      month's revenue matches what actually came in that month.

   2. PROFIT = revenue − (logged expenses + fixed costs).
      The per-cake "ingredient cost" field is deliberately NOT added on top —
      the grocery run logged as an expense is the same money, and counting
      both would double it. Per-cake cost drives its own separate view
      (profit per cake, per flavour) and a cross-check figure.
   ══════════════════════════════════════════════════════════════════════════ */

export interface Range {
  from: string // YYYY-MM-DD inclusive
  to: string // YYYY-MM-DD inclusive
  label: string
}

export interface Summary {
  revenue: number
  orderRevenue: number
  otherIncome: number
  variableCosts: number
  fixedCosts: number
  totalCosts: number
  profit: number
  margin: number // 0–1
  orderCount: number
  avgOrder: number
  /** average day-to-day spending per cake sold — variableCosts / orderCount */
  costPerCake: number
  /** everything not yet in your hands: dueAtPickup + overdue */
  outstanding: number
  /** balances on cakes that haven't been collected yet */
  dueAtPickup: number
  /** balances on cakes already collected — genuinely late */
  overdue: number
  /** value of cakes booked for after today — not income yet */
  bookedAhead: number
  bookedAheadCount: number
}

export interface MonthStat {
  ym: string // YYYY-MM
  label: string // 'Mar'
  longLabel: string // 'March 2026'
  revenue: number
  costs: number
  variableCosts: number
  fixedCosts: number
  profit: number
  orders: number
}

export interface CategorySlice {
  id: string
  name: string
  total: number
  share: number // 0–1 of total costs
  count: number
}

export interface ProductStat {
  name: string
  orders: number
  revenue: number
  avgPrice: number
  cost: number
  profit: number | null // null when no ingredient costs were entered
}

// ── date helpers ─────────────────────────────────────────────────────────────

export const ymOf = (ymd: string): string => (ymd || '').slice(0, 7)

export function daysInMonth(ym: string): number {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}

export function monthLabel(ym: string, long = false): string {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-CA', {
    month: long ? 'long' : 'short',
    ...(long ? { year: 'numeric' } : {}),
  })
}

export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** every YYYY-MM the range touches, in order */
export function monthsInRange(range: Range): string[] {
  const out: string[] = []
  let cur = ymOf(range.from)
  const last = ymOf(range.to)
  // guard so a malformed range can never spin forever
  for (let i = 0; i < 600 && cur && cur <= last; i++) {
    out.push(cur)
    cur = addMonths(cur, 1)
  }
  return out
}

const inRange = (ymd: string, r: Range) => Boolean(ymd) && ymd >= r.from && ymd <= r.to

// ── fixed costs ──────────────────────────────────────────────────────────────

/** What a bill costs for one whole month, whatever cadence it's paid on. */
export function monthlyAmount(fc: FixedCost): number {
  const amt = Number(fc.amount) || 0
  if (fc.cadence === 'weekly') return (amt * 52) / 12
  if (fc.cadence === 'quarterly') return amt / 3
  if (fc.cadence === 'yearly') return amt / 12
  return amt
}

function activeInMonth(fc: FixedCost, ym: string): boolean {
  if (fc.startMonth && ym < fc.startMonth) return false
  if (fc.endMonth && ym > fc.endMonth) return false
  return true
}

/** Total fixed cost for one calendar month. */
export function fixedCostsForMonth(fixed: FixedCost[], ym: string): number {
  return fixed.reduce((sum, fc) => (activeInMonth(fc, ym) ? sum + monthlyAmount(fc) : sum), 0)
}

/**
 * Fixed cost across an arbitrary range, pro-rated by day for the part-months at
 * each end — so "Mar 15 → Apr 14" charges half of each month's rent rather than
 * two whole months of it.
 */
export function fixedCostsForRange(fixed: FixedCost[], range: Range): number {
  let total = 0
  for (const ym of monthsInRange(range)) {
    const dim = daysInMonth(ym)
    const monthStart = `${ym}-01`
    const monthEnd = `${ym}-${String(dim).padStart(2, '0')}`
    const from = range.from > monthStart ? range.from : monthStart
    const to = range.to < monthEnd ? range.to : monthEnd
    const days = Number(to.slice(8)) - Number(from.slice(8)) + 1
    if (days <= 0) continue
    total += fixedCostsForMonth(fixed, ym) * (days / dim)
  }
  return total
}

// ── the main summary ─────────────────────────────────────────────────────────

export function summarise(orders: CakeOrder[], fin: FinanceData, range: Range): Summary {
  const inOrders = orders.filter((o) => inRange(o.pickupDate, range))
  const orderRevenue = inOrders.reduce((s, o) => s + (Number(o.price) || 0), 0)
  const otherIncome = fin.income
    .filter((i) => inRange(i.date, range))
    .reduce((s, i) => s + (Number(i.amount) || 0), 0)
  const variableCosts = fin.expenses
    .filter((e) => inRange(e.date, range))
    .reduce((s, e) => s + (Number(e.amount) || 0), 0)
  const fixedCosts = fixedCostsForRange(fin.fixedCosts, range)

  const revenue = orderRevenue + otherIncome
  const totalCosts = variableCosts + fixedCosts
  const profit = revenue - totalCosts


  /*
   * Money not yet collected. Counting only picked-up-and-unpaid cakes was
   * wrong twice over: it ignored the balances due on every cake still to be
   * collected (usually most of what she's owed), and marking a cake picked up
   * used to force balancePaid = true, so that combination barely existed.
   * Split it instead — what's coming at pickup, and what's genuinely late.
   */
  const balanceOf = (o: CakeOrder) =>
    o.balancePaid ? 0 : Math.max(0, (Number(o.price) || 0) - (Number(o.depositAmount) || 0))

  const dueAtPickup = orders
    .filter((o) => o.status !== 'completed')
    .reduce((sum, o) => sum + balanceOf(o), 0)

  const overdue = orders
    .filter((o) => o.status === 'completed')
    .reduce((sum, o) => sum + balanceOf(o), 0)

  const outstanding = dueAtPickup + overdue

  // work that's on the books but hasn't happened yet
  const today = ymd(new Date())
  const ahead = orders.filter((o) => o.pickupDate > today && o.status !== 'completed')
  const bookedAhead = ahead.reduce((sum, o) => sum + (Number(o.price) || 0), 0)

  return {
    revenue,
    orderRevenue,
    otherIncome,
    variableCosts,
    fixedCosts,
    totalCosts,
    profit,
    margin: revenue > 0 ? profit / revenue : 0,
    orderCount: inOrders.length,
    avgOrder: inOrders.length ? orderRevenue / inOrders.length : 0,
    costPerCake: inOrders.length ? variableCosts / inOrders.length : 0,
    outstanding,
    dueAtPickup,
    overdue,
    bookedAhead,
    bookedAheadCount: ahead.length,
  }
}

// ── monthly series (feeds the charts) ────────────────────────────────────────

export function monthlySeries(orders: CakeOrder[], fin: FinanceData, months: string[]): MonthStat[] {
  return months.map((ym) => {
    const os = orders.filter((o) => ymOf(o.pickupDate) === ym)
    const revenue =
      os.reduce((s, o) => s + (Number(o.price) || 0), 0) +
      fin.income.filter((i) => ymOf(i.date) === ym).reduce((s, i) => s + (Number(i.amount) || 0), 0)
    const variableCosts = fin.expenses
      .filter((e) => ymOf(e.date) === ym)
      .reduce((s, e) => s + (Number(e.amount) || 0), 0)
    const fixed = fixedCostsForMonth(fin.fixedCosts, ym)
    return {
      ym,
      label: monthLabel(ym),
      longLabel: monthLabel(ym, true),
      revenue,
      variableCosts,
      fixedCosts: fixed,
      costs: variableCosts + fixed,
      profit: revenue - variableCosts - fixed,
      orders: os.length,
    }
  })
}

/**
 * The same shape as `monthlySeries`, but one bar per year. Past a few years of
 * history, monthly bars on a phone are a pixel wide and tell you nothing — the
 * dashboard switches to this automatically.
 */
export function yearlySeries(orders: CakeOrder[], fin: FinanceData, months: string[]): MonthStat[] {
  const byYear = new Map<string, MonthStat[]>()
  for (const m of monthlySeries(orders, fin, months)) {
    const y = m.ym.slice(0, 4)
    byYear.set(y, [...(byYear.get(y) ?? []), m])
  }
  return [...byYear.entries()].map(([year, ms]) => ({
    ym: year,
    label: year,
    longLabel: year,
    revenue: ms.reduce((s, m) => s + m.revenue, 0),
    variableCosts: ms.reduce((s, m) => s + m.variableCosts, 0),
    fixedCosts: ms.reduce((s, m) => s + m.fixedCosts, 0),
    costs: ms.reduce((s, m) => s + m.costs, 0),
    profit: ms.reduce((s, m) => s + m.profit, 0),
    orders: ms.reduce((s, m) => s + m.orders, 0),
  }))
}

// ── where the money goes ─────────────────────────────────────────────────────

export function categoryBreakdown(fin: FinanceData, range: Range): CategorySlice[] {
  const byId = new Map<string, CostCategory>(fin.categories.map((c) => [c.id, c]))
  const totals = new Map<string, { total: number; count: number }>()
  for (const e of fin.expenses) {
    if (!inRange(e.date, range)) continue
    const key = byId.has(e.categoryId) ? e.categoryId : 'uncategorised'
    const cur = totals.get(key) ?? { total: 0, count: 0 }
    cur.total += Number(e.amount) || 0
    cur.count += 1
    totals.set(key, cur)
  }
  const fixedTotal = fixedCostsForRange(fin.fixedCosts, range)
  const grand = [...totals.values()].reduce((s, t) => s + t.total, 0) + fixedTotal

  const slices: CategorySlice[] = [...totals.entries()].map(([id, t]) => ({
    id,
    name: byId.get(id)?.name ?? 'Uncategorised',
    total: t.total,
    share: grand > 0 ? t.total / grand : 0,
    count: t.count,
  }))
  if (fixedTotal > 0) {
    slices.push({
      id: '__fixed__',
      name: 'Fixed bills',
      total: fixedTotal,
      share: grand > 0 ? fixedTotal / grand : 0,
      count: fin.fixedCosts.length,
    })
  }
  return slices.sort((a, b) => b.total - a.total)
}

/** Fixed bills broken out one by one, biggest first. */
export function fixedCostBreakdown(fin: FinanceData, range: Range): CategorySlice[] {
  const months = monthsInRange(range)
  const grand = fixedCostsForRange(fin.fixedCosts, range)
  return fin.fixedCosts
    .map((fc) => {
      const total = months.reduce((s, ym) => s + (activeInMonth(fc, ym) ? monthlyAmount(fc) : 0), 0)
      return { id: fc.id, name: fc.name, total, share: grand > 0 ? total / grand : 0, count: 1 }
    })
    .filter((s) => s.total > 0)
    .sort((a, b) => b.total - a.total)
}

// ── what a cake costs to make ────────────────────────────────────────────────

/*
 * Nobody can reliably say what the batter, cream and box for one specific cake
 * cost, so the app no longer asks. Instead each month's logged spending is
 * spread evenly over the cakes sold that month, which is both easier to get
 * right and closer to the truth over any sensible stretch of time.
 */

/**
 * What one cake cost to make, estimated by spreading the period's logged
 * spending evenly over the cakes sold in it.
 *
 * One rate for the whole period rather than a per-month rate, deliberately:
 * a month's rate has to fall back to something when that month has cakes but
 * no grocery run logged, and any fallback invents cost that was never spent —
 * the per-cake table would then total more than the profit-and-loss above it
 * on the same screen. A single rate always reconciles exactly. Month-level
 * detail is still there in the month-by-month chart, which uses real figures.
 */
export function costAllocator(
  orders: CakeOrder[],
  fin: FinanceData,
  range: Range
): { rateFor: (ymd: string) => number; overall: number; hasData: boolean } {
  const s = summarise(orders, fin, range)
  return {
    rateFor: () => s.costPerCake,
    overall: s.costPerCake,
    hasData: s.variableCosts > 0 && s.orderCount > 0,
  }
}

// ── what actually sells ──────────────────────────────────────────────────────

function groupProducts(
  orders: CakeOrder[],
  fin: FinanceData,
  range: Range,
  key: (o: CakeOrder) => string
): ProductStat[] {
  const alloc = costAllocator(orders, fin, range)
  const map = new Map<string, { orders: number; revenue: number; cost: number }>()
  for (const o of orders) {
    if (!inRange(o.pickupDate, range)) continue
    const name = key(o) || 'Not set'
    const cur = map.get(name) ?? { orders: 0, revenue: 0, cost: 0 }
    cur.orders += 1
    cur.revenue += Number(o.price) || 0
    cur.cost += alloc.rateFor(o.pickupDate)
    map.set(name, cur)
  }
  return [...map.entries()]
    .map(([name, v]) => ({
      name,
      orders: v.orders,
      revenue: v.revenue,
      avgPrice: v.orders ? v.revenue / v.orders : 0,
      cost: alloc.hasData ? v.cost : 0,
      // without any logged spending there's nothing to subtract, so say so
      // rather than reporting the full price as profit
      profit: alloc.hasData ? v.revenue - v.cost : null,
    }))
    .sort((a, b) => b.revenue - a.revenue)
}

export const flavourStats = (orders: CakeOrder[], fin: FinanceData, range: Range) =>
  groupProducts(orders, fin, range, (o) => o.flavour)

export const sizeStats = (orders: CakeOrder[], fin: FinanceData, range: Range) =>
  groupProducts(orders, fin, range, (o) => o.size)

/** Which weekday the cakes actually go out on. */
export function weekdayStats(orders: CakeOrder[], range: Range): { label: string; orders: number; revenue: number }[] {
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const rows = names.map((label) => ({ label, orders: 0, revenue: 0 }))
  for (const o of orders) {
    if (!inRange(o.pickupDate, range)) continue
    const [y, m, d] = o.pickupDate.split('-').map(Number)
    const wd = new Date(y, m - 1, d).getDay()
    rows[wd].orders += 1
    rows[wd].revenue += Number(o.price) || 0
  }
  return rows
}

/** Best customers by what they've spent, all time. */
export function customerStats(
  orders: CakeOrder[],
  range: Range
): { name: string; orders: number; revenue: number }[] {
  const map = new Map<string, { orders: number; revenue: number }>()
  for (const o of orders) {
    if (!inRange(o.pickupDate, range)) continue
    const name = o.customerName.trim() || 'Unnamed'
    const cur = map.get(name) ?? { orders: 0, revenue: 0 }
    cur.orders += 1
    cur.revenue += Number(o.price) || 0
    map.set(name, cur)
  }
  return [...map.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.revenue - a.revenue)
}

// ── break-even ───────────────────────────────────────────────────────────────

export interface BreakEven {
  monthlyFixed: number
  avgPrice: number
  avgVariablePerCake: number
  contributionPerCake: number
  cakesNeeded: number | null // null when it can't be worked out yet
  revenueNeeded: number | null
}

export function breakEven(orders: CakeOrder[], fin: FinanceData, range: Range): BreakEven {
  const months = monthsInRange(range)
  const monthlyFixed = months.length
    ? months.reduce((s, ym) => s + fixedCostsForMonth(fin.fixedCosts, ym), 0) / months.length
    : 0
  const s = summarise(orders, fin, range)
  const avgPrice = s.avgOrder

  // day-to-day spending spread over the cakes it produced
  const avgVariablePerCake = s.costPerCake

  const contributionPerCake = avgPrice - avgVariablePerCake
  const workable = avgPrice > 0 && contributionPerCake > 0 && monthlyFixed > 0
  const cakesNeeded = workable ? Math.ceil(monthlyFixed / contributionPerCake) : null
  return {
    monthlyFixed,
    avgPrice,
    avgVariablePerCake,
    contributionPerCake,
    cakesNeeded,
    revenueNeeded: cakesNeeded === null ? null : cakesNeeded * avgPrice,
  }
}

// ── range presets ────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/**
 * No range ever runs past today.
 *
 * A cake booked for next week hasn't been baked, collected or paid for, so it
 * isn't income yet. It also used to make the presets contradict each other:
 * "This month" ran to the 30th and counted future bookings while "3 months"
 * stopped at today and didn't — so this month could show MORE than the three
 * months containing it. Future work shows up as `bookedAhead` instead.
 */
function capToToday(r: Range): Range {
  const today = ymd(new Date())
  return r.to > today ? { ...r, to: today } : r
}

export function monthRange(ym: string): Range {
  return capToToday({
    from: `${ym}-01`,
    to: `${ym}-${pad(daysInMonth(ym))}`,
    label: monthLabel(ym, true),
  })
}

export function yearRange(year: number): Range {
  return capToToday({ from: `${year}-01-01`, to: `${year}-12-31`, label: String(year) })
}

export function presetRange(preset: string, orders: CakeOrder[], fin: FinanceData): Range {
  const now = new Date()
  const thisYm = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`
  switch (preset) {
    case 'thisMonth':
      return { ...monthRange(thisYm), label: 'This month' }
    case 'lastMonth':
      return { ...monthRange(addMonths(thisYm, -1)), label: 'Last month' }
    case 'last3':
      return { from: `${addMonths(thisYm, -2)}-01`, to: ymd(now), label: 'Last 3 months' }
    case 'last12':
      return { from: `${addMonths(thisYm, -11)}-01`, to: ymd(now), label: 'Last 12 months' }
    case 'thisYear':
      return { ...yearRange(now.getFullYear()), label: `${now.getFullYear()}` }
    case 'lastYear':
      return { ...yearRange(now.getFullYear() - 1), label: `${now.getFullYear() - 1}` }
    default:
      return allTimeRange(orders, fin)
  }
}

/** Widest range that still covers every record, so "All time" is never empty. */
export function allTimeRange(orders: CakeOrder[], fin: FinanceData): Range {
  const dates = [
    ...orders.map((o) => o.pickupDate),
    ...fin.expenses.map((e) => e.date),
    ...fin.income.map((i) => i.date),
    ...fin.fixedCosts.map((f) => (f.startMonth ? `${f.startMonth}-01` : '')),
  ].filter(Boolean)
  const today = ymd(new Date())
  if (!dates.length) return { from: `${new Date().getFullYear()}-01-01`, to: today, label: 'All time' }
  const from = dates.reduce((a, b) => (a < b ? a : b))
  return { from, to: today, label: 'All time' }
}

/**
 * The equivalent stretch of time immediately before `range`, for "vs before".
 *
 * A whole calendar month compares against the whole previous calendar month,
 * and a whole year against the previous year — matching by days instead would
 * make "last month" for May run Mar 31 → Apr 30 and quietly fold an extra
 * day's sales in. Anything else falls back to an equal span of days.
 */
export function previousRange(range: Range): Range {
  const startYm = ymOf(range.from)
  const isWholeMonth =
    range.from === `${startYm}-01` &&
    range.to === `${startYm}-${pad(daysInMonth(startYm))}` &&
    startYm === ymOf(range.to)
  if (isWholeMonth) {
    const prev = addMonths(startYm, -1)
    return { from: `${prev}-01`, to: `${prev}-${pad(daysInMonth(prev))}`, label: 'previous month' }
  }

  const year = Number(range.from.slice(0, 4))
  if (range.from === `${year}-01-01` && range.to === `${year}-12-31`) {
    return { from: `${year - 1}-01-01`, to: `${year - 1}-12-31`, label: 'previous year' }
  }

  const from = new Date(range.from + 'T00:00:00')
  const to = new Date(range.to + 'T00:00:00')
  const span = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1
  const prevTo = new Date(from.getTime() - 86_400_000)
  const prevFrom = new Date(prevTo.getTime() - (span - 1) * 86_400_000)
  return { from: ymd(prevFrom), to: ymd(prevTo), label: 'previous period' }
}

/** Every year that has any activity, newest first — powers the year exports. */
export function activeYears(orders: CakeOrder[], fin: FinanceData): number[] {
  const years = new Set<number>()
  for (const o of orders) if (o.pickupDate) years.add(Number(o.pickupDate.slice(0, 4)))
  for (const e of fin.expenses) if (e.date) years.add(Number(e.date.slice(0, 4)))
  for (const i of fin.income) if (i.date) years.add(Number(i.date.slice(0, 4)))
  years.add(new Date().getFullYear())
  return [...years].filter((y) => y > 1970).sort((a, b) => b - a)
}
