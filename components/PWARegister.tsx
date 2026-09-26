'use client'
import { useEffect } from 'react'

export default function PWARegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return

    // Cache cleanup lives solely in sw.js's own 'activate' handler (it
    // already deletes every cache that isn't its current CACHE_NAME on
    // every activation) -- this used to duplicate that logic with its own
    // hardcoded copy of the cache name, and the two had no way to stay in
    // sync: bump the version in sw.js without also updating this constant
    // and the app deletes its own active cache on the very next load.
    // Removing the second copy removes the two-sources-of-truth problem
    // instead of trying to keep them synchronized.
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then((reg) => setInterval(() => reg.update(), 60000))
      .catch(() => {})

    // Listen for online/offline events
    const handleOnline = () => {
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
