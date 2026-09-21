import { useMemo, useState } from 'react'
import type { CakeOrder } from '../types'
import { daysUntil, formatDate, money } from '../dates'

export interface CustomerProfile {
  key: string
  name: string
  phone: string
  orders: CakeOrder[]
  total: number
  count: number
  avg: number
  firstDate: string
  lastDate: string
  topFlavour: string
  topSize: string
  owed: number
  upcoming: number
}

/** Group orders into people. Matched on name, case- and spacing-insensitive. */
export function buildProfiles(orders: CakeOrder[]): CustomerProfile[] {
  const map = new Map<string, CakeOrder[]>()
  for (const o of orders) {
    const key = o.customerName.trim().toLowerCase().replace(/\s+/g, ' ')
    if (!key) continue
    map.set(key, [...(map.get(key) ?? []), o])
  }

  const commonest = (vals: string[]) => {
    const counts = new Map<string, number>()
    for (const v of vals) if (v) counts.set(v, (counts.get(v) ?? 0) + 1)
    let best = ''
    let n = 0
    for (const [v, c] of counts) if (c > n) [best, n] = [v, c]
    return best
  }

  return [...map.entries()]
    .map(([key, list]) => {
      // oldest first; `newest` is the same orders the other way round
      const oldestFirst = [...list].sort((a, b) => a.pickupDate.localeCompare(b.pickupDate))
      const newestFirst = [...oldestFirst].reverse()
      const total = list.reduce((s, o) => s + (Number(o.price) || 0), 0)
      /*
       * These used to read off one array that was reversed in place partway
       * through this literal, so first/last were only correct because of the
       * order the properties happened to be written in. Two named arrays
       * instead — moving a line can't silently swap a customer's dates.
       */
      return {
        key,
        // use their most recent spelling of their own name
        name: newestFirst[0].customerName.trim(),
        phone: commonest(list.map((o) => o.customerPhone.trim())),
        orders: newestFirst,
        total,
        count: list.length,
        avg: total / list.length,
        firstDate: oldestFirst[0].pickupDate,
        lastDate: newestFirst[0].pickupDate,
        topFlavour: commonest(list.map((o) => o.flavour)),
        topSize: commonest(list.map((o) => o.size)),
        owed: list
          .filter((o) => o.status === 'completed' && !o.balancePaid)
          .reduce((s, o) => s + Math.max(0, (Number(o.price) || 0) - (Number(o.depositAmount) || 0)), 0),
        upcoming: list.filter((o) => o.status !== 'completed' && daysUntil(o.pickupDate) >= 0).length,
      }
    })
    .sort((a, b) => b.total - a.total)
}

type Sort = 'spent' | 'orders' | 'recent' | 'name'

const SORTS: { value: Sort; label: string }[] = [
  { value: 'spent', label: 'Spent most' },
  { value: 'orders', label: 'Most orders' },
  { value: 'recent', label: 'Most recent' },
  { value: 'name', label: 'A–Z' },
]

export function CustomersView({
  orders,
  onOpen,
  onRepeat,
}: {
  orders: CakeOrder[]
  onOpen: (o: CakeOrder) => void
  onRepeat: (o: CakeOrder) => void
}) {
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<Sort>('spent')
  const [open, setOpen] = useState<string>('')

  const profiles = useMemo(() => buildProfiles(orders), [orders])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = q
      ? profiles.filter((p) => `${p.name} ${p.phone}`.toLowerCase().includes(q))
      : [...profiles]
    return list.sort((a, b) => {
      if (sort === 'orders') return b.count - a.count
      if (sort === 'recent') return b.lastDate.localeCompare(a.lastDate)
      if (sort === 'name') return a.name.localeCompare(b.name)
      return b.total - a.total
    })
  }, [profiles, search, sort])

  const repeat = profiles.filter((p) => p.count > 1)
  const repeatShare = profiles.length ? repeat.length / profiles.length : 0
  const repeatRevenue = repeat.reduce((s, p) => s + p.total, 0)
  const allRevenue = profiles.reduce((s, p) => s + p.total, 0)

  if (profiles.length === 0) {
    return (
      <div className="empty">
        <span className="empty-mark" aria-hidden="true">
          ◌
        </span>
        <p>No customers yet — log a cake and they'll appear here.</p>
      </div>
    )
  }

  return (
    <div className="customers">
      <div className="kpi-row">
        <div className="stat">
          <p className="stat-label">People</p>
          <p className="stat-value">{profiles.length}</p>
          <p className="stat-sub">{repeat.length} have ordered more than once</p>
        </div>
        <div className="stat">
          <p className="stat-label">Repeat customers</p>
          <p className="stat-value">{Math.round(repeatShare * 100)}%</p>
          <p className="stat-sub">
            {allRevenue > 0 ? `${Math.round((repeatRevenue / allRevenue) * 100)}% of your revenue` : '—'}
          </p>
        </div>
        <div className="stat">
          <p className="stat-label">Best customer</p>
          <p className="stat-value stat-value-sm">{profiles[0].name}</p>
          <p className="stat-sub">
            {money(profiles[0].total)} across {profiles[0].count}{' '}
            {profiles[0].count === 1 ? 'cake' : 'cakes'}
          </p>
        </div>
        <div className="stat">
          <p className="stat-label">Average customer</p>
          <p className="stat-value">{money(allRevenue / profiles.length)}</p>
          <p className="stat-sub">lifetime, across all their cakes</p>
        </div>
      </div>

      <div className="toolbar">
        <div className="segmented seg-wide" role="tablist" aria-label="Sort customers">
          {SORTS.map((s) => (
            <button
              key={s.value}
              role="tab"
              aria-selected={sort === s.value}
              className={sort === s.value ? 'seg-active' : ''}
              onClick={() => setSort(s.value)}
            >
              {s.label}
            </button>
          ))}
        </div>
        <input
          className="search"
          type="search"
          placeholder="Search a name or number…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {visible.length === 0 ? (
        <p className="empty">Nobody matches that.</p>
      ) : (
        <ul className="cust-list">
          {visible.map((p) => {
            const isOpen = open === p.key
            return (
              <li key={p.key} className={`cust ${isOpen ? 'cust-open' : ''}`}>
                <button className="cust-head" onClick={() => setOpen(isOpen ? '' : p.key)} aria-expanded={isOpen}>
                  <span className="cust-avatar" aria-hidden="true">
                    {p.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="cust-main">
                    <strong>
                      {p.name}
                      {p.count > 1 && <em className="cust-badge">{p.count}× regular</em>}
                      {p.upcoming > 0 && <em className="cust-badge cust-badge-soon">cake coming up</em>}
                      {p.owed > 0 && <em className="cust-badge cust-badge-owed">owes {money(p.owed)}</em>}
                    </strong>
                    <small>
                      {p.topFlavour && `Usually ${p.topFlavour}`}
                      {p.topSize && ` · ${p.topSize}`}
                      {` · last cake ${formatDate(p.lastDate)}`}
                    </small>
                  </span>
                  <span className="cust-total">
                    {money(p.total)}
                    <small>{p.count === 1 ? '1 cake' : `${p.count} cakes`}</small>
                  </span>
                  <span className="cust-chev" aria-hidden="true">
                    {isOpen ? '⌃' : '⌄'}
                  </span>
                </button>

                {isOpen && (
                  <div className="cust-body">
                    <div className="cust-facts">
                      <div>
                        <dt>Lifetime</dt>
                        <dd>{money(p.total)}</dd>
                      </div>
                      <div>
                        <dt>Average cake</dt>
                        <dd>{money(p.avg)}</dd>
                      </div>
                      <div>
                        <dt>First cake</dt>
                        <dd>{formatDate(p.firstDate)}</dd>
                      </div>
                      <div>
                        <dt>Phone</dt>
                        <dd>
                          {p.phone ? (
                            <a href={`tel:${p.phone.replace(/[^\d+]/g, '')}`}>{p.phone}</a>
                          ) : (
                            '—'
                          )}
                        </dd>
                      </div>
                    </div>

                    <div className="cust-actions">
                      <button className="btn btn-primary" onClick={() => onRepeat(p.orders[0])}>
                        Log another like their last one
                      </button>
                      {p.phone && (
                        <a className="btn btn-tint" href={`sms:${p.phone.replace(/[^\d+]/g, '')}`}>
                          Text {p.name.split(' ')[0]}
                        </a>
                      )}
                    </div>

                    <ul className="log">
                      {p.orders.map((o) => (
                        <li key={o.id}>
                          <button className="log-row" onClick={() => onOpen(o)}>
                            <span className="log-main">
                              <strong>
                                {o.size} {o.flavour}
                                {o.status === 'completed' && <em className="log-tag">picked up</em>}
                              </strong>
                              <small>
                                {formatDate(o.pickupDate)}
                                {o.cakeText ? ` · "${o.cakeText}"` : ''}
                              </small>
                            </span>
                            <span className="log-amount">{money(o.price)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
