import type { CakeOrder, FinanceData, Settings } from '../types'
import { summarise, type Range } from './analytics'

/**
 * A rough HST picture for an Ontario home bakery. This is a helper, not tax
 * advice — every figure here is an estimate to take to an accountant, and the
 * UI says so.
 *
 * Two things matter to a small bakery:
 *
 *  1. The $30,000 small-supplier threshold. Under it (over four consecutive
 *     calendar quarters) you don't have to register for or charge HST at all.
 *     Cross it and you must register, so the app warns as it gets close.
 *  2. Once registered, you owe the HST you collected on sales, minus the HST
 *     you already paid on business purchases (input tax credits).
 *
 * Most home bakeries quote an all-in price, so by default prices are treated
 * as tax-included and the tax is backed out rather than added on top.
 */

export const SMALL_SUPPLIER_THRESHOLD = 30_000

export interface TaxEstimate {
  registered: boolean
  rate: number
  /** sales in the period, however the owner quotes them */
  sales: number
  /** the part of sales that is actually tax */
  taxOnSales: number
  /** sales excluding tax — the real top line */
  salesExTax: number
  /** HST already paid on business spending, claimable back */
  inputCredits: number
  /** what would be owed to the CRA for this period */
  netOwing: number
  /** rolling 12-month sales, for the threshold check */
  rolling12: number
  thresholdShare: number
  /** '' when nothing needs saying */
  thresholdWarning: string
}

const YEAR_MS = 365 * 86_400_000

export function estimateTax(
  orders: CakeOrder[],
  fin: FinanceData,
  range: Range,
  settings: Settings | undefined
): TaxEstimate {
  const rate = settings?.hstRate ?? 0.13
  const registered = settings?.hstRegistered ?? false
  const inclusive = settings?.pricesIncludeTax ?? true

  const s = summarise(orders, fin, range)
  const sales = s.revenue

  // Tax-inclusive: the tax is already inside the price, so back it out.
  // Tax-exclusive: the tax sits on top of it.
  const taxOnSales = registered ? (inclusive ? sales - sales / (1 + rate) : sales * rate) : 0
  const salesExTax = sales - taxOnSales

  // Business purchases are almost always quoted tax-included on a receipt.
  const spend = s.variableCosts + s.fixedCosts
  const inputCredits = registered ? spend - spend / (1 + rate) : 0

  // rolling 12 months of sales, for the small-supplier threshold
  const end = new Date(range.to + 'T00:00:00')
  const start = new Date(end.getTime() - YEAR_MS)
  const pad = (n: number) => String(n).padStart(2, '0')
  const asYmd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const rolling = summarise(orders, fin, { from: asYmd(start), to: range.to, label: '12m' }).revenue

  const share = rolling / SMALL_SUPPLIER_THRESHOLD
  let warning = ''
  if (!registered) {
    if (share >= 1) {
      warning = `Your last 12 months of sales came to ${Math.round(rolling).toLocaleString('en-CA')} dollars, which is over the $30,000 small-supplier limit. You likely need to register for HST — worth asking an accountant this month.`
    } else if (share >= 0.8) {
      warning = `You're at ${Math.round(share * 100)}% of the $30,000 small-supplier limit over the last 12 months. Once you cross it you have to register for HST, so it's worth getting ahead of.`
    }
  }

  return {
    registered,
    rate,
    sales,
    taxOnSales,
    salesExTax,
    inputCredits,
    netOwing: taxOnSales - inputCredits,
    rolling12: rolling,
    thresholdShare: share,
    thresholdWarning: warning,
  }
}

/** Calendar quarters, the way HST returns are usually filed. */
export function quarterRanges(year: number): Range[] {
  return [
    { from: `${year}-01-01`, to: `${year}-03-31`, label: `Jan–Mar ${year}` },
    { from: `${year}-04-01`, to: `${year}-06-30`, label: `Apr–Jun ${year}` },
    { from: `${year}-07-01`, to: `${year}-09-30`, label: `Jul–Sep ${year}` },
    { from: `${year}-10-01`, to: `${year}-12-31`, label: `Oct–Dec ${year}` },
  ]
}
