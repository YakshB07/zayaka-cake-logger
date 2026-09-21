import { useRef, useState } from 'react'
import type { CakeOrder, FinanceData, Settings } from '../../types'
import { DEFAULT_SETTINGS } from '../../types'
import { monthsInRange, summarise, type Range } from '../../finance/analytics'
import { SMALL_SUPPLIER_THRESHOLD, estimateTax, quarterRanges } from '../../finance/tax'
import { downloadBackup, parseBackup, restoreBackup } from '../../finance/backup'
import { Meter, fmtMoney } from '../charts'
import { Explain } from '../Explain'

const pctOf = (a: number, b: number) => (b > 0 ? Math.min(1, Math.max(0, a / b)) : 0)

// ── Goals ────────────────────────────────────────────────────────────────────

export function GoalsCard({
  orders,
  fin,
  range,
  settings,
  onSave,
  colors,
}: {
  orders: CakeOrder[]
  fin: FinanceData
  range: Range
  settings: Settings | undefined
  onSave: (patch: Partial<Settings>) => Promise<void>
  colors: { profit: string; costs: string; revenue: string }
}) {
  const [editing, setEditing] = useState(false)
  const [revenueGoal, setRevenueGoal] = useState(String(settings?.revenueGoal || ''))
  const [profitGoal, setProfitGoal] = useState(String(settings?.profitGoal || ''))
  const [cakesGoal, setCakesGoal] = useState(String(settings?.cakesGoal || ''))
  const [saving, setSaving] = useState(false)

  const months = Math.max(1, monthsInRange(range).length)
  const s = summarise(orders, fin, range)
  // goals are monthly, so compare against the period's monthly average
  const perMonth = {
    revenue: s.revenue / months,
    profit: s.profit / months,
    cakes: s.orderCount / months,
  }

  const goals = {
    revenue: settings?.revenueGoal ?? 0,
    profit: settings?.profitGoal ?? 0,
    cakes: settings?.cakesGoal ?? 0,
  }
  const anyGoal = goals.revenue > 0 || goals.profit > 0 || goals.cakes > 0

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    await onSave({
      revenueGoal: Number(revenueGoal) || 0,
      profitGoal: Number(profitGoal) || 0,
      cakesGoal: Number(cakesGoal) || 0,
    })
    setSaving(false)
    setEditing(false)
  }

  return (
    <section className="goals-card">
      <header className="panel-head goals-head">
        <h2 className="section-label">
          Your monthly goals
          <Explain>
            Set what you'd like to make in a typical month. The bars below compare it against your
            monthly average over whatever period you're looking at.
          </Explain>
        </h2>
        {!editing && (
          <button className="btn btn-small btn-quiet" onClick={() => setEditing(true)}>
            {anyGoal ? 'Change' : 'Set goals'}
          </button>
        )}
      </header>

      {editing ? (
        <form className="goals-form" onSubmit={submit}>
          <div className="row-3">
            <label className="field">
              <span>Money in, per month</span>
              <div className="money-input">
                <span aria-hidden="true">$</span>
                <input
                  type="number"
                  min="0"
                  step="50"
                  inputMode="decimal"
                  value={revenueGoal}
                  autoFocus
                  onChange={(e) => setRevenueGoal(e.target.value)}
                  placeholder="0"
                />
              </div>
            </label>
            <label className="field">
              <span>Profit, per month</span>
              <div className="money-input">
                <span aria-hidden="true">$</span>
                <input
                  type="number"
                  min="0"
                  step="50"
                  inputMode="decimal"
                  value={profitGoal}
                  onChange={(e) => setProfitGoal(e.target.value)}
                  placeholder="0"
                />
              </div>
            </label>
            <label className="field">
              <span>Cakes, per month</span>
              <input
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={cakesGoal}
                onChange={(e) => setCakesGoal(e.target.value)}
                placeholder="0"
              />
            </label>
          </div>
          <div className="sheet-actions">
            <button type="button" className="btn btn-quiet" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save goals'}
            </button>
          </div>
        </form>
      ) : !anyGoal ? (
        <p className="hint">
          No goals set yet. Pick a number you'd like to hit each month and the app will track you
          against it — it's the quickest way to tell a good month from a bad one.
        </p>
      ) : (
        <div className="goal-rows">
          {goals.revenue > 0 && (
            <GoalRow
              label="Money in"
              actual={perMonth.revenue}
              goal={goals.revenue}
              color={colors.revenue}
              format={fmtMoney}
            />
          )}
          {goals.profit > 0 && (
            <GoalRow
              label="Profit"
              actual={perMonth.profit}
              goal={goals.profit}
              color={colors.profit}
              format={fmtMoney}
            />
          )}
          {goals.cakes > 0 && (
            <GoalRow
              label="Cakes"
              actual={perMonth.cakes}
              goal={goals.cakes}
              color={colors.revenue}
              format={(n) => n.toFixed(n < 10 ? 1 : 0)}
            />
          )}
          <p className="hint">
            Compared against your average month across {range.label.toLowerCase()}.
          </p>
        </div>
      )}
    </section>
  )
}

function GoalRow({
  label,
  actual,
  goal,
  color,
  format,
}: {
  label: string
  actual: number
  goal: number
  color: string
  format: (n: number) => string
}) {
  const share = pctOf(actual, goal)
  const hit = actual >= goal
  return (
    <div className="goal-row">
      <div className="goal-top">
        <span className="goal-label">
          {label}
          {hit && (
            <em className="goal-hit" title="Goal met">
              ✓ hit
            </em>
          )}
        </span>
        <span className="goal-nums">
          <strong>{format(actual)}</strong>
          <small>of {format(goal)}</small>
        </span>
      </div>
      <Meter value={actual} target={goal} color={color} />
      <span className="goal-note">
        {hit
          ? `${format(actual - goal)} past your goal`
          : `${format(goal - actual)} to go · ${Math.round(share * 100)}% there`}
      </span>
    </div>
  )
}

// ── Tax ──────────────────────────────────────────────────────────────────────

export function TaxCard({
  orders,
  fin,
  range,
  settings,
  onSave,
}: {
  orders: CakeOrder[]
  fin: FinanceData
  range: Range
  settings: Settings | undefined
  onSave: (patch: Partial<Settings>) => Promise<void>
}) {
  const tax = estimateTax(orders, fin, range, settings)
  const registered = settings?.hstRegistered ?? DEFAULT_SETTINGS.hstRegistered
  const inclusive = settings?.pricesIncludeTax ?? DEFAULT_SETTINGS.pricesIncludeTax
  const year = Number(range.to.slice(0, 4))

  return (
    <section className="tax-card">
      <h2 className="section-label">
        HST &amp; tax time
        <Explain>
          Rough numbers to take to an accountant, not tax advice. Ontario HST is 13%.
        </Explain>
      </h2>

      {/* the threshold matters even when she isn't registered */}
      {!registered && (
        <div className="threshold">
          <div className="threshold-top">
            <span>
              Sales in the last 12 months
              <Explain>
                In Canada you can stay a "small supplier" and skip charging HST until your sales pass
                $30,000 over four calendar quarters in a row. After that you have to register.
              </Explain>
            </span>
            <strong>
              {fmtMoney(tax.rolling12)} <small>of {fmtMoney(SMALL_SUPPLIER_THRESHOLD)}</small>
            </strong>
          </div>
          <Meter
            value={tax.rolling12}
            target={SMALL_SUPPLIER_THRESHOLD}
            color={tax.thresholdShare >= 0.8 ? '#eb6834' : '#2a78d6'}
          />
          {tax.thresholdWarning ? (
            <p className="threshold-warn">{tax.thresholdWarning}</p>
          ) : (
            <p className="hint">
              You're at {Math.round(tax.thresholdShare * 100)}% of the small-supplier limit — nothing to
              do yet.
            </p>
          )}
        </div>
      )}

      <div className="tax-settings">
        <label className="check">
          <input
            type="checkbox"
            checked={registered}
            onChange={(e) => void onSave({ hstRegistered: e.target.checked })}
          />
          <span>I'm registered to charge HST</span>
        </label>
        {registered && (
          <label className="check">
            <input
              type="checkbox"
              checked={inclusive}
              onChange={(e) => void onSave({ pricesIncludeTax: e.target.checked })}
            />
            <span>
              My cake prices already include the tax
              <Explain>
                Most home bakeries quote one all-in price. If that's you, leave this ticked and the app
                works the tax back out of the price instead of adding it on top.
              </Explain>
            </span>
          </label>
        )}
      </div>

      {registered ? (
        <>
          <dl className="tax-grid">
            <div>
              <dt>Sales before tax</dt>
              <dd>{fmtMoney(tax.salesExTax)}</dd>
            </div>
            <div>
              <dt>HST on your sales</dt>
              <dd>{fmtMoney(tax.taxOnSales)}</dd>
            </div>
            <div>
              <dt>
                HST you already paid
                <Explain>
                  The tax inside your own business purchases — ingredients, boxes, rent. You claim it
                  back, so it comes off what you owe. Accountants call these input tax credits.
                </Explain>
              </dt>
              <dd>−{fmtMoney(tax.inputCredits)}</dd>
            </div>
            <div className={tax.netOwing >= 0 ? 'tax-owing' : 'tax-refund'}>
              <dt>{tax.netOwing >= 0 ? 'Roughly owed to the CRA' : 'Roughly refundable'}</dt>
              <dd>{fmtMoney(Math.abs(tax.netOwing))}</dd>
            </div>
          </dl>

          <h3 className="tax-sub">Quarter by quarter, {year}</h3>
          <div className="chart-table-wrap">
            <table className="chart-table">
              <thead>
                <tr>
                  <th scope="col">Quarter</th>
                  <th scope="col">Sales</th>
                  <th scope="col">HST collected</th>
                  <th scope="col">HST paid</th>
                  <th scope="col">Net</th>
                </tr>
              </thead>
              <tbody>
                {quarterRanges(year).map((q) => {
                  const t = estimateTax(orders, fin, q, settings)
                  return (
                    <tr key={q.label}>
                      <td>{q.label}</td>
                      <td>{fmtMoney(t.sales)}</td>
                      <td>{fmtMoney(t.taxOnSales)}</td>
                      <td>{fmtMoney(t.inputCredits)}</td>
                      <td>{fmtMoney(t.netOwing)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p className="hint">
          While you're under the limit there's no HST to charge or file. Tick the box above if that
          changes and this turns into a quarter-by-quarter summary.
        </p>
      )}

      <p className="tax-disclaimer">
        These are estimates worked out from what you've logged — helpful for seeing where you stand,
        but check anything you actually file with an accountant.
      </p>
    </section>
  )
}

// ── Backup & restore ─────────────────────────────────────────────────────────

export function BackupCard({
  orders,
  fin,
  onDone,
  onToast,
}: {
  orders: CakeOrder[]
  fin: FinanceData
  onDone: () => Promise<void>
  onToast: (m: string) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  const onFile = async (file: File) => {
    setError('')
    try {
      const backup = parseBackup(await file.text())
      const count =
        backup.orders.length +
        Object.values(backup.finance).reduce((s, v) => s + (Array.isArray(v) ? v.length : 0), 0)
      if (
        !window.confirm(
          `This file has ${backup.orders.length} cakes and ${count - backup.orders.length} cost records in it, saved ${new Date(backup.exportedAt).toLocaleDateString('en-CA')}.\n\nAnything already here is kept — this only adds back what's missing. Go ahead?`
        )
      )
        return
      setBusy('Restoring…')
      const res = await restoreBackup(backup, { orders, finance: fin }, (done, total) =>
        setBusy(`Restoring… ${done} of ${total}`)
      )
      await onDone()
      onToast(
        res.orders + res.finance === 0
          ? 'Everything in that file was already here ✓'
          : `Restored ${res.orders} cakes and ${res.finance} cost records ✓`
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy('')
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <section className="export-card">
      <h2 className="section-label">
        Backup
        <Explain>
          A single file with every cake and every cost in it. Keep a copy somewhere safe — if
          anything ever goes wrong with the app, this puts your business back.
        </Explain>
      </h2>
      <p className="hint">
        Worth doing every few months, and definitely before tax time. Restoring only adds what's
        missing, so it can never wipe what you already have.
      </p>
      <div className="export-rows">
        <div className="export-row">
          <span>Save everything to a file</span>
          <button className="btn btn-tint" onClick={() => downloadBackup(orders, fin)}>
            Download backup
          </button>
        </div>
        <div className="export-row">
          <span>Put a backup file back</span>
          <div className="export-inline">
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void onFile(f)
              }}
            />
            <button className="btn btn-tint" disabled={Boolean(busy)} onClick={() => fileRef.current?.click()}>
              {busy || 'Restore from file'}
            </button>
          </div>
        </div>
      </div>
      {error && <p className="form-error">{error}</p>}
    </section>
  )
}
