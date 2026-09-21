import type { CakeOrder, FinanceData, FinanceKind, NewOrder } from './types'
import { normalizeFinance, normalizeOrder, normalizeOrders } from './normalize'

/**
 * The server answers every failure with {"error": "..."} written for a person.
 * This used to throw the raw body, so she saw `500 {"error":"..."}` — and on a
 * dropped connection fetch rejects with the unhelpful "Failed to fetch".
 */
async function req<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, init)
  } catch {
    throw new Error("can't reach the server — check your internet and try again")
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    let message = ''
    try {
      message = String((JSON.parse(body) as { error?: string }).error ?? '')
    } catch {
      message = ''
    }
    throw new Error(message || `the server said ${res.status}`)
  }
  try {
    return (await res.json()) as T
  } catch {
    throw new Error('the server sent back something unreadable')
  }
}

export const api = {
  listOrders: async () => normalizeOrders(await req<unknown>('/api/orders')),

  createOrder: async (order: NewOrder) =>
    normalizeOrder(await req<unknown>('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(order),
    })),

  updateOrder: async (id: string, patch: Partial<CakeOrder>) =>
    normalizeOrder(await req<unknown>(`/api/orders/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })),

  deleteOrder: (id: string) => req<{ ok: boolean }>(`/api/orders/${id}`, { method: 'DELETE' }),

  // Uploaded one at a time (not batched) so a single request never gets too
  // big for the hosting platform's request-size limit.
  uploadPhotos: async (files: File[]) => {
    const urls: string[] = []
    for (const f of files) {
      const form = new FormData()
      form.append('photos', f)
      const { urls: u } = await req<{ urls: string[] }>('/api/upload', { method: 'POST', body: form })
      urls.push(...u)
    }
    return { urls }
  },

  remindNow: (id: string) =>
    req<{ ok: boolean; detail: string }>(`/api/orders/${id}/remind`, { method: 'POST' }),

  config: () => req<{ smsConfigured: boolean; reminderPhones: string[] }>('/api/config'),

  // ── Business tracker ──
  loadFinance: async () => normalizeFinance(await req<unknown>('/api/finance')),

  createFinance: <K extends FinanceKind>(kind: K, item: unknown) =>
    req<FinanceData[K][number]>(`/api/finance/${kind}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    }),

  updateFinance: <K extends FinanceKind>(kind: K, id: string, patch: unknown) =>
    req<FinanceData[K][number]>(`/api/finance/${kind}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }),

  deleteFinance: (kind: FinanceKind, id: string) =>
    req<{ ok: boolean }>(`/api/finance/${kind}/${id}`, { method: 'DELETE' }),
}
