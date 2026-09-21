import { useState } from 'react'
import type { CakeOrder } from '../types'
import { countdownLabel, dateParts, formatTime, money } from '../dates'

interface Props {
  order: CakeOrder
  onEdit: () => void
  onComplete: () => void
  onDelete: () => void
  onRemind: () => void
  onRepeat: () => void
  onTogglePaid: () => void
  /** a save is in flight for this order — don't accept another tap */
  busy?: boolean
}

export function OrderCard({ order, onEdit, onComplete, onDelete, onRemind, onRepeat, onTogglePaid, busy }: Props) {
  const [lightbox, setLightbox] = useState<string | null>(null)
  const cd = countdownLabel(order.pickupDate)
  const dp = dateParts(order.pickupDate)
  const balance = Math.max(0, order.price - order.depositAmount)
  const paid = order.balancePaid || (order.price > 0 && balance === 0)
  const done = order.status === 'completed'
  const paidPct = order.price > 0 ? Math.min(100, Math.round(((paid ? order.price : order.depositAmount) / order.price) * 100)) : 0

  const reminders = [
    { key: 'twoDay', label: '2 days' },
    { key: 'oneDay', label: '1 day' },
    { key: 'dayOf', label: 'day of' },
  ] as const

  return (
    <article className={`card ${done ? 'card-done' : ''} ${cd.tone === 'today' && !done ? 'card-today' : ''}`}>
      <header className="card-head">
        <div className={`date-tile tile-${done ? 'done' : cd.tone}`} aria-hidden="true">
          <span className="tile-month">{dp.month}</span>
          <span className="tile-day">{dp.day}</span>
        </div>
        <div className="card-head-main">
          <h3 className="card-name">{order.customerName}</h3>
          <p className="card-cake">
            {(order.tierCount ?? 1) > 1
              ? `${order.tierCount === 2 ? 'Double' : 'Triple'} tier · ${order.size}`
              : order.size}{' '}
            {order.flavour}
          </p>
          <p className="card-when">
            {dp.weekday}
            {order.pickupTime ? ` · ${formatTime(order.pickupTime)}` : ''}
          </p>
        </div>
        {done ? (
          <span className="badge badge-done">Picked up</span>
        ) : (
          <span className={`badge badge-${cd.tone}`}>{cd.text}</span>
        )}
      </header>

      {(order.cakeText || order.designNotes || order.customerPhone) && (
        <div className="card-details">
          {order.cakeText && <p className="card-quote">&ldquo;{order.cakeText}&rdquo;</p>}
          {order.designNotes && <p className="card-notes">{order.designNotes}</p>}
          {order.customerPhone && (
            <a className="card-phone" href={`tel:${order.customerPhone}`}>
              {order.customerPhone}
            </a>
          )}
        </div>
      )}

      {order.imageUrls.length > 0 && (
        <div className="card-thumbs">
          {order.imageUrls.map((u) => (
            <button key={u} type="button" className="card-thumb" onClick={() => setLightbox(u)} aria-label="View design photo">
              <img src={u} alt="Cake design reference" loading="lazy" />
            </button>
          ))}
        </div>
      )}

      {order.price > 0 && (
        <div className="card-pay">
          <div className="pay-row">
            <span className="pay-label">{paid ? 'Paid in full' : `${money(balance)} due at pickup`}</span>
            <span className="pay-detail">
              {paid
                ? money(order.price)
                : `${money(order.depositAmount)} of ${money(order.price)}${order.depositMethod ? ` · ${order.depositMethod}` : ''}`}
            </span>
          </div>
          <div className="pay-bar" role="img" aria-label={`${paidPct}% paid`}>
            <div className={`pay-fill ${paid ? 'pay-fill-ok' : ''}`} style={{ width: `${paidPct}%` }} />
          </div>
          <div className="pay-foot">
            {!paid && order.balanceMethod && <span className="pay-method">Balance by {order.balanceMethod}</span>}
            {/* payment is tracked separately from pickup, so it has its own control */}
            {balance > 0 && (
              <button
                type="button"
                className={`pay-toggle ${paid ? 'pay-toggle-on' : ''}`}
                onClick={onTogglePaid}
                disabled={busy}
              >
                {paid ? 'Mark unpaid' : `Mark ${money(balance)} paid`}
              </button>
            )}
          </div>
        </div>
      )}

      {!done && (
        <p className="card-reminders">
          Reminders:{' '}
          {reminders.map((r, i) => (
            <span key={r.key} className={order.remindersSent[r.key]?.ok ? 'rem-sent' : 'rem-pending'}>
              {i > 0 && ' · '}
              {r.label}
              {order.remindersSent[r.key]?.ok ? ' ✓' : ''}
            </span>
          ))}
        </p>
      )}

      <footer className="card-actions">
        <button className={`btn btn-small ${done ? 'btn-quiet' : 'btn-tint'}`} onClick={onComplete} disabled={busy}>
          {done ? 'Undo pickup' : 'Picked up'}
        </button>
        <button
          className="btn btn-small btn-quiet"
          onClick={onRepeat}
          title="Start a new order with the same cake, ready for a new date"
        >
          Repeat
        </button>
        <button className="btn btn-small btn-quiet" onClick={onEdit}>
          Edit
        </button>
        {!done && (
          <button
            className="btn btn-small btn-quiet"
            onClick={onRemind}
            disabled={busy}
            title="Send a reminder to both bakery phones now"
          >
            Send now
          </button>
        )}
        <button className="btn btn-small btn-quiet btn-destructive" onClick={onDelete} disabled={busy}>
          Delete
        </button>
      </footer>

      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)} role="dialog" aria-label="Photo preview">
          <img src={lightbox} alt="Cake design reference enlarged" />
        </div>
      )}
    </article>
  )
}
