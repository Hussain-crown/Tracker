'use client'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase/client'

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

async function subscribeAndStore(userId: string): Promise<void> {
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!vapidKey) return
  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    })
  }
  const { error } = await supabase.from('push_subscriptions').upsert({
    user_id: userId,
    endpoint: sub.endpoint,
    subscription: sub.toJSON(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'endpoint' })
  if (error) console.error('push_subscriptions upsert error:', error.message)
}

function pushSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window
}

// Push permission must be requested from a real, direct user gesture (a tap
// on a button) -- iOS Safari and most mobile browsers silently refuse (never
// show the prompt, never error) a Notification.requestPermission() call made
// from code that runs on its own, such as a useEffect on mount. That's what
// this used to do, which is why the permission dialog never appeared at all
// on a phone even though the exact same code worked when tested on desktop
// Chrome. Requesting permission is now a separate function the caller must
// invoke from an onClick.
export function usePushSubscription(userId: string | null) {
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default')

  useEffect(() => {
    if (!pushSupported()) { setPermission('unsupported'); return }
    setPermission(Notification.permission)
    // Already granted (e.g. a previous visit) -- re-syncing an existing
    // subscription needs no user gesture, safe to do on every load.
    if (userId && Notification.permission === 'granted') {
      subscribeAndStore(userId).catch(e => console.error('usePushSubscription resync error:', e))
    }
  }, [userId])

  const requestAndSubscribe = useCallback(async () => {
    if (!userId || !pushSupported()) return false
    try {
      const perm = await Notification.requestPermission()
      setPermission(perm)
      if (perm !== 'granted') return false
      await subscribeAndStore(userId)
      return true
    } catch (e) {
      console.error('requestAndSubscribe error:', e)
      return false
    }
  }, [userId])

  return { permission, requestAndSubscribe }
}
