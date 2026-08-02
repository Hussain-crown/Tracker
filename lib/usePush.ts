'use client'
import { useEffect } from 'react'
import { supabase } from './supabase/client'

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

// Requests push permission and stores the subscription in Supabase.
// Runs once when userId becomes available; safe to call on every page load
// because getSubscription() returns the existing sub without re-prompting.
export function usePushSubscription(userId: string | null) {
  useEffect(() => {
    if (!userId) return
    if (typeof window === 'undefined') return
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return

    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    if (!vapidKey) return

    let active = true

    async function subscribe() {
      try {
        const reg = await navigator.serviceWorker.ready
        let sub = await reg.pushManager.getSubscription()
        if (!sub) {
          const perm = await Notification.requestPermission()
          if (perm !== 'granted') return
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidKey!),
          })
        }
        if (!active) return
        // Store directly via Supabase anon client — RLS ensures user_id scoping
        const { error } = await supabase.from('push_subscriptions').upsert({
          user_id: userId,
          endpoint: sub.endpoint,
          subscription: sub.toJSON(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'endpoint' })
        if (error) console.error('push_subscriptions upsert error:', error.message)
      } catch (e) {
        console.error('usePushSubscription error:', e)
      }
    }

    subscribe()
    return () => { active = false }
  }, [userId])
}
