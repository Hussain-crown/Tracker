// Server-side Web Push utility.
// Requires env vars: NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
// Generate a key pair once: node -e "const wp=require('web-push'); console.log(wp.generateVAPIDKeys())"
import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'placeholder',
)

let _vapidSet = false
function initVapid(): boolean {
  const pub  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  const subj = process.env.VAPID_SUBJECT || 'mailto:admin@example.com'
  if (!pub || !priv) return false
  if (!_vapidSet) { webpush.setVapidDetails(subj, pub, priv); _vapidSet = true }
  return true
}

export async function sendPushToUser(
  userId: string,
  title: string,
  body: string,
  url = '/',
): Promise<{ sent: number; failed: number }> {
  if (!initVapid()) return { sent: 0, failed: 0 }

  const { data: subs, error } = await sb
    .from('push_subscriptions')
    .select('id, subscription, endpoint')
    .eq('user_id', userId)
  if (error || !subs?.length) return { sent: 0, failed: 0 }

  let sent = 0; let failed = 0
  const stale: string[] = []

  await Promise.allSettled(subs.map(async (row) => {
    try {
      await webpush.sendNotification(
        row.subscription as webpush.PushSubscription,
        JSON.stringify({ title, body, url }),
        { TTL: 86400 },
      )
      sent++
    } catch (e: any) {
      if (e.statusCode === 410 || e.statusCode === 404) {
        stale.push(row.id)
      } else {
        console.error('push send failed (non-stale):', e.statusCode ?? e.message, row.endpoint)
      }
      failed++
    }
  }))

  if (stale.length) {
    await sb.from('push_subscriptions').delete().in('id', stale)
  }
  return { sent, failed }
}
