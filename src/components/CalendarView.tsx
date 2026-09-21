import { useMemo, useState } from 'react'
import type { CakeOrder } from '../types'
import { formatTime, money, todayYmd } from '../dates'
import { addMonths, monthLabel } from '../finance/analytics'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const pad = (n: number) => String(n).padStart(2, '0')

interface Cell {
  ymd: string
  day: number
  inMonth: boolean
  orders: CakeOrder[]
}

/** Six weeks of cells covering the month, padded out to whole weeks. */
function buildGrid(ym: string, byDate: Map<string, CakeOrder[]>): Cell[] {
  const [y, m] = ym.split('-').map(Number)
  const first = new Date(y, m - 1, 1)
  const start = new Date(y, m - 1, 1 - first.getDay()) // back up to the Sunday
  const cells: Cell[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    const ymd = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    cells.push({
      ymd,
      day: d.getDate(),
      inMonth: d.getMonth() === m - 1,
      orders: byDate.get(ymd) ?? [],
    })
  }
  // drop a trailing all-empty week so short months don't leave a blank row
  return cells.length === 42 && cells.slice(35).every((c) => !c.inMonth) ? cells.slice(0, 35) : cells
}

export function CalendarView({
  orders,
  onOpen,
  onNewOn,
}: {
  orders: CakeOrder[]
  onOpen: (o: CakeOrder) => void
  onNewOn: (ymd: string) => void
}) {
  const today = todayYmd()
  const [ym, setYm] = useState(today.slice(0, 7))
  const [selected, setSelected] = useState<string>('')

  const byDate = useMemo(() => {
    const map = new Map<string, CakeOrder[]>()
    for (const o of orders) {
      if (!o.pickupDate) continue
      map.set(o.pickupDate, [...(map.get(o.pickupDate) ?? []), o])
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.pickupTime || '99').localeCompare(b.pickupTime || '99'))
    }
    return map
  }, [orders])

  const cells = useMemo(() => buildGrid(ym, byDate), [ym, byDate])

  const monthOrders = cells.filter((c) => c.inMonth).flatMap((c) => c.orders)
  const monthRevenue = monthOrders.reduce((s, o) => s + (Number(o.price) || 0), 0)
  const busiest = Math.max(1, ...cells.map((c) => c.orders.length))

  const selectedCell = cells.find((c) => c.ymd === selected)

  return (
    <div className="cal">
      <header className="cal-head">
        <div className="cal-nav">
          <button className="cal-arrow" onClick={() => setYm(addMonths(ym, -1))} aria-label="Previous month">
            ‹
          </button>
          <h2>{monthLabel(ym, true)}</h2>
          <button className="cal-arrow" onClick={() => setYm(addMonths(ym, 1))} aria-label="Next month">
            ›
          </button>
        </div>
        <div className="cal-meta">
          <span>
            <strong>{monthOrders.length}</strong> {monthOrders.length === 1 ? 'cake' : 'cakes'}
          </span>
          <span>
            <strong>{money(monthRevenue)}</strong> booked
          </span>
          {ym !== today.slice(0, 7) && (
            <button className="btn btn-small btn-quiet" onClick={() => setYm(today.slice(0, 7))}>
              Back to today
            </button>
          )}
        </div>
      </header>

      <div className="cal-grid" role="grid" aria-label={`Cakes in ${monthLabel(ym, true)}`}>
        {WEEKDAYS.map((w) => (
          <div key={w} className="cal-weekday" role="columnheader">
            <span className="cal-wd-long">{w}</span>
            <span className="cal-wd-short" aria-hidden="true">
              {w[0]}
            </span>
          </div>
        ))}

        {cells.map((cell) => {
          const isToday = cell.ymd === today
          const count = cell.orders.length
          return (
            <div
              key={cell.ymd}
              role="gridcell"
              className={[
                'cal-cell',
                cell.inMonth ? '' : 'cal-out',
                isToday ? 'cal-today' : '',
                selected === cell.ymd ? 'cal-selected' : '',
                count > 0 ? 'cal-has' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <button
                className="cal-daybtn"
                onClick={() => setSelected(selected === cell.ymd ? '' : cell.ymd)}
                aria-label={`${cell.day} — ${count} ${count === 1 ? 'cake' : 'cakes'}`}
              >
                <span className="cal-daynum">{cell.day}</span>
                {/* a workload bar, so a heavy day is visible at a glance */}
                {count > 0 && (
                  <span className="cal-load" aria-hidden="true">
                    <span style={{ width: `${(count / busiest) * 100}%` }} />
                  </span>
                )}
              </button>

              <div className="cal-items">
                {cell.orders.slice(0, 3).map((o) => (
                  <button
                    key={o.id}
                    className={`cal-item ${o.status === 'completed' ? 'cal-item-done' : ''}`}
                    onClick={() => onOpen(o)}
                    title={`${o.customerName} · ${o.size} ${o.flavour}${
                      o.pickupTime ? ` · ${formatTime(o.pickupTime)}` : ''
                    }`}
                  >
                    {o.pickupTime && <em>{formatTime(o.pickupTime).replace(':00', '')}</em>}
                    {o.customerName}
                  </button>
                ))}
                {count > 3 && (
                  <button className="cal-more" onClick={() => setSelected(cell.ymd)}>
                    +{count - 3} more
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* the selected day, spelled out in full */}
      {selectedCell && (
        <section className="cal-day">
          <header>
            <h3>
              {new Date(
                Number(selectedCell.ymd.slice(0, 4)),
                Number(selectedCell.ymd.slice(5, 7)) - 1,
                selectedCell.day
              ).toLocaleDateString('en-CA', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
            </h3>
            <button className="btn btn-small btn-tint" onClick={() => onNewOn(selectedCell.ymd)}>
              + Cake for this day
            </button>
          </header>
          {selectedCell.orders.length === 0 ? (
            <p className="hint">Nothing booked. A free day.</p>
          ) : (
            <ul className="cal-daylist">
              {selectedCell.orders.map((o) => (
                <li key={o.id}>
                  <button className="log-row" onClick={() => onOpen(o)}>
                    <span className="log-main">
                      <strong>
                        {o.customerName}
                        {o.status === 'completed' && <em className="log-tag">picked up</em>}
                      </strong>
                      <small>
                        {o.size} {o.flavour}
                        {o.pickupTime ? ` · ${formatTime(o.pickupTime)}` : ''}
                        {o.cakeText ? ` · "${o.cakeText}"` : ''}
                      </small>
                    </span>
                    <span className="log-amount">{money(o.price)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
