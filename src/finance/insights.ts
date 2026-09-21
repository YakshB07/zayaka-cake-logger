import type { CakeOrder, FinanceData } from '../types'
import {
  breakEven,
  categoryBreakdown,
  customerStats,
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
  /** the point, in one sentence */
  text: string
  /** the bit that makes it useful — context, or what to do about it */
  detail?: string
}

const money = (n: number) =>
  `$${Math.round(Math.abs(n)).toLocaleString('en-CA')}`
/** Cents only when they actually say something — "$175", not "$175.00". */
const exact = (n: number) => {
  const v = Math.abs(n)
  return Math.round(v * 100) % 100 === 0
    ? `$${Math.round(v).toLocaleString('en-CA')}`
    : `$${v.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
const pct = (n: number) => `${Math.round(n * 100)}%`
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

const DAY_NAMES: Record<string, string> = {
  Sun: 'Sundays',
  Mon: 'Mondays',
  Tue: 'Tuesdays',
  Wed: 'Wednesdays',
  Thu: 'Thursdays',
  Fri: 'Fridays',
  Sat: 'Saturdays',
}

/**
 * Turns the numbers into things a person would actually say out loud.
 *
 * Two rules when adding to this:
 *   · vary the sentence shape. A screen of identical "X — Y" lines reads like
 *     a machine and stops being read at all.
 *   · never state a figure the data can't support. The classic trap is a 100%
 *     margin because no costs have been logged yet — say that plainly instead
 *     of reporting it as a triumph.
 */
export function buildInsights(orders: CakeOrder[], fin: FinanceData, range: Range): Insight[] {
  const out: Insight[] = []
  const s = summarise(orders, fin, range)
  const months = Math.max(1, monthsInRange(range).length)
  const hasCosts = s.totalCosts > 0

  if (s.revenue === 0 && s.totalCosts === 0) {
    return [
      {
        tone: 'info',
        text: "There's nothing logged for this stretch yet, so there's nothing to report.",
        detail:
          'Log a few cakes and add what you spend under Costs below — the moment there are numbers in here, this fills up.',
      },
    ]
  }

  // ── the headline ──────────────────────────────────────────────────────────
  if (s.revenue > 0 && !hasCosts) {
    // The important one. Reporting a 100% margin here would be nonsense.
    out.push({
      tone: 'watch',
      text: `You've taken ${money(s.revenue)} from ${plural(s.orderCount, 'cake', 'cakes')}, but you haven't logged a single cost yet — so the profit above is really just your sales.`,
      detail:
        'Nothing has been subtracted because nothing has been entered. Add your grocery runs and your fixed bills below and this turns into a number you can actually trust.',
    })
  } else if (s.profit > 0) {
    out.push({
      tone: 'good',
      text: `A good stretch. ${money(s.revenue)} came in, ${money(s.totalCosts)} went back out, and you kept ${money(s.profit)}.`,
      detail: `That's ${pct(s.margin)} of every dollar staying with you${
        s.orderCount > 0 ? `, or about ${exact(s.profit / s.orderCount)} per cake once everything's paid for` : ''
      }.`,
    })
  } else if (s.profit < 0) {
    out.push({
      tone: 'watch',
      text: `You spent ${money(-s.profit)} more than you brought in over this stretch.`,
      detail: `${money(s.revenue)} of sales against ${money(s.totalCosts)} of costs — ${money(s.variableCosts)} of that was day-to-day spending and ${money(s.fixedCosts)} was fixed bills.`,
    })
  } else {
    out.push({
      tone: 'info',
      text: `You came out exactly even — ${money(s.revenue)} in, the same back out.`,
    })
  }

  // ── how it compares to last time ──────────────────────────────────────────
  const prevRange = previousRange(range)
  const prev = summarise(orders, fin, prevRange)
  if (prev.revenue > 0 && s.revenue > 0) {
    const change = (s.revenue - prev.revenue) / prev.revenue
    const cakeChange = s.orderCount - prev.orderCount
    if (change >= 0.05) {
      out.push({
        tone: 'good',
        text: `Business is picking up. You're ${pct(change)} ahead of the ${money(prev.revenue)} you did the ${prevRange.label}.`,
        detail:
          cakeChange === 0
            ? `Same number of cakes, but they're worth more each — your average went from ${exact(prev.avgOrder)} to ${exact(s.avgOrder)}.`
            : `That's ${cakeChange > 0 ? `${plural(cakeChange, 'more cake', 'more cakes')}` : `${plural(-cakeChange, 'fewer cake', 'fewer cakes')}`} than last time, averaging ${exact(s.avgOrder)} each.`,
      })
    } else if (change <= -0.05) {
      out.push({
        tone: 'watch',
        text: `Quieter than last time. Sales are down ${pct(-change)} from the ${money(prev.revenue)} you did before.`,
        detail:
          cakeChange < 0
            ? `${plural(-cakeChange, 'cake', 'cakes')} fewer went out. If it's seasonal that's normal — worth a look at the same months last year.`
            : `You sold about the same number of cakes, so the drop is in what they're going for.`,
      })
    }
  }

  // ── where the money goes ──────────────────────────────────────────────────
  const cats = categoryBreakdown(fin, range)
  if (cats.length && s.revenue > 0) {
    const top = cats[0]
    const share = top.total / s.revenue
    const perCake = s.orderCount > 0 ? top.total / s.orderCount : 0
    const runnerUp =
      cats.length > 1 ? ` After that it's ${cats[1].name.toLowerCase()} at ${money(cats[1].total)}.` : ''

    if (share > 1) {
      // Costs have overtaken sales entirely — a percentage here just confuses.
      out.push({
        tone: 'watch',
        // phrased to avoid verb agreement — category names can be singular
        // ("Rent") or plural ("Fixed bills") and this has to read right for both
        text: `More goes out on ${top.name.toLowerCase()} than you take in altogether: ${money(top.total)} against ${money(s.revenue)} of sales.`,
        detail: `That works out at ${exact(perCake)} for every cake that went out the door.${runnerUp}`,
      })
    } else if (share > 0.5) {
      out.push({
        tone: 'watch',
        text: `More than half of everything you sell is going straight back out on ${top.name.toLowerCase()} — ${money(top.total)} of your ${money(s.revenue)}.`,
        detail: `That's ${pct(share)} of your sales${
          perCake > 0 ? `, or roughly ${exact(perCake)} per cake` : ''
        }.${runnerUp}`,
      })
    } else {
      out.push({
        tone: 'info',
        text: `Most of your spending goes on ${top.name.toLowerCase()}: ${money(top.total)} this stretch.`,
        detail: `That's ${pct(share)} of your sales${
          perCake > 0 ? `, or roughly ${exact(perCake)} for every cake you make` : ''
        }.${runnerUp}`,
      })
    }
  }

  // ── break-even ────────────────────────────────────────────────────────────
  const be = breakEven(orders, fin, range)
  if (be.cakesNeeded !== null) {
    const perMonth = s.orderCount / months
    const clear = perMonth >= be.cakesNeeded
    out.push({
      tone: clear ? 'good' : 'watch',
      text: clear
        ? `You're comfortably past your break-even point, selling about ${perMonth.toFixed(1)} cakes a month against the ${be.cakesNeeded} you need.`
        : `You need around ${be.cakesNeeded} cakes a month to cover your fixed bills, and you're averaging ${perMonth.toFixed(1)}.`,
      detail: clear
        ? `Everything past cake number ${be.cakesNeeded} each month is really yours — that's roughly ${money((perMonth - be.cakesNeeded) * be.contributionPerCake)} a month of genuine profit.`
        : `Every cake puts about ${exact(be.contributionPerCake)} towards the bills once the ingredients are paid for, and you've got ${money(be.monthlyFixed)} a month to cover. ${Math.ceil(be.cakesNeeded - perMonth)} more a month would do it.`,
    })
  }

  // ── best and worst months ─────────────────────────────────────────────────
  const series = monthlySeries(orders, fin, monthsInRange(range))
  const earning = series.filter((m) => m.revenue > 0)
  if (earning.length >= 2) {
    const best = earning.reduce((a, b) => (b.revenue > a.revenue ? b : a))
    const worst = earning.reduce((a, b) => (b.revenue < a.revenue ? b : a))
    const ratio = worst.revenue > 0 ? best.revenue / worst.revenue : 0
    out.push({
      tone: 'info',
      text:
        ratio >= 2
          ? `${best.longLabel} was far and away your best month, at ${money(best.revenue)} from ${plural(best.orders, 'cake', 'cakes')}.`
          : `${best.longLabel} was your strongest month, at ${money(best.revenue)} from ${plural(best.orders, 'cake', 'cakes')}.`,
      detail:
        ratio >= 2
          ? `Your quietest was ${worst.longLabel} on ${money(worst.revenue)} — ${ratio.toFixed(1)} times the difference. Worth knowing which months to plan around.`
          : `${worst.longLabel} was the quietest at ${money(worst.revenue)}, so your months are fairly steady — easier to plan for than most bakeries get.`,
    })
  }

  // ── what sells ────────────────────────────────────────────────────────────
  const flavours = flavourStats(orders, fin, range)
  if (flavours.length >= 2 && flavours[0].revenue > 0) {
    const f = flavours[0]
    const share = s.orderRevenue > 0 ? f.revenue / s.orderRevenue : 0
    const second = flavours[1]
    out.push({
      tone: 'info',
      text: `${f.name} is your money-maker. ${plural(f.orders, 'cake', 'cakes')} at an average of ${exact(f.avgPrice)} brought in ${money(f.revenue)}.`,
      detail: `That's ${pct(share)} of everything your cakes earned${
        second.revenue > 0 ? `, ahead of ${second.name.toLowerCase()} on ${money(second.revenue)}` : ''
      }.${f.avgPrice > s.avgOrder ? ' It also sells for more than your average cake, which is a good sign.' : ''}`,
    })
  }

  // ── the shape of a week ───────────────────────────────────────────────────
  const days = weekdayStats(orders, range).filter((d) => d.orders > 0)
  if (days.length >= 3 && s.orderCount >= 5) {
    const busiest = days.reduce((a, b) => (b.orders > a.orders ? b : a))
    const dayName = DAY_NAMES[busiest.label]
    const before = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const prevDay = before[(before.indexOf(busiest.label) + 6) % 7]
    out.push({
      tone: 'info',
      text: `${dayName} are when most cakes leave — ${busiest.orders} of your ${s.orderCount} went out on one.`,
      detail: `That's ${money(busiest.revenue)} worth. Keeping ${DAY_NAMES[prevDay].replace(/s$/, '')} evenings clear for baking would take the pressure off.`,
    })
  }

  // ── the people ────────────────────────────────────────────────────────────
  const customers = customerStats(orders, range)
  const repeat = customers.filter((c) => c.orders > 1)
  if (customers.length >= 3) {
    const repeatRevenue = repeat.reduce((sum, c) => sum + c.revenue, 0)
    if (repeat.length > 0) {
      const allOfThem = repeat.length === customers.length
      out.push({
        tone: 'good',
        text: allOfThem
          ? `Every one of your ${customers.length} customers has come back for another cake, which is rare.`
          : `${repeat.length} of your ${customers.length} customers have come back for another cake.`,
        detail: `Between them they're ${pct(repeatRevenue / Math.max(1, s.orderRevenue))} of your cake sales. ${customers[0].name} is your best, with ${plural(customers[0].orders, 'cake', 'cakes')} worth ${money(customers[0].revenue)}.`,
      })
    } else {
      out.push({
        tone: 'watch',
        text: `Every one of your ${customers.length} customers so far has only ordered once.`,
        detail:
          'Repeat customers are the cheapest sales there are. A text a couple of weeks before a birthday you already know about tends to work.',
      })
    }
  }

  // ── money sitting out there ───────────────────────────────────────────────
  if (s.overdue > 0) {
    out.push({
      tone: 'watch',
      text: `${money(s.overdue)} is owed on cakes that have already been collected.`,
      detail: `That money is yours, it just hasn't arrived${
        s.dueAtPickup > 0 ? `, and a further ${money(s.dueAtPickup)} is due at upcoming pickups` : ''
      }. A short, friendly text with the amount usually sorts it out.`,
    })
  } else if (s.dueAtPickup > 0) {
    out.push({
      tone: 'info',
      text: `${money(s.dueAtPickup)} is still to come in, due when the upcoming cakes are collected.`,
      detail:
        'Nothing is late — this is just the balance left after deposits. Tap "Mark paid" on a cake once the money is in your hands.',
    })
  }

  if (s.bookedAhead > 0) {
    out.push({
      tone: 'good',
      text: `${money(s.bookedAhead)} is already booked in for cakes you haven't baked yet.`,
      detail: `That's ${plural(s.bookedAheadCount, 'cake', 'cakes')} with a pickup date still to come. It isn't counted in the figures above, because the money hasn't reached you yet — it'll appear the day each cake is collected.`,
    })
  }

  // ── nudges about what's missing, so the numbers can be trusted ────────────
  if (fin.fixedCosts.length === 0 && s.revenue > 0) {
    out.push({
      tone: 'watch',
      text: "You haven't set up any fixed bills yet — rent, insurance, your website, your phone.",
      detail:
        'These are the costs you pay whether you sell one cake or fifty, and until they\'re in here every profit figure on this page is flattering you. It only takes a minute under Fixed bills below.',
    })
  }


  const unpriced = orders.filter(
    (o) => o.pickupDate >= range.from && o.pickupDate <= range.to && !o.price
  )
  if (unpriced.length > 0) {
    out.push({
      tone: 'watch',
      text: `${plural(unpriced.length, 'cake has', 'cakes have')} no price on the order, so ${unpriced.length === 1 ? "it isn't" : "they aren't"} counted in any of this.`,
      detail: `${unpriced.length === 1 ? 'It was for' : 'They were for'} ${unpriced
        .slice(0, 3)
        .map((o) => o.customerName)
        .join(', ')}${unpriced.length > 3 ? ` and ${unpriced.length - 3} more` : ''}. Adding the price fixes the totals everywhere.`,
    })
  }

  return out
}
