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
          // A deploy rotates chunk hashes -- a stale cached HTML page can
          // reference a chunk that no longer exists, 404s, and (with no
          // .ok check) that 404 would get cached forever, permanently
          // white-screening the app for that client until they manually
          // clear site data. Only cache real, successful responses.
          if (response.ok) {
            const toCache = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, toCache))
          }
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

// A 'sync' handler used to live here, flushing an IndexedDB store called
// 'habit-queue' to a route, /api/habits/sync, that has never existed in
// this codebase. fetch() resolves (doesn't throw) on a 404, so the queued
// item was deleted from IndexedDB immediately after the failed POST --
// silent, permanent data loss on every single sync attempt. Nothing in the
// app ever wrote to 'habit-queue' either: Habits.tsx's real offline queue
// lives in localStorage('habits_offline_queue') and is flushed by the page
// itself on the browser's 'online' event, not through this handler. Removed
// entirely rather than "fixed" -- implementing this endpoint for real would
// mean duplicating the offline-queue mechanism the app already has working,
// for a benefit (background sync while the tab is closed) this app doesn't
// currently rely on anywhere.
