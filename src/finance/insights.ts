import type { CakeOrder, FinanceData } from '../types'
import {
  breakEven,
  categoryBreakdown,
  flavourStats,
  monthlySeries,
  monthsInRange,
  previousRange,
  summarise,
  weekdayStats,
  type Range,
} from './analytics'

export interface Insight {
  /** drives the icon + colour: good news, a heads-up, or just a fact */
  tone: 'good' | 'watch' | 'info'
  text: string
}

const money = (n: number) => `$${Math.abs(n).toLocaleString('en-CA', { maximumFractionDigits: 0 })}`
const pct = (n: number) => `${Math.round(n * 100)}%`

/**
 * Turns the numbers into sentences a person can act on. Deliberately written
 * for a baker, not an accountant — no jargon, every line says what it means.
 */
export function buildInsights(orders: CakeOrder[], fin: FinanceData, range: Range): Insight[] {
  const out: Insight[] = []
  const s = summarise(orders, fin, range)

  if (s.revenue === 0 && s.totalCosts === 0) {
    return [
      {
        tone: 'info',
        text: 'Nothing logged for this stretch yet. Log a few cakes and add your costs below and the numbers will fill in.',
      },
    ]
  }

  // ── headline: are you making money ──
  if (s.revenue > 0) {
    if (s.profit > 0) {
      out.push({
        tone: 'good',
        text: `You kept ${money(s.profit)} of the ${money(s.revenue)} that came in — that's ${pct(s.margin)} of every dollar staying with you.`,
      })
    } else if (s.profit < 0) {
      out.push({
        tone: 'watch',
        text: `You spent ${money(-s.profit)} more than you brought in. Costs were ${money(s.totalCosts)} against ${money(s.revenue)} of sales.`,
      })
    } else {
      out.push({ tone: 'info', text: `You broke exactly even — ${money(s.revenue)} in, ${money(s.revenue)} out.` })
    }
  }

  // ── vs the period before ──
  const prev = summarise(orders, fin, previousRange(range))
  if (prev.revenue > 0 && s.revenue > 0) {
    const change = (s.revenue - prev.revenue) / prev.revenue
    if (Math.abs(change) >= 0.05) {
      out.push({
        tone: change > 0 ? 'good' : 'watch',
        text:
          change > 0
            ? `Sales are up ${pct(change)} on the ${money(prev.revenue)} you did the period before.`
            : `Sales are down ${pct(-change)} from ${money(prev.revenue)} the period before.`,
      })
    }
  }

  // ── biggest cost ──
  const cats = categoryBreakdown(fin, range)
  if (cats.length && s.revenue > 0) {
    const top = cats[0]
    out.push({
      tone: top.total / s.revenue > 0.5 ? 'watch' : 'info',
      text: `${top.name} is your biggest cost at ${money(top.total)} — ${pct(top.total / s.revenue)} of everything you sold.`,
    })
  }

  // ── break-even ──
  const be = breakEven(orders, fin, range)
  if (be.cakesNeeded !== null) {
    const perMonth = s.orderCount / Math.max(1, monthsInRange(range).length)
    out.push({
      tone: perMonth >= be.cakesNeeded ? 'good' : 'watch',
      text:
        perMonth >= be.cakesNeeded
          ? `You need about ${be.cakesNeeded} cakes a month to cover your fixed bills, and you're averaging ${Math.round(perMonth)} — comfortably past it.`
          : `You need about ${be.cakesNeeded} cakes a month just to cover your fixed bills. You're averaging ${Math.round(perMonth)}, so you're ${be.cakesNeeded - Math.round(perMonth)} short.`,
    })
  }

  // ── best month in the window ──
  const months = monthlySeries(orders, fin, monthsInRange(range))
  const earning = months.filter((m) => m.revenue > 0)
  if (earning.length >= 2) {
    const best = earning.reduce((a, b) => (b.revenue > a.revenue ? b : a))
    const worst = earning.reduce((a, b) => (b.revenue < a.revenue ? b : a))
    out.push({
      tone: 'info',
      text: `${best.longLabel} was your strongest month at ${money(best.revenue)}; ${worst.longLabel} was the quietest at ${money(worst.revenue)}.`,
    })
  }

  // ── best seller ──
  const flavours = flavourStats(orders, range)
  if (flavours.length >= 2 && flavours[0].revenue > 0) {
    const f = flavours[0]
    out.push({
      tone: 'info',
      text: `${f.name} earns you the most — ${f.orders} ${f.orders === 1 ? 'cake' : 'cakes'} worth ${money(f.revenue)}, averaging ${money(f.avgPrice)} each.`,
    })
  }

  // ── busiest day ──
  const days = weekdayStats(orders, range).filter((d) => d.orders > 0)
  if (days.length >= 3) {
    const busiest = days.reduce((a, b) => (b.orders > a.orders ? b : a))
    const dayNames: Record<string, string> = {
      Sun: 'Sundays',
      Mon: 'Mondays',
      Tue: 'Tuesdays',
      Wed: 'Wednesdays',
      Thu: 'Thursdays',
      Fri: 'Fridays',
      Sat: 'Saturdays',
    }
    out.push({
      tone: 'info',
      text: `${dayNames[busiest.label]} are your busiest pickup day — ${busiest.orders} of ${s.orderCount} cakes went out then.`,
    })
  }

  // ── money you're owed ──
  if (s.outstanding > 0) {
    out.push({
      tone: 'watch',
      text: `${money(s.outstanding)} is still owed to you on cakes that have already been picked up. Worth a friendly text.`,
    })
  }

  // ── data-quality nudges: say what's missing so the numbers can be trusted ──
  if (s.cakesWithCost > 0 && s.variableCosts === 0) {
    out.push({
      tone: 'watch',
      text: `You're noting ingredient cost per cake but haven't logged any actual spending, so the profit above counts none of it. Add your grocery and supply runs under Costs to make it real.`,
    })
  }
  if (s.fixedCosts === 0 && fin.fixedCosts.length === 0 && s.revenue > 0) {
    out.push({
      tone: 'watch',
      text: `No fixed bills set up yet — rent, insurance, your website. Until those are in, profit is flattering you.`,
    })
  }
  const unpriced = orders.filter((o) => o.pickupDate >= range.from && o.pickupDate <= range.to && !o.price)
  if (unpriced.length > 0) {
    out.push({
      tone: 'watch',
      text: `${unpriced.length} ${unpriced.length === 1 ? 'cake has' : 'cakes have'} no price on the order, so ${unpriced.length === 1 ? "it isn't" : "they aren't"} counted in your sales.`,
    })
  }

  return out
}
