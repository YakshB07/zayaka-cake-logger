import type { CakeOrder, NewOrder } from './types'

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  return res.json() as Promise<T>
}

export const api = {
  listOrders: () => req<CakeOrder[]>('/api/orders'),

  createOrder: (order: NewOrder) =>
    req<CakeOrder>('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(order),
    }),

  updateOrder: (id: string, patch: Partial<CakeOrder>) =>
    req<CakeOrder>(`/api/orders/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }),

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
}
