/* Zayaka Cake Logger — offline support.
 *
 * Written for a kitchen with patchy signal, and for a free host that puts the
 * server to sleep. Three rules:
 *
 *   1. Hashed build assets are immutable, so serve them from cache instantly.
 *   2. Pages and API reads go to the network first (so a new deploy and fresh
 *      orders always win), but fall back to the last good copy when the
 *      network is slow or gone.
 *   3. Anything that changes data (POST/PUT/DELETE) is never cached or
 *      replayed — a cake must never be logged twice.
 */

const VERSION = 'v2'
const SHELL = `zayaka-shell-${VERSION}`
const DATA = `zayaka-data-${VERSION}`

// Render's free tier can take ~30s to wake. Wait a beat, then show cached
// data rather than leaving her looking at a blank screen.
const NET_TIMEOUT = 4000

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png']))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== SHELL && k !== DATA).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  )
})

function timedFetch(request, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('slow')), ms)
    fetch(request).then(
      (res) => {
        clearTimeout(timer)
        resolve(res)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      }
    )
  })
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return // never touch writes

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // ── app shell: network-first so a fresh deploy is picked up ──
  if (request.mode === 'navigate') {
    event.respondWith(
      timedFetch(request, NET_TIMEOUT)
        .then((res) => {
          const copy = res.clone()
          caches.open(SHELL).then((c) => c.put('/', copy))
          return res
        })
        .catch(() => caches.match('/').then((r) => r || caches.match(request)))
    )
    return
  }

  // ── hashed build assets are immutable: cache-first ──
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            const copy = res.clone()
            caches.open(SHELL).then((c) => c.put(request, copy))
            return res
          })
      )
    )
    return
  }

  // ── API reads and uploaded photos: network-first, cache as a safety net ──
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) {
    event.respondWith(
      timedFetch(request, NET_TIMEOUT)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(DATA).then((c) => c.put(request, copy))
          }
          return res
        })
        .catch(() => caches.match(request).then((hit) => hit || Promise.reject(new Error('offline'))))
    )
  }
})
