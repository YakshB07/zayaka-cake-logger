import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CakeOrder, NewOrder } from './types'
import { api } from './api'
import { OrderForm } from './components/OrderForm'
import { OrderCard } from './components/OrderCard'
import { BusinessPage } from './components/BusinessPage'
import { CalendarView } from './components/CalendarView'
import { CustomersView } from './components/CustomersView'
import { BakePlan } from './components/BakePlan'
import { daysUntil, todayYmd } from './dates'

type Filter = 'upcoming' | 'today' | 'completed' | 'all'
type View = 'orders' | 'calendar' | 'customers' | 'business'

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'today', label: 'Today' },
  { value: 'completed', label: 'Picked up' },
  { value: 'all', label: 'All' },
]

const VIEWS: Array<{ value: View; label: string; sub: string }> = [
  { value: 'orders', label: 'Cakes', sub: 'Cake Orders' },
  { value: 'calendar', label: 'Calendar', sub: 'Planning' },
  { value: 'customers', label: 'Customers', sub: 'Your People' },
  { value: 'business', label: 'Business', sub: 'Business' },
]

/** Whatever went wrong, as a sentence rather than an object. */
const msg = (err: unknown) => (err instanceof Error ? err.message : String(err))

/** A repeat order keeps the cake, drops anything tied to the last occasion. */
function prefillFrom(o: CakeOrder): CakeOrder {
  return {
    ...o,
    pickupDate: '',
    pickupTime: '',
    depositAmount: 0,
    depositMethod: '',
    balanceMethod: '',
    balancePaid: false,
    status: 'upcoming',
  }
}

export default function App() {
  const [orders, setOrders] = useState<CakeOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<CakeOrder | null>(null)
  const [prefill, setPrefill] = useState<CakeOrder | null>(null)
  const [filter, setFilter] = useState<Filter>('upcoming')
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState('')
  const [view, setView] = useState<View>('orders')
  const [planMode, setPlanMode] = useState<'month' | 'plan'>('month')
  /*
   * Orders with a save in flight. "Picked up" and "Mark paid" only change on
   * the server, so on a slow connection nothing happens for a second or two —
   * a second impatient tap would toggle "Picked up" straight back off again.
   */
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set())
  /*
   * The same set in a ref. Reading it from state meant reading the value
   * captured at render time, so two taps landing before React re-rendered both
   * saw it empty and both went through — the exact case this exists to stop.
   */
  const busyRef = useRef<Set<string>>(new Set())
  /** set when the order list can't be loaded at all */
  const [loadError, setLoadError] = useState('')

  const runOnce = async (id: string, fn: () => Promise<unknown>) => {
    if (busyRef.current.has(id)) return
    busyRef.current.add(id)
    setBusy(new Set(busyRef.current))
    try {
      await fn()
    } catch (err) {
      // these all save on the server; failing silently looked like nothing
      // happened at all, and she would just tap again
      showToast(`Couldn't save — ${msg(err)}`)
    } finally {
      busyRef.current.delete(id)
      setBusy(new Set(busyRef.current))
    }
  }

  const refresh = useCallback(async () => {
    try {
      setOrders(await api.listOrders())
      setLoadError('')
    } catch (err) {
      // Render's free tier sleeps and the first request can time out. Without
      // this the app showed the cheerful "No cakes logged yet" empty state —
      // as though every order had been deleted.
      setLoadError(msg(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // one timer, not one per toast — a second message used to inherit the first
  // one's countdown and vanish almost immediately
  const toastTimer = useRef(0)
  const showToast = (message: string) => {
    setToast(message)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), 3200)
  }

  const closeForm = () => {
    setFormOpen(false)
    setEditing(null)
    setPrefill(null)
  }

  const handleSave = async (data: NewOrder) => {
    if (editing) {
      await api.updateOrder(editing.id, data)
      showToast('Order updated ✓')
    } else {
      await api.createOrder(data)
      showToast('Cake logged ✓')
    }
    closeForm()
    await refresh()
  }

  // Marking a cake picked up settles it: the balance is handed over at the
  // door, so it counts as paid. If it wasn't, "Mark unpaid" on the card puts
  // it back and it starts showing as overdue.
  const handleComplete = (order: CakeOrder) =>
    runOnce(order.id, async () => {
      const collecting = order.status !== 'completed'
      await api.updateOrder(order.id, {
        status: collecting ? 'completed' : 'upcoming',
        balancePaid: collecting ? true : order.balancePaid,
      })
      await refresh()
    })

  const handleTogglePaid = (order: CakeOrder) =>
    runOnce(order.id, async () => {
      await api.updateOrder(order.id, { balancePaid: !order.balancePaid })
      showToast(order.balancePaid ? 'Marked as still owing' : 'Marked as paid ✓')
      await refresh()
    })

  const handleDelete = async (order: CakeOrder) => {
    if (
      !window.confirm(
        `Delete ${order.customerName}'s ${order.flavour} cake order?\n\nThis also removes any design photos on it, and can't be undone.`
      )
    )
      return
    await runOnce(order.id, async () => {
      await api.deleteOrder(order.id)
      showToast('Order deleted')
      await refresh()
    })
  }

  const handleRemind = (order: CakeOrder) =>
    runOnce(order.id, async () => {
      const res = await api.remindNow(order.id)
      showToast(res.ok ? 'Reminder texted ✓' : `Not sent — ${res.detail}`)
      await refresh()
    })

  const openEdit = (o: CakeOrder) => {
    setEditing(o)
    setPrefill(null)
    setFormOpen(true)
  }

  const openRepeat = (o: CakeOrder) => {
    setEditing(null)
    setPrefill(prefillFrom(o))
    setFormOpen(true)
  }

  const openNew = (onDate?: string) => {
    setEditing(null)
    setPrefill(
      onDate
        ? ({ pickupDate: onDate } as CakeOrder)
        : null
    )
    setFormOpen(true)
  }

  const today = todayYmd()

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = orders.filter((o) => {
      if (filter === 'upcoming') return o.status !== 'completed'
      if (filter === 'today') return o.pickupDate === today && o.status !== 'completed'
      if (filter === 'completed') return o.status === 'completed'
      return true
    })
    if (q) {
      list = list.filter((o) =>
        [o.customerName, o.customerPhone, o.flavour, o.cakeText, o.designNotes, o.size]
          .join(' ')
          .toLowerCase()
          .includes(q)
      )
    }
    return list.sort((a, b) =>
      (a.pickupDate + (a.pickupTime || '99')).localeCompare(b.pickupDate + (b.pickupTime || '99'))
    )
  }, [orders, filter, search, today])

  const dueSoon = orders.filter((o) => {
    if (o.status === 'completed') return false
    const n = daysUntil(o.pickupDate)
    return n >= 0 && n <= 2
  })

  const current = VIEWS.find((v) => v.value === view) ?? VIEWS[0]

  return (
    <div className="app">
      <header className="header no-print">
        <div className="header-inner">
          {/* Row 1 never competes with the tabs for space, so the header can't
              overflow and force the phone to widen its layout viewport. */}
          <div className="header-top">
            <div className="brand">
              <h1>Zayaka</h1>
              <span className="brand-sub">{current.sub}</span>
            </div>

            {view !== 'business' && (
              <button className="btn btn-primary" onClick={() => openNew()}>
                <span className="btn-plus" aria-hidden="true">
                  +
                </span>
                New Order
              </button>
            )}
          </div>

          <nav className="view-switch" aria-label="Sections">
            {VIEWS.map((v) => (
              <button
                key={v.value}
                className={view === v.value ? 'view-active' : ''}
                aria-current={view === v.value ? 'page' : undefined}
                onClick={() => setView(v.value)}
              >
                {v.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="main">
        {view === 'business' && (
          <BusinessPage orders={orders} onToast={showToast} onOrdersChanged={refresh} />
        )}

        {view === 'customers' && (
          <CustomersView orders={orders} onOpen={openEdit} onRepeat={openRepeat} />
        )}

        {view === 'calendar' && (
          <>
            <div className="segmented seg-wide no-print" role="tablist" aria-label="Planning view">
              <button
                role="tab"
                aria-selected={planMode === 'month'}
                className={planMode === 'month' ? 'seg-active' : ''}
                onClick={() => setPlanMode('month')}
              >
                Month
              </button>
              <button
                role="tab"
                aria-selected={planMode === 'plan'}
                className={planMode === 'plan' ? 'seg-active' : ''}
                onClick={() => setPlanMode('plan')}
              >
                Bake plan
              </button>
            </div>
            {planMode === 'month' ? (
              <CalendarView orders={orders} onOpen={openEdit} onNewOn={openNew} />
            ) : (
              <BakePlan orders={orders} onOpen={openEdit} />
            )}
          </>
        )}

        {view === 'orders' && (
          <>
            {dueSoon.length > 0 && (
              <section className="due-strip" aria-label="Cakes due soon">
                <h2 className="section-label">Coming up</h2>
                <div className="due-chips">
                  {dueSoon.map((o) => {
                    const n = daysUntil(o.pickupDate)
                    return (
                      <button
                        key={o.id}
                        className={`due-chip due-${n === 0 ? 'today' : n === 1 ? 'tomorrow' : 'later'}`}
                        onClick={() => {
                          setFilter('all')
                          setSearch(o.customerName)
                        }}
                      >
                        <strong>{n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : 'In 2 days'}</strong>
                        <span>{o.customerName}</span>
                        <small>
                          {o.size} {o.flavour}
                        </small>
                      </button>
                    )
                  })}
                </div>
              </section>
            )}

            <div className="toolbar">
              <div className="segmented" role="tablist" aria-label="Filter orders">
                {FILTERS.map((f) => (
                  <button
                    key={f.value}
                    role="tab"
                    aria-selected={filter === f.value}
                    className={filter === f.value ? 'seg-active' : ''}
                    onClick={() => setFilter(f.value)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <input
                className="search"
                type="search"
                placeholder="Search name, phone, flavour…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {loading ? (
              <p className="empty">Loading orders…</p>
            ) : loadError ? (
              <div className="empty">
                <span className="empty-mark" aria-hidden="true">
                  ⚠
                </span>
                <p>
                  Couldn't load your cakes — {loadError}.
                  <br />
                  Nothing has been lost; the app just can't reach the server right now.
                </p>
                <button className="btn btn-primary" onClick={() => void refresh()}>
                  Try again
                </button>
              </div>
            ) : visible.length === 0 ? (
              <div className="empty">
                <span className="empty-mark" aria-hidden="true">
                  ◌
                </span>
                <p>{orders.length === 0 ? 'No cakes logged yet.' : 'Nothing matches this view.'}</p>
                {orders.length === 0 && (
                  <button className="btn btn-primary" onClick={() => openNew()}>
                    Log your first cake
                  </button>
                )}
              </div>
            ) : (
              <div className="grid">
                {visible.map((o) => (
                  <OrderCard
                    key={o.id}
                    order={o}
                    onEdit={() => openEdit(o)}
                    onComplete={() => void handleComplete(o)}
                    onDelete={() => void handleDelete(o)}
                    onRemind={() => void handleRemind(o)}
                    onRepeat={() => openRepeat(o)}
                    onTogglePaid={() => void handleTogglePaid(o)}
                    busy={busy.has(o.id)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {formOpen && (
        <OrderForm
          initial={editing ?? prefill ?? undefined}
          isEdit={Boolean(editing)}
          onCancel={closeForm}
          onSave={handleSave}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
