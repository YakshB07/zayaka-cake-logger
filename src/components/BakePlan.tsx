import { useMemo, useState } from 'react'
import type { CakeOrder } from '../types'
import { formatDate, formatTime, money, todayYmd } from '../dates'

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

function addDays(base: string, n: number): string {
  const [y, m, d] = base.split('-').map(Number)
  return ymd(new Date(y, m - 1, d + n))
}

/**
 * The week's baking, laid out as a prep sheet she can print and stick on the
 * fridge. Grouped by pickup day, with the totals a baker actually needs:
 * how many of each size, how many of each flavour, and what money to collect.
 */
export function BakePlan({ orders, onOpen }: { orders: CakeOrder[]; onOpen: (o: CakeOrder) => void }) {
  const today = todayYmd()
  const [offset, setOffset] = useState(0)
  const [days, setDays] = useState(7)

  const from = addDays(today, offset * days)
  const to = addDays(from, days - 1)

  const inWindow = useMemo(
    () =>
      orders
        .filter((o) => o.pickupDate >= from && o.pickupDate <= to)
        .sort((a, b) =>
          (a.pickupDate + (a.pickupTime || '99')).localeCompare(b.pickupDate + (b.pickupTime || '99'))
        ),
    [orders, from, to]
  )

  const byDay = useMemo(() => {
    const map = new Map<string, CakeOrder[]>()
    for (const o of inWindow) map.set(o.pickupDate, [...(map.get(o.pickupDate) ?? []), o])
    return [...map.entries()]
  }, [inWindow])

  const tally = (get: (o: CakeOrder) => string) => {
    const m = new Map<string, number>()
    for (const o of inWindow) {
      const k = get(o) || 'Not set'
      m.set(k, (m.get(k) ?? 0) + 1)
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }

  const flavours = tally((o) => o.flavour)
  const sizes = tally((o) => o.size)
  const toCollect = inWindow
    .filter((o) => !o.balancePaid)
    .reduce((s, o) => s + Math.max(0, (Number(o.price) || 0) - (Number(o.depositAmount) || 0)), 0)
  const booked = inWindow.reduce((s, o) => s + (Number(o.price) || 0), 0)

  const label =
    offset === 0
      ? `Next ${days} days`
      : offset === 1
        ? 'The following week'
        : offset === -1
          ? 'Last week'
          : `${formatDate(from)} – ${formatDate(to)}`

  return (
    <section className="plan">
      <header className="plan-head">
        <div>
          <h2 className="section-label">Bake plan</h2>
          <p className="plan-range">
            {label} · {formatDate(from)} → {formatDate(to)}
          </p>
        </div>
        <div className="plan-controls">
          <div className="segmented seg-sm">
            <button className={days === 7 ? 'seg-active' : ''} onClick={() => setDays(7)}>
              Week
            </button>
            <button className={days === 14 ? 'seg-active' : ''} onClick={() => setDays(14)}>
              2 weeks
            </button>
          </div>
          <button className="cal-arrow" onClick={() => setOffset(offset - 1)} aria-label="Earlier">
            ‹
          </button>
          {offset !== 0 && (
            <button className="btn btn-small btn-quiet" onClick={() => setOffset(0)}>
              Now
            </button>
          )}
          <button className="cal-arrow" onClick={() => setOffset(offset + 1)} aria-label="Later">
            ›
          </button>
          <button className="btn btn-tint no-print" onClick={() => window.print()}>
            Print
          </button>
        </div>
      </header>

      {inWindow.length === 0 ? (
        <p className="panel-empty">
          <span>Nothing to bake in this stretch. Enjoy the quiet.</span>
        </p>
      ) : (
        <>
          <div className="plan-totals">
            <div>
              <dt>Cakes to bake</dt>
              <dd>{inWindow.length}</dd>
            </div>
            <div>
              <dt>Booked</dt>
              <dd>{money(booked)}</dd>
            </div>
            <div>
              <dt>To collect at pickup</dt>
              <dd>{money(toCollect)}</dd>
            </div>
            <div>
              <dt>Busiest day</dt>
              <dd className="plan-busy">
                {byDay.reduce((a, b) => (b[1].length > a[1].length ? b : a))[1].length} cakes
                <small>
                  {formatDate(byDay.reduce((a, b) => (b[1].length > a[1].length ? b : a))[0]).split(',')[0]}
                </small>
              </dd>
            </div>
          </div>

          <div className="plan-tallies">
            <div className="plan-tally">
              <h3>Flavours to make</h3>
              <ul>
                {flavours.map(([name, n]) => (
                  <li key={name}>
                    <span>{name}</span>
                    <strong>×{n}</strong>
                  </li>
                ))}
              </ul>
            </div>
            <div className="plan-tally">
              <h3>Sizes to prep</h3>
              <ul>
                {sizes.map(([name, n]) => (
                  <li key={name}>
                    <span>{name}</span>
                    <strong>×{n}</strong>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="plan-days">
            {byDay.map(([date, list]) => {
              const due = list.reduce(
                (s, o) => s + (o.balancePaid ? 0 : Math.max(0, (o.price || 0) - (o.depositAmount || 0))),
                0
              )
              return (
                <div key={date} className={`plan-day ${date === today ? 'plan-day-today' : ''}`}>
                  <h3>
                    {formatDate(date)}
                    {date === today && <em>today</em>}
                    <span>
                      {list.length} {list.length === 1 ? 'cake' : 'cakes'}
                      {due > 0 && ` · ${money(due)} to collect`}
                    </span>
                  </h3>
                  <ul>
                    {list.map((o) => (
                      <li key={o.id}>
                        <button className="plan-item" onClick={() => onOpen(o)}>
                          <span className="plan-check" aria-hidden="true" />
                          <span className="plan-item-main">
                            <strong>
                              {o.size} {o.flavour}
                              {o.tierCount > 1 && <em className="log-tag">{o.tierCount} tiers</em>}
                            </strong>
                            <small>
                              {o.customerName}
                              {o.pickupTime ? ` · ${formatTime(o.pickupTime)}` : ''}
                              {o.cakeText ? ` · "${o.cakeText}"` : ''}
                              {o.designNotes ? ` · ${o.designNotes}` : ''}
                            </small>
                          </span>
                          <span className="plan-item-pay">
                            {o.balancePaid ? (
                              <em className="paid">paid</em>
                            ) : (
                              money(Math.max(0, (o.price || 0) - (o.depositAmount || 0)))
                            )}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        </>
      )}
    </section>
  )
}
