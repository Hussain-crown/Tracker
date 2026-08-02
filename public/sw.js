// Growth Tracker PWA Service Worker — standalone app, scope '/'.
// Caches the app shell for offline use and queues habit writes.

const CACHE_NAME = 'track-pwa-v1'

const SHELL_URLS = [
  '/',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(SHELL_URLS).catch(() => {
        // Fail silently if some shell files aren't available yet
      })
    }).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  if (event.request.method !== 'GET') return
  if (url.origin !== self.location.origin) return

  if (
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('supabase') ||
    url.hostname.includes('googleapis')
  ) {
    return
  }

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached
        return fetch(event.request).then((response) => {
          const toCache = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, toCache))
          return response
        })
      })
    )
    return
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const toCache = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, toCache))
        }
        return response
      })
      .catch(() => {
        return caches.match(event.request).then((cached) => {
          if (cached) return cached
          return caches.match('/') || new Response(
            `<html><body style="background:#0d0d12;color:#C8A24A;font-family:system-ui;padding:40px;text-align:center"><h2>Growth Tracker</h2><p>You're offline. Your data is saved locally and will sync when you reconnect.</p></body></html>`,
            { headers: { 'Content-Type': 'text/html' } }
          )
        })
      })
  )
})

// Push notifications
self.addEventListener('push', (event) => {
  let data = { title: 'Business Tracker', body: 'You have a new notification.', url: '/' }
  try { if (event.data) data = { ...data, ...event.data.json() } } catch {}
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: data.url },
      tag: 'tracker-notification',
      renotify: true,
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus()
          client.navigate(url)
          return
        }
      }
      if (clients.openWindow) return clients.openWindow(url)
    })
  )
})

// Background sync — flush queued habit writes when back online
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-habits') {
    event.waitUntil(syncHabits())
  }
})

async function syncHabits() {
  try {
    const db = await openDB()
    const queued = await getAllFromStore(db, 'habit-queue')
    for (const item of queued) {
      try {
        await fetch('/api/habits/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.data),
        })
        await deleteFromStore(db, 'habit-queue', item.id)
      } catch {}
    }
  } catch {}
}

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('growth-tracker', 1)
    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore('habit-queue', { keyPath: 'id', autoIncrement: true })
    }
    req.onsuccess = (e) => resolve(e.target.result)
    req.onerror = reject
  })
}
function getAllFromStore(db, store) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly')
    const req = tx.objectStore(store).getAll()
    req.onsuccess = (e) => resolve(e.target.result)
    req.onerror = reject
  })
}
function deleteFromStore(db, store, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite')
    const req = tx.objectStore(store).delete(id)
    req.onsuccess = resolve
    req.onerror = reject
  })
}
