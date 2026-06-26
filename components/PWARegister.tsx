'use client'
import { useEffect } from 'react'

export default function PWARegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return

    // Purge any cache left over from a previous service worker name.
    const CURRENT_CACHE = 'track-pwa-v1'
    caches.keys().then((keys) => {
      keys.forEach((key) => {
        if (key !== CURRENT_CACHE) caches.delete(key)
      })
    }).catch(() => {})

    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then((reg) => setInterval(() => reg.update(), 60000))
      .catch(() => {})

    // Listen for online/offline events
    const handleOnline = () => {
      // Trigger background sync when coming back online
      if ('serviceWorker' in navigator && 'sync' in ServiceWorkerRegistration.prototype) {
        navigator.serviceWorker.ready.then((sw) => {
          return (sw as any).sync.register('sync-habits')
        }).catch(() => {})
      }
      // Dispatch custom event for the app to react to
      window.dispatchEvent(new CustomEvent('app-online'))
    }
    const handleOffline = () => {
      window.dispatchEvent(new CustomEvent('app-offline'))
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return null
}
