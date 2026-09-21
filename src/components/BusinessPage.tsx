import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  CakeOrder,
  CostCategory,
  Expense,
  FinanceData,
  FixedCost,
  NewExpense,
  NewFixedCost,
  NewOtherIncome,
  OtherIncome,
  Settings,
} from '../types'
import { DEFAULT_SETTINGS } from '../types'
import { api } from '../api'
import {
  activeYears,
  addMonths,
  allTimeRange,
  breakEven,
  categoryBreakdown,
  flavourStats,
  fixedCostBreakdown,
  monthLabel,
  monthRange,
  monthlySeries,
  monthsInRange,
  yearlySeries,
  presetRange,
  previousRange,
  sizeStats,
  summarise,
  weekdayStats,
  yearRange,
  type Range,
} from '../finance/analytics'
import { buildInsights } from '../finance/insights'
import { exportMonth, exportRange, exportYear } from '../finance/csv'
import { categorical, roles } from '../finance/palette'
import {
  ChartFrame,
  GroupedColumns,
  Meter,
  ProfitColumns,
  RankedBars,
  Sparkline,
  fmtMoney,
  useColorScheme,
} from './charts'
import { CostsPanel, STARTER_CATEGORIES } from './finance/CostsPanel'
import { BackupCard, GoalsCard, TaxCard } from './finance/GoalsTaxPanel'
import { ExpenseSheet, FixedCostSheet, IncomeSheet } from './finance/FinanceSheets'
import { todayYmd } from '../dates'

const EMPTY: FinanceData = { fixedCosts: [], categories: [], expenses: [], income: [], settings: [] }

const PRESETS = [
  { value: 'thisMonth', label: 'This month' },
  { value: 'last3', label: '3 months' },
  { value: 'last12', label: '12 months' },
  { value: 'thisYear', label: 'This year' },
  { value: 'all', label: 'All time' },
]

type Sheet =
  | { kind: 'expense'; item?: Expense }
  | { kind: 'fixed'; item?: FixedCost }
  | { kind: 'income'; item?: OtherIncome }
  | null

export function BusinessPage({
  orders,
  onToast,
  onOrdersChanged,
}: {
  orders: CakeOrder[]
  onToast: (m: string) => void
  /** reload the app's order list — a restore can add cakes, not just costs */
  onOrdersChanged: () => Promise<void>
}) {
  const mode = useColorScheme()
  const c = roles(mode)

  const [fin, setFin] = useState<FinanceData>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [preset, setPreset] = useState('thisYear')
  const [customMonth, setCustomMonth] = useState('')
  const [customYear, setCustomYear] = useState('')
  const [sheet, setSheet] = useState<Sheet>(null)

  const [loadError, setLoadError] = useState('')

  const refresh = useCallback(async () => {
    try {
      setFin(await api.loadFinance())
      setLoadError('')
    } catch (err) {
      // Every figure on this page is derived from `fin`. Swallowing the error
      // left it as EMPTY, so a failed load rendered a complete dashboard of
      // zeroes — which reads as "the business made nothing", not "try again".
      setLoadError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // ── the period being looked at ──
  const range: Range = useMemo(() => {
    if (customMonth) return monthRange(customMonth)
    if (customYear) return yearRange(Number(customYear))
    return presetRange(preset, orders, fin)
  }, [preset, customMonth, customYear, orders, fin])

  const months = useMemo(() => monthsInRange(range), [range])
  // Past three years, monthly bars get too thin to read — roll up to years.
  const byYear = months.length > 36
  const series = useMemo(
    () => (byYear ? yearlySeries(orders, fin, months) : monthlySeries(orders, fin, months)),
    [orders, fin, months, byYear]
  )
  const summary = useMemo(() => summarise(orders, fin, range), [orders, fin, range])
  const prevSummary = useMemo(
    () => summarise(orders, fin, previousRange(range)),
    [orders, fin, range]
  )
  const insights = useMemo(() => buildInsights(orders, fin, range), [orders, fin, range])
  const be = useMemo(() => breakEven(orders, fin, range), [orders, fin, range])
  const costSlices = useMemo(() => categoryBreakdown(fin, range), [fin, range])
  const fixedSlices = useMemo(() => fixedCostBreakdown(fin, range), [fin, range])
  const flavours = useMemo(() => flavourStats(orders, fin, range), [orders, fin, range])
  const sizes = useMemo(() => sizeStats(orders, fin, range), [orders, fin, range])
  const weekdays = useMemo(() => weekdayStats(orders, range), [orders, range])
  const years = useMemo(() => activeYears(orders, fin), [orders, fin])

  // ── saving ──
  const save = async (fn: () => Promise<unknown>, msg: string) => {
    // deliberately not caught: the sheet that called this shows the message
    // inline, next to the form the owner is still looking at
    await fn()
    await refresh()
    onToast(msg)
    setSheet(null)
  }

  /** For buttons with nowhere to put an inline error — say it in the toast. */
  const tryAction = async (fn: () => Promise<unknown>) => {
    try {
      await fn()
    } catch (err) {
      onToast(`Didn't work — ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Settings live as a single row; create it the first time something is saved.
  const settings = fin.settings[0]

  const saveSettings = async (patch: Partial<Settings>) => {
    if (settings) await api.updateFinance('settings', settings.id, patch)
    else await api.createFinance('settings', { ...DEFAULT_SETTINGS, ...patch })
    await refresh()
  }

  const createCategory = async (name: string): Promise<CostCategory> => {
    const created = await api.createFinance('categories', { name, archived: false })
    setFin((f) => ({ ...f, categories: [...f.categories, created as CostCategory] }))
    return created as CostCategory
  }

  const addStarters = () =>
    tryAction(async () => {
      for (const name of STARTER_CATEGORIES) {
        await api.createFinance('categories', { name, archived: false })
      }
      await refresh()
      onToast('Categories added — rename any of them ✓')
    })

  const deleteCategory = async (cat: CostCategory) => {
    if (!window.confirm(`Delete the "${cat.name}" category?`)) return
    await tryAction(async () => {
      await api.deleteFinance('categories', cat.id)
      await refresh()
    })
  }

  // ── derived display bits ──
  const revenueDelta =
    prevSummary.revenue > 0 ? (summary.revenue - prevSummary.revenue) / prevSummary.revenue : null
  const profitDelta = summary.profit - prevSummary.profit
  const cakesPerMonth = summary.orderCount / Math.max(1, months.length)

  const costRows = costSlices.slice(0, 8).map((s, i) => ({
    id: s.id,
    name: s.name,
    value: s.total,
    color: s.id === '__fixed__' ? c.neutral : categorical(mode, i),
    note: `${Math.round(s.share * 100)}% of all costs · ${s.count} ${s.count === 1 ? 'entry' : 'entries'}`,
  }))

  const flavourRows = flavours.slice(0, 8).map((f) => ({
    id: f.name,
    name: f.name,
    value: f.revenue,
    color: c.revenue,
    note: `${f.orders} ${f.orders === 1 ? 'cake' : 'cakes'} · ${fmtMoney(f.avgPrice)} average${
      f.profit !== null ? ` · ${fmtMoney(f.profit)} profit` : ''
    }`,
  }))

  // per-cake profit needs logged spending to divide up
  const hasCakeCosts = summary.variableCosts > 0 && summary.orderCount > 0

  if (loading) return <p className="empty">Loading your numbers…</p>

  if (loadError)
    return (
      <div className="empty">
        <span className="empty-mark" aria-hidden="true">
          ⚠
        </span>
        <p>
          Couldn't load your numbers — {loadError}.
          <br />
          Nothing has been lost. These figures live on the server, so they'll be back as soon as it
          answers.
        </p>
        <button className="btn btn-primary" onClick={() => void refresh()}>
          Try again
        </button>
      </div>
    )

  return (
    <div className="business">
      {/* ── period picker ── */}
      <div className="period-bar">
        <div className="segmented seg-wide" role="tablist" aria-label="Time period">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              role="tab"
              aria-selected={!customMonth && !customYear && preset === p.value}
              className={!customMonth && !customYear && preset === p.value ? 'seg-active' : ''}
              onClick={() => {
                setPreset(p.value)
                setCustomMonth('')
                setCustomYear('')
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="period-picks">
          <label className="pick">
            <span>Month</span>
            {/* a select, not <input type="month"> — an empty month input renders
                as "---------, ----" on a phone and looks broken */}
            <select
              value={customMonth}
              onChange={(e) => {
                setCustomMonth(e.target.value)
                setCustomYear('')
              }}
            >
              <option value="">—</option>
              {Array.from({ length: 24 }, (_, i) => addMonths(todayYmd().slice(0, 7), -i)).map((ym) => (
                <option key={ym} value={ym}>
                  {monthLabel(ym, true)}
                </option>
              ))}
            </select>
          </label>
          <label className="pick">
            <span>Year</span>
            <select
              value={customYear}
              onChange={(e) => {
                setCustomYear(e.target.value)
                setCustomMonth('')
              }}
            >
              <option value="">—</option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* ── the one number that matters ── */}
      <section className="hero-card">
        <p className="hero-label">
          {summary.totalCosts === 0 && summary.revenue > 0
            ? 'Money in'
            : summary.profit >= 0
              ? 'Profit'
              : 'Loss'}{' '}
          · {range.label}
        </p>
        <p className={`hero-figure ${summary.profit < 0 ? 'is-loss' : ''}`}>{fmtMoney(summary.profit)}</p>
        <p className="hero-meta">
          {summary.totalCosts === 0 && summary.revenue > 0
            ? "no costs logged yet, so this isn't profit"
            : `${fmtMoney(summary.revenue)} came in, ${fmtMoney(summary.totalCosts)} went out`}
          {prevSummary.revenue > 0 && (
            <>
              {' · '}
              <span className={profitDelta >= 0 ? 'delta-up' : 'delta-down'}>
                {profitDelta >= 0 ? '▲' : '▼'} {fmtMoney(Math.abs(profitDelta))} vs the period before
              </span>
            </>
          )}
        </p>
        {series.length > 2 && (
          <div className="hero-spark">
            <Sparkline values={series.map((s) => s.profit)} color={c.profit} width={160} height={38} />
          </div>
        )}
      </section>

      {/* ── KPI row ── */}
      <div className="kpi-row">
        <Stat
          label="Money in"
          value={fmtMoney(summary.revenue)}
          sub={
            summary.otherIncome > 0
              ? `${fmtMoney(summary.orderRevenue)} cakes + ${fmtMoney(summary.otherIncome)} other`
              : `from ${summary.orderCount} ${summary.orderCount === 1 ? 'cake' : 'cakes'} up to today`
          }
          delta={revenueDelta}
          deltaGoodWhenUp
        />
        {summary.bookedAhead > 0 && (
          <Stat
            label="Booked ahead"
            value={fmtMoney(summary.bookedAhead)}
            sub={`${summary.bookedAheadCount} ${
              summary.bookedAheadCount === 1 ? 'cake' : 'cakes'
            } still to bake — not counted as money in yet`}
          />
        )}
        <Stat
          label="Money out"
          value={fmtMoney(summary.totalCosts)}
          sub={`${fmtMoney(summary.variableCosts)} spending + ${fmtMoney(summary.fixedCosts)} fixed bills`}
        />
        <Stat
          label="Profit margin"
          /* A 100% margin only ever means "no costs entered". Showing it as a
             real figure flatters the owner and hides the thing to fix. */
          value={summary.totalCosts === 0 ? '—' : `${Math.round(summary.margin * 100)}%`}
          sub={
            summary.totalCosts === 0
              ? summary.revenue > 0
                ? 'add your costs below to see this'
                : 'no sales yet'
              : `${fmtMoney(summary.profit / Math.max(1, summary.orderCount))} kept per cake`
          }
          tone={summary.totalCosts === 0 && summary.revenue > 0 ? 'watch' : undefined}
        />
        <Stat
          label="Average cake"
          value={summary.orderCount ? fmtMoney(summary.avgOrder) : '—'}
          sub={`${summary.orderCount} sold · ${cakesPerMonth.toFixed(1)}/month`}
        />
        <Stat
          label="Still to collect"
          value={fmtMoney(summary.outstanding)}
          sub={
            summary.outstanding === 0
              ? 'all settled up'
              : summary.overdue > 0
                ? `${fmtMoney(summary.dueAtPickup)} at upcoming pickups · ${fmtMoney(summary.overdue)} overdue`
                : `balances due when these cakes are collected`
          }
          tone={summary.overdue > 0 ? 'watch' : undefined}
        />
      </div>

      {/* ── insights ── */}
      <section className="insight-card">
        <h2 className="section-label">What the numbers are telling you</h2>
        <ul className="insights">
          {insights.map((ins, i) => (
            <li key={i} className={`insight insight-${ins.tone}`}>
              <span className="insight-mark" aria-hidden="true">
                {ins.tone === 'good' ? '✓' : ins.tone === 'watch' ? '!' : '·'}
              </span>
              <span className="insight-body">
                <span className="insight-text">{ins.text}</span>
                {ins.detail && <span className="insight-detail">{ins.detail}</span>}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* ── goals ── */}
      <GoalsCard
        orders={orders}
        fin={fin}
        range={range}
        settings={settings}
        onSave={saveSettings}
        colors={{ profit: c.profit, costs: c.costs, revenue: c.revenue }}
      />

      {/* ── charts ── */}
      <div className="chart-grid">
        <ChartFrame
          title="Money in vs money out"
          subtitle={byYear ? 'Every year in this period, side by side' : 'Every month in this period, side by side'}
          series={[
            { key: 'rev', label: 'Money in', color: c.revenue },
            { key: 'cost', label: 'Money out', color: c.costs },
          ]}
          empty={series.every((s) => s.revenue === 0 && s.costs === 0)}
          emptyNote="No money has moved in this period yet."
          table={{
            head: [byYear ? 'Year' : 'Month', 'Money in', 'Money out', 'Profit'],
            rows: series.map((s) => [s.longLabel, fmtMoney(s.revenue), fmtMoney(s.costs), fmtMoney(s.profit)]),
          }}
        >
          <GroupedColumns
            data={series.map((s) => ({ label: s.label, longLabel: s.longLabel, values: [s.revenue, s.costs] }))}
            series={[
              { key: 'rev', label: 'Money in', color: c.revenue },
              { key: 'cost', label: 'Money out', color: c.costs },
            ]}
          />
        </ChartFrame>

        <ChartFrame
          title={byYear ? 'Profit, year by year' : 'Profit, month by month'}
          subtitle="Above the line is money kept; below it is money lost"
          empty={series.every((s) => s.profit === 0)}
          emptyNote="Not enough logged yet to show a profit trend."
          table={{
            head: [byYear ? 'Year' : 'Month', 'Profit', 'Cakes'],
            rows: series.map((s) => [s.longLabel, fmtMoney(s.profit), s.orders]),
          }}
        >
          <ProfitColumns
            data={series.map((s) => ({
              label: s.label,
              longLabel: s.longLabel,
              value: s.profit,
              orders: s.orders,
            }))}
            positive={c.profit}
            negative={c.loss}
          />
        </ChartFrame>

        <ChartFrame
          title="Where the money goes"
          subtitle="Your biggest costs first"
          empty={costRows.length === 0}
          emptyNote="No costs logged for this period. Add your spending and fixed bills below."
          table={{
            head: ['Cost', 'Total', 'Share of costs'],
            rows: costSlices.map((s) => [s.name, fmtMoney(s.total), `${Math.round(s.share * 100)}%`]),
          }}
        >
          <RankedBars rows={costRows} />
        </ChartFrame>

        <ChartFrame
          title="What earns you the most"
          subtitle="Flavours ranked by the money they brought in"
          empty={flavourRows.length === 0}
          emptyNote="No cakes with prices in this period yet."
          table={{
            head: ['Flavour', 'Cakes', 'Revenue', 'Average price'],
            rows: flavours.map((f) => [f.name, f.orders, fmtMoney(f.revenue), fmtMoney(f.avgPrice)]),
          }}
        >
          <RankedBars rows={flavourRows} />
        </ChartFrame>

        {/* Fixed bills are one lumped slice in the chart above — here they're
            broken out one by one, which is where the savings usually hide. */}
        {fixedSlices.length > 0 && (
          <ChartFrame
            title="Your fixed bills, one by one"
            subtitle={`What each one costs you across ${range.label.toLowerCase()}`}
            empty={false}
            table={{
              head: ['Bill', 'Total for period', 'Share of all costs'],
              rows: fixedSlices.map((f) => [f.name, fmtMoney(f.total), `${Math.round(f.share * 100)}%`]),
            }}
          >
            <RankedBars
              rows={fixedSlices.slice(0, 8).map((f, i) => ({
                id: f.id,
                name: f.name,
                value: f.total,
                color: categorical(mode, i),
                note: `${Math.round(f.share * 100)}% of all costs`,
              }))}
            />
          </ChartFrame>
        )}
      </div>

      {/* ── break-even ── */}
      <section className="breakeven-card">
        <h2 className="section-label">Your break-even point</h2>
        {be.cakesNeeded === null ? (
          <p className="hint">
            Add your fixed bills and make sure your cakes have prices on them, and this will work out
            exactly how many cakes a month you need to sell before you start making money.
          </p>
        ) : (
          <>
            <p className="be-headline">
              You need <strong>{be.cakesNeeded} cakes a month</strong> to cover your fixed bills. You're
              averaging <strong>{cakesPerMonth.toFixed(1)}</strong>.
            </p>
            <Meter
              value={cakesPerMonth}
              target={be.cakesNeeded}
              color={cakesPerMonth >= be.cakesNeeded ? c.profit : c.costs}
            />
            <dl className="be-grid">
              <div>
                <dt>Fixed bills each month</dt>
                <dd>{fmtMoney(be.monthlyFixed)}</dd>
              </div>
              <div>
                <dt>Average cake price</dt>
                <dd>{fmtMoney(be.avgPrice)}</dd>
              </div>
              <div>
                <dt>Ingredients per cake</dt>
                <dd>{fmtMoney(be.avgVariablePerCake)}</dd>
              </div>
              <div>
                <dt>You keep, per cake</dt>
                <dd>{fmtMoney(be.contributionPerCake)}</dd>
              </div>
            </dl>
            <p className="hint">
              That's {fmtMoney(be.revenueNeeded ?? 0)} of sales a month before a single dollar is
              actually yours.
            </p>
          </>
        )}
      </section>

      {/* ── per-cake profitability, only once there's something to show ── */}
      {hasCakeCosts && (
        <section className="panel">
          <header className="panel-head">
            <h2 className="section-label">Profit per cake</h2>
          </header>
          <p className="hint">
            An estimate: your {fmtMoney(summary.variableCosts)} of logged spending spread evenly
            across the {summary.orderCount} cakes you sold, so about{' '}
            <strong>{fmtMoney(summary.costPerCake)} a cake</strong>. It ignores rent and other fixed
            bills, so it answers "is this cake worth baking?" rather than what your bottom line is.
          </p>
          <div className="chart-table-wrap">
            <table className="chart-table">
              <thead>
                <tr>
                  <th scope="col">Size</th>
                  <th scope="col">Cakes</th>
                  <th scope="col">Revenue</th>
                  <th scope="col">Est. cost</th>
                  <th scope="col">Profit</th>
                  <th scope="col">Margin</th>
                </tr>
              </thead>
              <tbody>
                {sizes.map((s) => (
                  <tr key={s.name}>
                    <td>{s.name}</td>
                    <td>{s.orders}</td>
                    <td>{fmtMoney(s.revenue)}</td>
                    <td>{s.cost ? fmtMoney(s.cost) : '—'}</td>
                    <td>{s.profit === null ? '—' : fmtMoney(s.profit)}</td>
                    <td>
                      {s.profit === null || s.revenue === 0
                        ? '—'
                        : `${Math.round((s.profit / s.revenue) * 100)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── busiest days ── */}
      {summary.orderCount >= 3 && (
        <ChartFrame
          title="Your busiest pickup days"
          subtitle="Handy for planning your baking week"
          empty={false}
          table={{
            head: ['Day', 'Cakes', 'Revenue'],
            rows: weekdays.map((d) => [d.label, d.orders, fmtMoney(d.revenue)]),
          }}
        >
          <RankedBars
            rows={weekdays.map((d) => ({
              id: d.label,
              name: d.label,
              value: d.orders,
              color: c.revenue,
              note: d.orders > 0 ? fmtMoney(d.revenue) : 'nothing yet',
            }))}
            valueLabel={(v) => `${v} ${v === 1 ? 'cake' : 'cakes'}`}
          />
        </ChartFrame>
      )}

      {/* ── cost management ── */}
      <CostsPanel
        fin={fin}
        orders={orders}
        range={range}
        mode={mode}
        onAddFixed={() => setSheet({ kind: 'fixed' })}
        onEditFixed={(item) => setSheet({ kind: 'fixed', item })}
        onAddExpense={() => setSheet({ kind: 'expense' })}
        onEditExpense={(item) => setSheet({ kind: 'expense', item })}
        onAddIncome={() => setSheet({ kind: 'income' })}
        onEditIncome={(item) => setSheet({ kind: 'income', item })}
        onRenameCategory={async (cat, name) => {
          await api.updateFinance('categories', cat.id, { name })
          await refresh()
        }}
        onArchiveCategory={async (cat, archived) => {
          await api.updateFinance('categories', cat.id, { archived })
          await refresh()
        }}
        onDeleteCategory={deleteCategory}
        onAddStarters={addStarters}
      />

      {/* ── tax ── */}
      <TaxCard orders={orders} fin={fin} range={range} settings={settings} onSave={saveSettings} />

      {/* ── export ── */}
      <section className="export-card">
        <h2 className="section-label">Take your numbers with you</h2>
        <p className="hint">
          Every export is a spreadsheet file that opens straight in Excel, Numbers or Google Sheets —
          summary, month-by-month, costs, every cake and every expense, all in one file. Perfect for tax
          time or your accountant.
        </p>
        <div className="export-rows">
          <div className="export-row">
            <span>What you're looking at now</span>
            <button className="btn btn-tint" onClick={() => exportRange(orders, fin, range)}>
              Export {range.label}
            </button>
          </div>
          <div className="export-row">
            <span>A single month</span>
            <div className="export-inline">
              <select
                aria-label="Month to export"
                defaultValue={addMonths(todayYmd().slice(0, 7), 0)}
                id="export-month"
              >
                {Array.from({ length: 24 }, (_, i) => addMonths(todayYmd().slice(0, 7), -i)).map((ym) => (
                  <option key={ym} value={ym}>
                    {monthLabel(ym, true)}
                  </option>
                ))}
              </select>
              <button
                className="btn btn-tint"
                onClick={() => {
                  const el = document.getElementById('export-month') as HTMLSelectElement | null
                  if (el) exportMonth(orders, fin, el.value)
                }}
              >
                Export month
              </button>
            </div>
          </div>
          <div className="export-row">
            <span>A full year</span>
            <div className="export-inline">
              <select aria-label="Year to export" defaultValue={years[0]} id="export-year">
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              <button
                className="btn btn-tint"
                onClick={() => {
                  const el = document.getElementById('export-year') as HTMLSelectElement | null
                  if (el) exportYear(orders, fin, Number(el.value))
                }}
              >
                Export year
              </button>
            </div>
          </div>
          <div className="export-row">
            <span>Absolutely everything</span>
            <button className="btn btn-tint" onClick={() => exportRange(orders, fin, allTimeRange(orders, fin))}>
              Export all time
            </button>
          </div>
        </div>
      </section>

      <BackupCard
        orders={orders}
        fin={fin}
        onDone={async () => {
          // a restore brings back cakes as well as costs, and the list it
          // de-duplicates against has to be the refreshed one
          await Promise.all([refresh(), onOrdersChanged()])
        }}
        onToast={onToast}
      />

      {/* ── sheets ── */}
      {sheet?.kind === 'expense' && (
        <ExpenseSheet
          initial={sheet.item}
          categories={fin.categories}
          orders={orders}
          onCreateCategory={createCategory}
          onCancel={() => setSheet(null)}
          onDelete={
            sheet.item
              ? () =>
                  void save(
                    () => api.deleteFinance('expenses', (sheet.item as Expense).id),
                    'Expense deleted'
                  )
              : undefined
          }
          onSave={async (data: NewExpense) =>
            save(
              () =>
                sheet.item
                  ? api.updateFinance('expenses', (sheet.item as Expense).id, data)
                  : api.createFinance('expenses', data),
              sheet.item ? 'Expense updated ✓' : 'Spending logged ✓'
            )
          }
        />
      )}

      {sheet?.kind === 'fixed' && (
        <FixedCostSheet
          initial={sheet.item}
          onCancel={() => setSheet(null)}
          onDelete={
            sheet.item
              ? () =>
                  void save(
                    () => api.deleteFinance('fixedCosts', (sheet.item as FixedCost).id),
                    'Bill removed'
                  )
              : undefined
          }
          onSave={async (data: NewFixedCost) =>
            save(
              () =>
                sheet.item
                  ? api.updateFinance('fixedCosts', (sheet.item as FixedCost).id, data)
                  : api.createFinance('fixedCosts', data),
              sheet.item ? 'Bill updated ✓' : 'Fixed bill added ✓'
            )
          }
        />
      )}

      {sheet?.kind === 'income' && (
        <IncomeSheet
          initial={sheet.item}
          onCancel={() => setSheet(null)}
          onDelete={
            sheet.item
              ? () =>
                  void save(
                    () => api.deleteFinance('income', (sheet.item as OtherIncome).id),
                    'Income deleted'
                  )
              : undefined
          }
          onSave={async (data: NewOtherIncome) =>
            save(
              () =>
                sheet.item
                  ? api.updateFinance('income', (sheet.item as OtherIncome).id, data)
                  : api.createFinance('income', data),
              sheet.item ? 'Income updated ✓' : 'Income logged ✓'
            )
          }
        />
      )}
    </div>
  )
}

// ── stat tile ────────────────────────────────────────────────────────────────

function Stat({
  label,
  value,
  sub,
  delta,
  deltaGoodWhenUp,
  tone,
}: {
  label: string
  value: string
  sub?: string
  delta?: number | null
  deltaGoodWhenUp?: boolean
  tone?: 'ok' | 'watch'
}) {
  return (
    <div className={`stat ${tone ? `stat-${tone}` : ''}`}>
      <p className="stat-label">{label}</p>
      <p className="stat-value">{value}</p>
      {delta != null && Math.abs(delta) >= 0.005 && (
        <p className={`stat-delta ${(delta > 0) === Boolean(deltaGoodWhenUp) ? 'delta-up' : 'delta-down'}`}>
          {delta > 0 ? '▲' : '▼'} {Math.abs(Math.round(delta * 100))}% vs before
        </p>
      )}
      {sub && <p className="stat-sub">{sub}</p>}
    </div>
  )
}
