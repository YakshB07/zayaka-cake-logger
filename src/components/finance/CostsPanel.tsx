import { useMemo, useState } from 'react'
import type { CakeOrder, CostCategory, Expense, FinanceData, FixedCost, OtherIncome } from '../../types'
import { formatDate, money } from '../../dates'
import { monthLabel, monthlyAmount, ymOf, type Range } from '../../finance/analytics'
import { categorical } from '../../finance/palette'
import type { Mode } from '../../finance/palette'

/** Sensible starting buckets for a home bakery — one tap, then rename freely. */
export const STARTER_CATEGORIES = [
  'Ingredients',
  'Packaging & boxes',
  'Decorations & toppers',
  'Gas & delivery',
  'Equipment',
  'Marketing',
  'Fees & charges',
]

const CADENCE_LABEL: Record<string, string> = {
  weekly: 'every week',
  monthly: 'every month',
  quarterly: 'every 3 months',
  yearly: 'once a year',
}

interface Props {
  fin: FinanceData
  orders: CakeOrder[]
  range: Range
  mode: Mode
  onAddFixed: () => void
  onEditFixed: (f: FixedCost) => void
  onAddExpense: () => void
  onEditExpense: (e: Expense) => void
  onAddIncome: () => void
  onEditIncome: (i: OtherIncome) => void
  onRenameCategory: (c: CostCategory, name: string) => Promise<void>
  onArchiveCategory: (c: CostCategory, archived: boolean) => Promise<void>
  onDeleteCategory: (c: CostCategory) => Promise<void>
  onAddStarters: () => Promise<void>
  /** the month the bakery started keeping books here (YYYY-MM), '' = not set */
  startMonth: string
  onStartMonth: (ym: string) => Promise<void>
}

type Tab = 'spending' | 'fixed' | 'income' | 'categories'

export function CostsPanel(props: Props) {
  const { fin, orders, range, mode } = props
  const [tab, setTab] = useState<Tab>('spending')
  const [catFilter, setCatFilter] = useState('')

  const colorOf = useMemo(() => {
    const map = new Map<string, string>()
    fin.categories.forEach((c, i) => map.set(c.id, categorical(mode, i)))
    return map
  }, [fin.categories, mode])

  const catName = (id: string) => fin.categories.find((c) => c.id === id)?.name ?? 'Uncategorised'
  const orderLabel = (id: string) => {
    const o = orders.find((x) => x.id === id)
    return o ? `${o.customerName} · ${o.flavour}` : ''
  }

  const expenses = fin.expenses
    .filter((e) => e.date >= range.from && e.date <= range.to)
    .filter((e) => !catFilter || e.categoryId === catFilter)
    .sort((a, b) => b.date.localeCompare(a.date))

  const income = fin.income
    .filter((i) => i.date >= range.from && i.date <= range.to)
    .sort((a, b) => b.date.localeCompare(a.date))

  const expenseTotal = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0)
  const incomeTotal = income.reduce((s, i) => s + (Number(i.amount) || 0), 0)
  const fixedMonthly = fin.fixedCosts.reduce((s, f) => s + monthlyAmount(f), 0)

  // group the spending log by month so long lists stay readable
  const grouped = useMemo(() => {
    const map = new Map<string, Expense[]>()
    for (const e of expenses) {
      const k = ymOf(e.date)
      map.set(k, [...(map.get(k) ?? []), e])
    }
    return [...map.entries()]
  }, [expenses])

  const TABS: { value: Tab; label: string; count: number }[] = [
    { value: 'spending', label: 'Spending', count: expenses.length },
    { value: 'fixed', label: 'Fixed bills', count: fin.fixedCosts.length },
    { value: 'income', label: 'Other income', count: income.length },
    { value: 'categories', label: 'Categories', count: fin.categories.filter((c) => !c.archived).length },
  ]

  return (
    <section className="panel">
      <header className="panel-head">
        <h2 className="section-label">Your money going out</h2>
      </header>

      <div className="segmented seg-wide" role="tablist" aria-label="Cost records">
        {TABS.map((t) => (
          <button
            key={t.value}
            role="tab"
            aria-selected={tab === t.value}
            className={tab === t.value ? 'seg-active' : ''}
            onClick={() => setTab(t.value)}
          >
            {t.label}
            {t.count > 0 && <em className="seg-count">{t.count}</em>}
          </button>
        ))}
      </div>

      {/* ── Spending ── */}
      {tab === 'spending' && (
        <div className="panel-body">
          <div className="panel-bar">
            <p className="panel-total">
              <strong>{money(expenseTotal)}</strong>
              <span>
                spent across {expenses.length} {expenses.length === 1 ? 'entry' : 'entries'} · {range.label}
              </span>
            </p>
            <button className="btn btn-primary" onClick={props.onAddExpense}>
              <span className="btn-plus" aria-hidden="true">
                +
              </span>
              Log spending
            </button>
          </div>

          {fin.categories.length > 1 && (
            <div className="filter-chips">
              <button
                className={`chip ${catFilter === '' ? 'chip-on' : ''}`}
                onClick={() => setCatFilter('')}
              >
                All
              </button>
              {fin.categories
                .filter((c) => !c.archived)
                .map((c) => (
                  <button
                    key={c.id}
                    className={`chip ${catFilter === c.id ? 'chip-on' : ''}`}
                    onClick={() => setCatFilter(catFilter === c.id ? '' : c.id)}
                  >
                    <i className="legend-dot" style={{ background: colorOf.get(c.id) }} aria-hidden="true" />
                    {c.name}
                  </button>
                ))}
            </div>
          )}

          {expenses.length === 0 ? (
            <div className="panel-empty">
              <p>
                {fin.expenses.length === 0
                  ? "Nothing logged yet. Every grocery run, box of cake boards and tank of gas you add here makes your profit number more real."
                  : 'Nothing in this stretch of time. Try a wider period up top.'}
              </p>
              {fin.categories.length === 0 && (
                <button className="btn btn-tint" onClick={() => void props.onAddStarters()}>
                  Start me off with the usual bakery categories
                </button>
              )}
            </div>
          ) : (
            grouped.map(([ym, list]) => (
              <div key={ym} className="log-group">
                <h4 className="log-month">
                  {monthLabel(ym, true)}
                  <span>{money(list.reduce((s, e) => s + e.amount, 0))}</span>
                </h4>
                <ul className="log">
                  {list.map((e) => (
                    <li key={e.id}>
                      <button className="log-row" onClick={() => props.onEditExpense(e)}>
                        <i className="log-dot" style={{ background: colorOf.get(e.categoryId) ?? 'var(--text-2)' }} aria-hidden="true" />
                        <span className="log-main">
                          <strong>{e.vendor || catName(e.categoryId)}</strong>
                          <small>
                            {catName(e.categoryId)} · {formatDate(e.date)}
                            {e.orderId && orderLabel(e.orderId) ? ` · for ${orderLabel(e.orderId)}` : ''}
                            {e.note ? ` · ${e.note}` : ''}
                          </small>
                        </span>
                        <span className="log-amount">{money(e.amount)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Fixed bills ── */}
      {tab === 'fixed' && (
        <div className="panel-body">
          <div className="panel-bar">
            <p className="panel-total">
              <strong>{money(fixedMonthly)}</strong>
              <span>of fixed bills every month</span>
            </p>
            <button className="btn btn-primary" onClick={props.onAddFixed}>
              <span className="btn-plus" aria-hidden="true">
                +
              </span>
              Add a bill
            </button>
          </div>

          <StartMonthRow value={props.startMonth} onChange={props.onStartMonth} />

          {fin.fixedCosts.length === 0 ? (
            <div className="panel-empty">
              <p>
                Fixed bills are the ones you pay whether you sell one cake or fifty — rent, insurance, your
                website, your phone. Add them and your profit number stops flattering you.
              </p>
            </div>
          ) : (
            <ul className="log">
              {[...fin.fixedCosts]
                .sort((a, b) => monthlyAmount(b) - monthlyAmount(a))
                .map((f) => (
                  <li key={f.id}>
                    <button className="log-row" onClick={() => props.onEditFixed(f)}>
                      <span className="log-main">
                        <strong>
                          {f.name}
                          {f.endMonth && <em className="log-tag">ended {monthLabel(f.endMonth, true)}</em>}
                        </strong>
                        <small>
                          {money(f.amount)} {CADENCE_LABEL[f.cadence]}
                          {f.cadence !== 'monthly' && ` · ${money(Math.round(monthlyAmount(f) * 100) / 100)}/month`}
                          {f.notes ? ` · ${f.notes}` : ''}
                        </small>
                      </span>
                      <span className="log-amount">{money(Math.round(monthlyAmount(f) * 100) / 100)}<small>/mo</small></span>
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}

      {/* ── Other income ── */}
      {tab === 'income' && (
        <div className="panel-body">
          <div className="panel-bar">
            <p className="panel-total">
              <strong>{money(incomeTotal)}</strong>
              <span>on top of cake orders · {range.label}</span>
            </p>
            <button className="btn btn-primary" onClick={props.onAddIncome}>
              <span className="btn-plus" aria-hidden="true">
                +
              </span>
              Log income
            </button>
          </div>

          {income.length === 0 ? (
            <div className="panel-empty">
              <p>
                Cake orders are counted automatically. This is for everything else — a market stall, a
                baking class, a catering tray.
              </p>
            </div>
          ) : (
            <ul className="log">
              {income.map((i) => (
                <li key={i.id}>
                  <button className="log-row" onClick={() => props.onEditIncome(i)}>
                    <span className="log-main">
                      <strong>{i.source}</strong>
                      <small>
                        {formatDate(i.date)}
                        {i.note ? ` · ${i.note}` : ''}
                      </small>
                    </span>
                    <span className="log-amount log-in">+{money(i.amount)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ── Categories ── */}
      {tab === 'categories' && (
        <div className="panel-body">
          <p className="hint">
            Name your cost buckets however you like — add as many as you want. Renaming one updates it
            everywhere, including old entries.
          </p>
          {fin.categories.length === 0 ? (
            <div className="panel-empty">
              <p>No categories yet.</p>
              <button className="btn btn-tint" onClick={() => void props.onAddStarters()}>
                Start me off with the usual bakery categories
              </button>
            </div>
          ) : (
            <ul className="cat-list">
              {fin.categories.map((c, i) => (
                <CategoryRow
                  key={c.id}
                  category={c}
                  color={categorical(mode, i)}
                  usedBy={fin.expenses.filter((e) => e.categoryId === c.id).length}
                  onRename={(name) => props.onRenameCategory(c, name)}
                  onArchive={(a) => props.onArchiveCategory(c, a)}
                  onDelete={() => props.onDeleteCategory(c)}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}

function CategoryRow({
  category,
  color,
  usedBy,
  onRename,
  onArchive,
  onDelete,
}: {
  category: CostCategory
  color: string
  usedBy: number
  onRename: (name: string) => Promise<void>
  onArchive: (archived: boolean) => Promise<void>
  onDelete: () => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(category.name)
  const [busy, setBusy] = useState(false)

  const commit = async () => {
    const trimmed = name.trim()
    if (!trimmed || trimmed === category.name) {
      setName(category.name)
      setEditing(false)
      return
    }
    setBusy(true)
    await onRename(trimmed)
    setBusy(false)
    setEditing(false)
  }

  return (
    <li className={category.archived ? 'cat-row cat-archived' : 'cat-row'}>
      <i className="legend-dot" style={{ background: color }} aria-hidden="true" />
      {editing ? (
        <input
          className="cat-input"
          value={name}
          autoFocus
          disabled={busy}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void commit()
            if (e.key === 'Escape') {
              setName(category.name)
              setEditing(false)
            }
          }}
        />
      ) : (
        <button className="cat-name" onClick={() => setEditing(true)}>
          {category.name}
        </button>
      )}
      <small className="cat-used">
        {usedBy === 0 ? 'unused' : `${usedBy} ${usedBy === 1 ? 'entry' : 'entries'}`}
      </small>
      <div className="cat-actions">
        <button className="btn btn-small btn-quiet" onClick={() => setEditing(true)}>
          Rename
        </button>
        {usedBy === 0 ? (
          <button className="btn btn-small btn-quiet" onClick={() => void onDelete()}>
            Delete
          </button>
        ) : (
          <button className="btn btn-small btn-quiet" onClick={() => void onArchive(!category.archived)}>
            {category.archived ? 'Bring back' : 'Hide'}
          </button>
        )}
      </div>
    </li>
  )
}

/**
 * "Counting bills from ___".
 *
 * A monthly bill has no date of its own, so without a floor it gets charged
 * to every month the app can see. Adding rent in September wrote a month of
 * rent into the previous January, February, March and so on — months with no
 * sales in them — and the dashboard showed a year of invented losses.
 */
function StartMonthRow({
  value,
  onChange,
}: {
  value: string
  onChange: (ym: string) => Promise<void>
}) {
  const [saving, setSaving] = useState(false)
  const thisMonth = new Date().toISOString().slice(0, 7)
  // two years back is plenty to reach for; nothing ahead of this month
  const options = Array.from({ length: 25 }, (_, i) => {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() - i)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })

  const pick = async (ym: string) => {
    setSaving(true)
    try {
      await onChange(ym)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="start-month">
      <label className="pick">
        <span>Counting bills from</span>
        <select value={value || thisMonth} disabled={saving} onChange={(e) => void pick(e.target.value)}>
          {options.map((ym) => (
            <option key={ym} value={ym}>
              {monthLabel(ym, true)}
            </option>
          ))}
        </select>
      </label>
      <p className="hint">
        The month you started keeping books here. Nothing above is charged to any month before it, so
        the months you weren’t tracking stay empty instead of showing a loss.
      </p>
    </div>
  )
}
