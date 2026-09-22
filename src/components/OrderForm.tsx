import { useEffect, useState } from 'react'
import type { CakeOrder, NewOrder, PaymentMethod } from '../types'
import {
  FLAVOURS,
  LARGE_SIZES,
  PAYMENT_METHODS,
  ROUND_SIZES,
  SERVES_RANGE,
  TIERS,
  TIER_DEFAULTS,
  TIER_NAMES,
  isRoundSize,
} from '../data'
import { money, todayYmd } from '../dates'
import { PhotoDropzone } from './PhotoDropzone'

interface Props {
  /** an existing order to edit, OR a partly filled template for a repeat */
  initial?: CakeOrder
  /** true = editing that order; false = it's only a starting point */
  isEdit?: boolean
  onSave: (order: NewOrder) => Promise<void>
  onCancel: () => void
}

const GROUPS = ['Classic', 'Signature', 'Exotic'] as const

export function OrderForm({ initial, isEdit = Boolean(initial), onSave, onCancel }: Props) {
  const [customerName, setCustomerName] = useState(initial?.customerName ?? '')
  const [customerPhone, setCustomerPhone] = useState(initial?.customerPhone ?? '')
  const [tierCount, setTierCount] = useState(initial?.tierCount ?? 1)
  const [tierSizes, setTierSizes] = useState<string[]>(
    initial?.tierSizes?.length ? initial.tierSizes : [initial?.size ?? '8"']
  )
  const known = FLAVOURS.some((f) => f.name === initial?.flavour)
  const [flavour, setFlavour] = useState(initial ? (known ? initial.flavour : 'other') : '')
  const [customFlavour, setCustomFlavour] = useState(initial && !known ? initial.flavour : '')
  const [pickupDate, setPickupDate] = useState(initial?.pickupDate ?? '')
  const [pickupTime, setPickupTime] = useState(initial?.pickupTime ?? '')
  const [price, setPrice] = useState(initial?.price ? String(initial.price) : '')
  const [depositAmount, setDepositAmount] = useState(initial?.depositAmount ? String(initial.depositAmount) : '')
  const [depositMethod, setDepositMethod] = useState<PaymentMethod | ''>(initial?.depositMethod ?? '')
  const [balanceMethod, setBalanceMethod] = useState<PaymentMethod | ''>(initial?.balanceMethod ?? '')
  const [balancePaid, setBalancePaid] = useState(initial?.balancePaid ?? false)
  const [cakeText, setCakeText] = useState(initial?.cakeText ?? '')
  const [designNotes, setDesignNotes] = useState(initial?.designNotes ?? '')
  const [imageUrls, setImageUrls] = useState<string[]>(initial?.imageUrls ?? [])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  /*
   * A pickup date in the past means she's writing up a cake that already went
   * out the door, so it's treated as collected and settled unless she says
   * otherwise. Kept as its own piece of state rather than derived, so
   * unticking it sticks while she finishes the rest of the form.
   */
  const [pastSettled, setPastSettled] = useState(
    // Editing something already collected? Mirror what it says. Otherwise the
    // assumption applies — including a repeat, or a date tapped on the
    // calendar, where `initial` is only a partly filled template.
    isEdit && initial?.status === 'completed' ? Boolean(initial.balancePaid) : true
  )

  // esc to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const changeTiers = (n: number) => {
    setTierCount(n)
    setTierSizes((prev) =>
      // a sheet or slab can't be a tier, so it falls back to the default round
      TIER_DEFAULTS[n].map((d, i) => (n > 1 && !isRoundSize(prev[i] ?? '') ? d : (prev[i] ?? d)))
    )
  }

  const setTierSize = (i: number, size: string) => {
    setTierSizes((prev) => prev.map((s, idx) => (idx === i ? size : s)))
  }

  // combined serving estimate across all tiers
  const servesEstimate = tierSizes.reduce(
    (acc, s) => {
      const r = SERVES_RANGE[s]
      return r ? [acc[0] + r[0], acc[1] + r[1]] : acc
    },
    [0, 0]
  )

  const today = todayYmd()
  const isPast = pickupDate !== '' && pickupDate < today

  const priceNum = Number(price) || 0
  const depositNum = Number(depositAmount) || 0
  const balance = Math.max(0, priceNum - depositNum)
  // for a past pickup the "already picked up & paid" tick is the paid control
  const effectivePaid = isPast ? pastSettled : balancePaid
  const canSave =
    customerName.trim() !== '' &&
    pickupDate !== '' &&
    (flavour === 'other' ? customFlavour.trim() !== '' : flavour !== '')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const finalFlavour = flavour === 'other' ? customFlavour.trim() : flavour
    if (!customerName.trim()) return setError('Who is the cake for? Add the customer name.')
    if (!finalFlavour) return setError('Pick a flavour (or type a custom one).')
    if (!pickupDate) return setError('Set the pickup date — reminders need it.')
    setError('')
    setSaving(true)
    try {
      await onSave({
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        size: tierCount === 1 ? tierSizes[0] : tierSizes.join(' + '),
        tierCount,
        tierSizes: tierSizes.slice(0, tierCount),
        flavour: finalFlavour,
        pickupDate,
        pickupTime,
        price: priceNum,
        depositAmount: depositNum,
        depositMethod,
        balanceMethod,
        balancePaid: effectivePaid || (priceNum > 0 && balance === 0),
        cakeText: cakeText.trim(),
        designNotes: designNotes.trim(),
        imageUrls,
        /*
         * The date has passed, so the cake was collected either way. Whether
         * the money came with it is the tick above: unticked leaves a balance
         * owing, which is what makes it show up as money still to collect.
         */
        status: isPast ? 'completed' : isEdit ? (initial?.status ?? 'upcoming') : 'upcoming',
      })
    } catch (err) {
      setError(`Couldn't save — ${err instanceof Error ? err.message : String(err)}`)
      setSaving(false)
    }
  }

  return (
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <form className="sheet" onSubmit={submit} aria-label={isEdit ? 'Edit cake order' : 'New cake order'}>
        <header className="sheet-head">
          <h2>{isEdit ? 'Edit Cake Order' : initial ? 'Log Another Cake' : 'Log a Cake'}</h2>
          <button type="button" className="btn-close" aria-label="Close" onClick={onCancel}>
            ×
          </button>
        </header>

        <div className="sheet-body">
          <section className="fieldset">
            <h3 className="fieldset-title">Customer</h3>
            <div className="row-2">
              <label className="field">
                <span>Name *</span>
                <input
                  autoFocus
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="e.g. Priya Sharma"
                />
              </label>
              <label className="field">
                <span>Phone</span>
                <input
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="519 555 0123"
                />
              </label>
            </div>
          </section>

          <section className="fieldset">
            <h3 className="fieldset-title">Cake</h3>

            <div className="segmented seg-tiers" role="radiogroup" aria-label="Number of tiers">
              {TIERS.map((t) => (
                <button
                  key={t.count}
                  type="button"
                  role="radio"
                  aria-checked={tierCount === t.count}
                  className={tierCount === t.count ? 'seg-active' : ''}
                  onClick={() => changeTiers(t.count)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {tierCount === 1 ? (
              <>
                <div className="size-row" role="radiogroup" aria-label="Round cake size">
                  {ROUND_SIZES.map((s) => (
                    <button
                      key={s.size}
                      type="button"
                      role="radio"
                      aria-checked={tierSizes[0] === s.size}
                      className={`size-chip ${tierSizes[0] === s.size ? 'chip-on' : ''}`}
                      onClick={() => setTierSize(0, s.size)}
                    >
                      <strong>{s.label}</strong>
                      <small>{s.serves}</small>
                    </button>
                  ))}
                </div>
                <p className="size-divider">
                  <span>or by the tray</span>
                </p>
                <div className="size-row size-row-wide" role="radiogroup" aria-label="Large cake size">
                  {LARGE_SIZES.map((s) => (
                    <button
                      key={s.size}
                      type="button"
                      role="radio"
                      aria-checked={tierSizes[0] === s.size}
                      className={`size-chip ${tierSizes[0] === s.size ? 'chip-on' : ''}`}
                      onClick={() => setTierSize(0, s.size)}
                    >
                      <strong>{s.label}</strong>
                      <small>{s.serves}</small>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="tier-rows">
                {TIER_NAMES[tierCount].map((name, i) => (
                  <div className="tier-row" key={name} role="radiogroup" aria-label={`${name} size`}>
                    <span className="tier-name">{name}</span>
                    <div className="tier-chips">
                      {ROUND_SIZES.map((s) => (
                        <button
                          key={s.size}
                          type="button"
                          role="radio"
                          aria-checked={tierSizes[i] === s.size}
                          className={`chip ${tierSizes[i] === s.size ? 'chip-on' : ''}`}
                          onClick={() => setTierSize(i, s.size)}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                <p className="hint">
                  {tierSizes.slice(0, tierCount).join(' + ')} · serves roughly {servesEstimate[0]}–{servesEstimate[1]}
                </p>
              </div>
            )}

            {GROUPS.map((g) => (
              <div key={g} className="flavour-group">
                <span className="flavour-group-label">{g}</span>
                <div className="flavour-chips">
                  {FLAVOURS.filter((f) => f.group === g).map((f) => (
                    <button
                      key={f.name}
                      type="button"
                      className={`chip ${flavour === f.name ? 'chip-on' : ''}`}
                      onClick={() => setFlavour(f.name)}
                    >
                      {f.name}
                    </button>
                  ))}
                  {g === 'Exotic' && (
                    <button
                      type="button"
                      className={`chip ${flavour === 'other' ? 'chip-on' : ''}`}
                      onClick={() => setFlavour('other')}
                    >
                      Other…
                    </button>
                  )}
                </div>
              </div>
            ))}
            {flavour === 'other' && (
              <label className="field">
                <span>Custom flavour *</span>
                <input
                  value={customFlavour}
                  onChange={(e) => setCustomFlavour(e.target.value)}
                  placeholder="e.g. Half chocolate / half rasmalai"
                />
              </label>
            )}
          </section>

          <section className="fieldset">
            <h3 className="fieldset-title">Pickup</h3>
            <div className="row-2">
              <label className="field">
                <span>Date *</span>
                {/* No `min`: past dates are allowed on purpose, so a cake that
                    already went out can still be written up afterwards. */}
                <input
                  type="date"
                  value={pickupDate}
                  onChange={(e) => setPickupDate(e.target.value)}
                />
              </label>
              <label className="field">
                <span>Time</span>
                <input type="time" value={pickupTime} onChange={(e) => setPickupTime(e.target.value)} />
              </label>
            </div>

            {isPast ? (
              <div className={`past-note ${pastSettled ? 'past-note-settled' : ''}`}>
                <p className="past-note-head">
                  <span aria-hidden="true">↺</span>
                  That date has already gone by, so this is logged as a cake you’ve already made.
                </p>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={pastSettled}
                    onChange={(e) => setPastSettled(e.target.checked)}
                  />
                  <span>Picked up and paid in full</span>
                </label>
                <p className="hint">
                  {pastSettled
                    ? 'It’ll go straight into your records as done and settled — no reminders will be sent.'
                    : 'Untick means the cake went out but the money didn’t — it’ll show up under what you’re still owed.'}
                </p>
              </div>
            ) : (
              <p className="hint">
                Reminders go out 2 days before, 1 day before, and the morning of pickup.
              </p>
            )}
          </section>

          <section className="fieldset">
            <h3 className="fieldset-title">Payment</h3>
            <div className="row-2">
              <label className="field">
                <span>Price discussed</span>
                <div className="money-input">
                  <span>$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="0"
                  />
                </div>
              </label>
              <label className="field">
                <span>Pre-payment received</span>
                <div className="money-input">
                  <span>$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    placeholder="0"
                  />
                </div>
              </label>
            </div>

            {depositNum > 0 && (
              <div className="field">
                <span className="field-label">Pre-payment method</span>
                <div className="segmented seg-sm">
                  {PAYMENT_METHODS.map((m) => (
                    <button
                      key={m.value}
                      type="button"
                      className={depositMethod === m.value ? 'seg-active' : ''}
                      onClick={() => setDepositMethod(m.value)}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {priceNum > 0 && (
              <div className={`balance-box ${balance === 0 || effectivePaid ? 'balance-paid' : ''}`}>
                {balance === 0 || effectivePaid ? (
                  <strong>Paid in full ({money(priceNum)})</strong>
                ) : (
                  <>
                    <strong>{money(balance)} due at pickup</strong>
                    <div className="segmented seg-sm">
                      {PAYMENT_METHODS.map((m) => (
                        <button
                          key={m.value}
                          type="button"
                          className={balanceMethod === m.value ? 'seg-active' : ''}
                          onClick={() => setBalanceMethod(m.value)}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {balance > 0 && !isPast && (
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={balancePaid}
                      onChange={(e) => setBalancePaid(e.target.checked)}
                    />
                    <span>Balance already paid</span>
                  </label>
                )}
              </div>
            )}
          </section>

          <section className="fieldset">
            <h3 className="fieldset-title">Design</h3>
            <label className="field">
              <span>Writing on the cake</span>
              <input
                value={cakeText}
                onChange={(e) => setCakeText(e.target.value)}
                placeholder='e.g. "Happy 30th Birthday Aisha!"'
              />
            </label>
            <label className="field">
              <span>Special design notes</span>
              <textarea
                rows={3}
                value={designNotes}
                onChange={(e) => setDesignNotes(e.target.value)}
                placeholder="Theme, colours, toppers, allergies, tier details…"
              />
            </label>
            <PhotoDropzone urls={imageUrls} onChange={setImageUrls} />
          </section>
        </div>

        <footer className="sheet-foot">
          {error && <p className="form-error" role="alert">{error}</p>}
          {!canSave && !error && <p className="hint">Name, flavour and pickup date are needed to save.</p>}
          <div className="sheet-actions">
            <button type="button" className="btn btn-ghost" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary btn-lg" disabled={saving || !canSave}>
              {saving ? 'Saving…' : initial ? 'Save Changes' : 'Save Order'}
            </button>
          </div>
        </footer>
      </form>
    </div>
  )
}
