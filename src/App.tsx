import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CakeOrder, NewOrder } from './types'
import { api } from './api'
import { OrderForm } from './components/OrderForm'
import { OrderCard } from './components/OrderCard'
import { BusinessPage } from './components/BusinessPage'
import { daysUntil, todayYmd } from './dates'

type Filter = 'upcoming' | 'today' | 'completed' | 'all'
type View = 'orders' | 'business'

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'today', label: 'Today' },
  { value: 'completed', label: 'Picked up' },
  { value: 'all', label: 'All' },
]

export default function App() {
  const [orders, setOrders] = useState<CakeOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<CakeOrder | null>(null)
  const [filter, setFilter] = useState<Filter>('upcoming')
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState('')
  const [view, setView] = useState<View>('orders')

  const refresh = useCallback(async () => {
    try {
      setOrders(await api.listOrders())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const showToast = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(''), 3200)
  }

  const handleSave = async (data: NewOrder) => {
    if (editing) {
      await api.updateOrder(editing.id, data)
      showToast('Order updated ✓')
    } else {
      await api.createOrder(data)
      showToast('Cake logged ✓')
    }
    setFormOpen(false)
    setEditing(null)
    await refresh()
  }

  const handleComplete = async (order: CakeOrder) => {
    await api.updateOrder(order.id, {
      status: order.status === 'completed' ? 'upcoming' : 'completed',
      balancePaid: order.status === 'completed' ? order.balancePaid : true,
    })
    await refresh()
  }

  const handleDelete = async (order: CakeOrder) => {
    if (!window.confirm(`Delete ${order.customerName}'s ${order.flavour} cake order? This can't be undone.`)) return
    await api.deleteOrder(order.id)
    showToast('Order deleted')
    await refresh()
  }

  const handleRemind = async (order: CakeOrder) => {
    const res = await api.remindNow(order.id)
    showToast(res.ok ? 'Reminder texted ✓' : `Not sent — ${res.detail}`)
    await refresh()
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

  const openNew = () => {
    setEditing(null)
    setFormOpen(true)
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <div className="brand">
            <h1>Zayaka</h1>
            <span className="brand-sub">{view === 'orders' ? 'Cake Orders' : 'Business'}</span>
          </div>

          <nav className="view-switch" aria-label="Sections">
            <button
              className={view === 'orders' ? 'view-active' : ''}
              aria-current={view === 'orders' ? 'page' : undefined}
              onClick={() => setView('orders')}
            >
              Cakes
            </button>
            <button
              className={view === 'business' ? 'view-active' : ''}
              aria-current={view === 'business' ? 'page' : undefined}
              onClick={() => setView('business')}
            >
              Business
            </button>
          </nav>

          {view === 'orders' && (
            <button className="btn btn-primary" onClick={openNew}>
              <span className="btn-plus" aria-hidden="true">
                +
              </span>
              New Order
            </button>
          )}
        </div>
      </header>

      {view === 'business' ? (
        <main className="main">
          <BusinessPage orders={orders} onToast={showToast} />
        </main>
      ) : (
      <main className="main">
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
        ) : visible.length === 0 ? (
          <div className="empty">
            <span className="empty-mark" aria-hidden="true">
              ◌
            </span>
            <p>{orders.length === 0 ? 'No cakes logged yet.' : 'Nothing matches this view.'}</p>
            {orders.length === 0 && (
              <button className="btn btn-primary" onClick={openNew}>
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
                onEdit={() => {
                  setEditing(o)
                  setFormOpen(true)
                }}
                onComplete={() => void handleComplete(o)}
                onDelete={() => void handleDelete(o)}
                onRemind={() => void handleRemind(o)}
              />
            ))}
          </div>
        )}
      </main>
      )}

      {formOpen && (
        <OrderForm
          initial={editing ?? undefined}
          onCancel={() => {
            setFormOpen(false)
            setEditing(null)
          }}
          onSave={handleSave}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
