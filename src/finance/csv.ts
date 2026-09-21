import type { CakeOrder, FinanceData } from '../types'
import {
  categoryBreakdown,
  flavourStats,
  fixedCostBreakdown,
  monthLabel,
  monthRange,
  monthlySeries,
  monthsInRange,
  sizeStats,
  summarise,
  yearRange,
  type Range,
} from './analytics'

/** Escape one cell for CSV — quotes doubled, anything risky wrapped. */
function cell(v: string | number): string {
  const s = String(v ?? '')
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const row = (cells: (string | number)[]) => cells.map(cell).join(',')
const n2 = (v: number) => (Math.round(v * 100) / 100).toFixed(2)

/**
 * Hands the browser a file to save. Excel and Google Sheets both need the BOM
 * to read accented names (crème, açaí) correctly.
 */
export function downloadCsv(filename: string, lines: string[]): void {
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // give the click a tick to start before the blob is reclaimed
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const catName = (fin: FinanceData, id: string) =>
  fin.categories.find((c) => c.id === id)?.name ?? 'Uncategorised'

// ── the individual sheets ────────────────────────────────────────────────────

export function ordersRows(orders: CakeOrder[], range: Range): string[] {
  const lines = [
    row([
      'Pickup date',
      'Pickup time',
      'Customer',
      'Phone',
      'Size',
      'Tiers',
      'Flavour',
      'Writing on cake',
      'Price',
      'Ingredient cost',
      'Profit per cake',
      'Deposit',
      'Deposit method',
      'Balance',
      'Balance paid',
      'Balance method',
      'Status',
      'Notes',
    ]),
  ]
  for (const o of orders.filter((o) => o.pickupDate >= range.from && o.pickupDate <= range.to)) {
    const price = Number(o.price) || 0
    const cost = Number(o.cakeCost) || 0
    const deposit = Number(o.depositAmount) || 0
    lines.push(
      row([
        o.pickupDate,
        o.pickupTime,
        o.customerName,
        o.customerPhone,
        o.size,
        o.tierCount,
        o.flavour,
        o.cakeText,
        n2(price),
        cost ? n2(cost) : '',
        cost ? n2(price - cost) : '',
        n2(deposit),
        o.depositMethod,
        n2(Math.max(0, price - deposit)),
        o.balancePaid ? 'yes' : 'no',
        o.balanceMethod,
        o.status,
        o.designNotes,
      ])
    )
  }
  return lines
}

export function expenseRows(fin: FinanceData, range: Range): string[] {
  const lines = [row(['Date', 'Category', 'Amount', 'Paid to', 'Note'])]
  for (const e of fin.expenses
    .filter((e) => e.date >= range.from && e.date <= range.to)
    .sort((a, b) => a.date.localeCompare(b.date))) {
    lines.push(row([e.date, catName(fin, e.categoryId), n2(Number(e.amount) || 0), e.vendor, e.note]))
  }
  return lines
}

export function incomeRows(fin: FinanceData, range: Range): string[] {
  const lines = [row(['Date', 'Source', 'Amount', 'Note'])]
  for (const i of fin.income
    .filter((i) => i.date >= range.from && i.date <= range.to)
    .sort((a, b) => a.date.localeCompare(b.date))) {
    lines.push(row([i.date, i.source, n2(Number(i.amount) || 0), i.note]))
  }
  return lines
}

export function monthlyRows(orders: CakeOrder[], fin: FinanceData, range: Range): string[] {
  const months = monthlySeries(orders, fin, monthsInRange(range))
  const lines = [
    row([
      'Month',
      'Cakes sold',
      'Revenue',
      'Variable costs',
      'Fixed costs',
      'Total costs',
      'Profit',
      'Profit margin %',
    ]),
  ]
  for (const m of months) {
    lines.push(
      row([
        m.longLabel,
        m.orders,
        n2(m.revenue),
        n2(m.variableCosts),
        n2(m.fixedCosts),
        n2(m.costs),
        n2(m.profit),
        m.revenue > 0 ? n2((m.profit / m.revenue) * 100) : '',
      ])
    )
  }
  const t = summarise(orders, fin, range)
  lines.push(
    row([
      'TOTAL',
      t.orderCount,
      n2(t.revenue),
      n2(t.variableCosts),
      n2(t.fixedCosts),
      n2(t.totalCosts),
      n2(t.profit),
      t.revenue > 0 ? n2(t.margin * 100) : '',
    ])
  )
  return lines
}

// ── the full report: every sheet stacked into one file, with headings ────────

export function fullReportLines(orders: CakeOrder[], fin: FinanceData, range: Range, title: string): string[] {
  const s = summarise(orders, fin, range)
  const lines: string[] = []
  const section = (heading: string, rows: string[]) => {
    lines.push('', row([heading.toUpperCase()]), ...rows)
  }

  lines.push(row([`Zayaka Bakes n' Bites — ${title}`]))
  lines.push(row([`${range.from} to ${range.to}`]))
  lines.push(row([`Generated ${new Date().toLocaleString('en-CA')}`]))

  section('Summary', [
    row(['Cake sales', n2(s.orderRevenue)]),
    row(['Other income', n2(s.otherIncome)]),
    row(['Total revenue', n2(s.revenue)]),
    row(['Variable costs (logged expenses)', n2(s.variableCosts)]),
    row(['Fixed costs', n2(s.fixedCosts)]),
    row(['Total costs', n2(s.totalCosts)]),
    row(['PROFIT', n2(s.profit)]),
    row(['Profit margin %', s.revenue > 0 ? n2(s.margin * 100) : '']),
    row(['Cakes sold', s.orderCount]),
    row(['Average per cake', n2(s.avgOrder)]),
    row(['Still owed to you', n2(s.outstanding)]),
  ])

  section('Month by month', monthlyRows(orders, fin, range))

  const cats = categoryBreakdown(fin, range)
  section('Where the money went', [
    row(['Cost', 'Total', 'Share of all costs %', 'Number of entries']),
    ...cats.map((c) => row([c.name, n2(c.total), n2(c.share * 100), c.count])),
  ])

  const fixed = fixedCostBreakdown(fin, range)
  if (fixed.length) {
    section('Fixed bills', [
      row(['Bill', 'Total for period', 'Share of all costs %']),
      ...fixed.map((f) => row([f.name, n2(f.total), n2(f.share * 100)])),
    ])
  }

  const flav = flavourStats(orders, range)
  if (flav.length) {
    section('By flavour', [
      row(['Flavour', 'Cakes', 'Revenue', 'Average price', 'Ingredient cost', 'Profit']),
      ...flav.map((f) =>
        row([f.name, f.orders, n2(f.revenue), n2(f.avgPrice), f.cost ? n2(f.cost) : '', f.profit === null ? '' : n2(f.profit)])
      ),
    ])
  }

  const sizes = sizeStats(orders, range)
  if (sizes.length) {
    section('By size', [
      row(['Size', 'Cakes', 'Revenue', 'Average price']),
      ...sizes.map((f) => row([f.name, f.orders, n2(f.revenue), n2(f.avgPrice)])),
    ])
  }

  section('Every cake', ordersRows(orders, range))
  section('Every expense', expenseRows(fin, range))
  if (fin.income.some((i) => i.date >= range.from && i.date <= range.to)) {
    section('Other income', incomeRows(fin, range))
  }

  return lines
}

// ── one-call exports the UI buttons use ──────────────────────────────────────

const slug = (s: string) => s.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()

export function exportMonth(orders: CakeOrder[], fin: FinanceData, ym: string): void {
  const range = monthRange(ym)
  downloadCsv(
    `zayaka-${ym}-${slug(monthLabel(ym))}.csv`,
    fullReportLines(orders, fin, range, `${monthLabel(ym, true)} report`)
  )
}

export function exportYear(orders: CakeOrder[], fin: FinanceData, year: number): void {
  const range = yearRange(year)
  downloadCsv(`zayaka-${year}-full-year.csv`, fullReportLines(orders, fin, range, `${year} year-end report`))
}

export function exportRange(orders: CakeOrder[], fin: FinanceData, range: Range): void {
  downloadCsv(
    `zayaka-${range.from}-to-${range.to}.csv`,
    fullReportLines(orders, fin, range, `${range.label} report`)
  )
}
