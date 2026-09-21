import { useEffect, useState } from 'react'
import type {
  Cadence,
  CakeOrder,
  CostCategory,
  Expense,
  FixedCost,
  NewExpense,
  NewFixedCost,
  NewOtherIncome,
  OtherIncome,
} from '../../types'
import { formatDate, todayYmd } from '../../dates'

/** Esc closes any of these sheets, same as the order form. */
function useEscape(onCancel: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])
}

function Shell({
  title,
  onCancel,
  onSubmit,
  saving,
  error,
  canSave,
  saveLabel,
  onDelete,
  children,
}: {
  title: string
  onCancel: () => void
  onSubmit: (e: React.FormEvent) => void
  saving: boolean
  error: string
  canSave: boolean
  saveLabel: string
  onDelete?: () => void
  children: React.ReactNode
}) {
  useEscape(onCancel)
  return (
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <form className="sheet sheet-narrow" onSubmit={onSubmit} aria-label={title}>
        <header className="sheet-head">
          <h2>{title}</h2>
          <button type="button" className="btn-close" aria-label="Close" onClick={onCancel}>
            ×
          </button>
        </header>
        <div className="sheet-body">{children}</div>
        <footer className="sheet-foot">
          {error && <p className="form-error">{error}</p>}
          <div className="sheet-actions">
            {onDelete && (
              <button type="button" className="btn btn-destructive" onClick={onDelete}>
                Delete
              </button>
            )}
            <button type="button" className="btn btn-quiet" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary btn-lg" disabled={!canSave || saving}>
              {saving ? 'Saving…' : saveLabel}
            </button>
          </div>
        </footer>
      </form>
    </div>
  )
}

function MoneyField({
  label,
  value,
  onChange,
  autoFocus,
  hint,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  autoFocus?: boolean
  hint?: string
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <div className="money-input">
        <span aria-hidden="true">$</span>
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          placeholder="0.00"
          value={value}
          autoFocus={autoFocus}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
      {hint && <small className="hint">{hint}</small>}
    </label>
  )
}

// ── Expense ──────────────────────────────────────────────────────────────────

const CADENCES: { value: Cadence; label: string; hint: string }[] = [
  { value: 'weekly', label: 'Every week', hint: '× 52 ÷ 12 per month' },
  { value: 'monthly', label: 'Every month', hint: 'charged as-is' },
  { value: 'quarterly', label: 'Every 3 months', hint: 'split over 3 months' },
  { value: 'yearly', label: 'Once a year', hint: 'split over 12 months' },
]

export function ExpenseSheet({
  initial,
  categories,
  orders,
  onSave,
  onDelete,
  onCancel,
  onCreateCategory,
}: {
  initial?: Expense
  categories: CostCategory[]
  orders: CakeOrder[]
  onSave: (e: NewExpense) => Promise<void>
  onDelete?: () => void
  onCancel: () => void
  onCreateCategory: (name: string) => Promise<CostCategory>
}) {
  const live = categories.filter((c) => !c.archived || c.id === initial?.categoryId)
  const [date, setDate] = useState(initial?.date ?? todayYmd())
  const [amount, setAmount] = useState(initial?.amount ? String(initial.amount) : '')
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? live[0]?.id ?? '')
  const [vendor, setVendor] = useState(initial?.vendor ?? '')
  const [note, setNote] = useState(initial?.note ?? '')
  const [orderId, setOrderId] = useState(initial?.orderId ?? '')
  const [newCat, setNewCat] = useState('')
  const [addingCat, setAddingCat] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const amountNum = Number(amount) || 0
  const canSave = amountNum > 0 && Boolean(date) && Boolean(categoryId)

  const addCategory = async () => {
    const name = newCat.trim()
    if (!name) return
    setAddingCat(true)
    try {
      const created = await onCreateCategory(name)
      setCategoryId(created.id)
      setNewCat('')
    } catch (err) {
      setError(`Couldn't add that category — ${String(err)}`)
    } finally {
      setAddingCat(false)
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSave) return setError('Add how much it cost and what kind of cost it was.')
    setError('')
    setSaving(true)
    try {
      await onSave({ date, amount: amountNum, categoryId, vendor: vendor.trim(), note: note.trim(), orderId })
    } catch (err) {
      setError(`Couldn't save — ${String(err)}`)
      setSaving(false)
    }
  }

  const recent = [...orders]
    .sort((a, b) => b.pickupDate.localeCompare(a.pickupDate))
    .slice(0, 40)

  return (
    <Shell
      title={initial ? 'Edit spending' : 'Log spending'}
      onCancel={onCancel}
      onSubmit={submit}
      saving={saving}
      error={error}
      canSave={canSave}
      saveLabel={initial ? 'Save changes' : 'Add it'}
      onDelete={onDelete}
    >
      <section className="fieldset">
        <div className="row-2">
          <MoneyField label="How much? *" value={amount} onChange={setAmount} autoFocus />
          <label className="field">
            <span>When? *</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
      </section>

      <section className="fieldset">
        <h3 className="fieldset-title">What kind of cost?</h3>
        {live.length === 0 ? (
          <p className="hint">No categories yet — name your first one below.</p>
        ) : (
          <div className="flavour-chips">
            {live.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`chip ${categoryId === c.id ? 'chip-on' : ''}`}
                onClick={() => setCategoryId(c.id)}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
        <div className="inline-add">
          <input
            type="text"
            placeholder="Or name a new one — 'Sprinkles', 'Parking'…"
            value={newCat}
            onChange={(e) => setNewCat(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void addCategory()
              }
            }}
          />
          <button
            type="button"
            className="btn btn-tint"
            disabled={!newCat.trim() || addingCat}
            onClick={() => void addCategory()}
          >
            {addingCat ? 'Adding…' : 'Add'}
          </button>
        </div>
      </section>

      <section className="fieldset">
        <div className="row-2">
          <label className="field">
            <span>Paid to</span>
            <input
              type="text"
              placeholder="Costco, Bulk Barn…"
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
            />
          </label>
          <label className="field">
            <span>For one particular cake?</span>
            <select value={orderId} onChange={(e) => setOrderId(e.target.value)}>
              <option value="">No — general spending</option>
              {recent.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.customerName} · {o.flavour} · {formatDate(o.pickupDate)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          <span>Note</span>
          <input
            type="text"
            placeholder="Anything worth remembering"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
      </section>
    </Shell>
  )
}

// ── Fixed cost ───────────────────────────────────────────────────────────────

export function FixedCostSheet({
  initial,
  onSave,
  onDelete,
  onCancel,
}: {
  initial?: FixedCost
  onSave: (f: NewFixedCost) => Promise<void>
  onDelete?: () => void
  onCancel: () => void
}) {
  const thisMonth = todayYmd().slice(0, 7)
  const [name, setName] = useState(initial?.name ?? '')
  const [amount, setAmount] = useState(initial?.amount ? String(initial.amount) : '')
  const [cadence, setCadence] = useState<Cadence>(initial?.cadence ?? 'monthly')
  const [startMonth, setStartMonth] = useState(initial?.startMonth ?? thisMonth)
  const [endMonth, setEndMonth] = useState(initial?.endMonth ?? '')
  const [stillPaying, setStillPaying] = useState(!initial?.endMonth)
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const amountNum = Number(amount) || 0
  const canSave = name.trim() !== '' && amountNum > 0
  const perMonth =
    cadence === 'weekly'
      ? (amountNum * 52) / 12
      : cadence === 'quarterly'
        ? amountNum / 3
        : cadence === 'yearly'
          ? amountNum / 12
          : amountNum

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSave) return setError('Give the bill a name and an amount.')
    setError('')
    setSaving(true)
    try {
      await onSave({
        name: name.trim(),
        amount: amountNum,
        cadence,
        startMonth,
        endMonth: stillPaying ? '' : endMonth,
        notes: notes.trim(),
      })
    } catch (err) {
      setError(`Couldn't save — ${String(err)}`)
      setSaving(false)
    }
  }

  return (
    <Shell
      title={initial ? 'Edit fixed bill' : 'Add a fixed bill'}
      onCancel={onCancel}
      onSubmit={submit}
      saving={saving}
      error={error}
      canSave={canSave}
      saveLabel={initial ? 'Save changes' : 'Add it'}
      onDelete={onDelete}
    >
      <section className="fieldset">
        <label className="field">
          <span>What is it? *</span>
          <input
            type="text"
            placeholder="Rent, insurance, website, phone…"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <MoneyField label="How much? *" value={amount} onChange={setAmount} />
      </section>

      <section className="fieldset">
        <h3 className="fieldset-title">How often do you pay it?</h3>
        <div className="flavour-chips">
          {CADENCES.map((c) => (
            <button
              key={c.value}
              type="button"
              className={`chip ${cadence === c.value ? 'chip-on' : ''}`}
              onClick={() => setCadence(c.value)}
            >
              {c.label}
            </button>
          ))}
        </div>
        {amountNum > 0 && (
          <div className="balance-box">
            <span>Counts as</span>
            <strong>${perMonth.toFixed(2)} a month</strong>
          </div>
        )}
      </section>

      <section className="fieldset">
        <h3 className="fieldset-title">Since when?</h3>
        <div className="row-2">
          <label className="field">
            <span>Started</span>
            <input type="month" value={startMonth} onChange={(e) => setStartMonth(e.target.value)} />
          </label>
          {!stillPaying && (
            <label className="field">
              <span>Stopped after</span>
              <input type="month" value={endMonth} onChange={(e) => setEndMonth(e.target.value)} />
            </label>
          )}
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={stillPaying}
            onChange={(e) => {
              setStillPaying(e.target.checked)
              if (e.target.checked) setEndMonth('')
              else if (!endMonth) setEndMonth(todayYmd().slice(0, 7))
            }}
          />
          <span>I'm still paying this</span>
        </label>
        <small className="hint">
          Fixed bills are counted every month between these dates, even in months with no cakes — that's
          what makes the profit number honest.
        </small>
        <label className="field">
          <span>Note</span>
          <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </section>
    </Shell>
  )
}

// ── Other income ─────────────────────────────────────────────────────────────

export function IncomeSheet({
  initial,
  onSave,
  onDelete,
  onCancel,
}: {
  initial?: OtherIncome
  onSave: (i: NewOtherIncome) => Promise<void>
  onDelete?: () => void
  onCancel: () => void
}) {
  const [date, setDate] = useState(initial?.date ?? todayYmd())
  const [amount, setAmount] = useState(initial?.amount ? String(initial.amount) : '')
  const [source, setSource] = useState(initial?.source ?? '')
  const [note, setNote] = useState(initial?.note ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const amountNum = Number(amount) || 0
  const canSave = amountNum > 0 && source.trim() !== ''

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSave) return setError('Add how much came in and where it came from.')
    setError('')
    setSaving(true)
    try {
      await onSave({ date, amount: amountNum, source: source.trim(), note: note.trim() })
    } catch (err) {
      setError(`Couldn't save — ${String(err)}`)
      setSaving(false)
    }
  }

  return (
    <Shell
      title={initial ? 'Edit other income' : 'Log other income'}
      onCancel={onCancel}
      onSubmit={submit}
      saving={saving}
      error={error}
      canSave={canSave}
      saveLabel={initial ? 'Save changes' : 'Add it'}
      onDelete={onDelete}
    >
      <section className="fieldset">
        <p className="hint">
          For money that isn't a logged cake order — cupcakes at a market, a baking class, a catering
          tray.
        </p>
        <div className="row-2">
          <MoneyField label="How much? *" value={amount} onChange={setAmount} autoFocus />
          <label className="field">
            <span>When? *</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
        <label className="field">
          <span>Where from? *</span>
          <input
            type="text"
            placeholder="Farmers market, cupcake order, class…"
            value={source}
            onChange={(e) => setSource(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Note</span>
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </section>
    </Shell>
  )
}
