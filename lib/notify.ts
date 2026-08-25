import { createClient } from '@supabase/supabase-js'
import * as Sentry from '@sentry/nextjs'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'placeholder',
)

// Best-effort admin alert via Gmail. Never throws — callers must not fail due to alerting.
export async function notifyAdminError(subject: string, body: string): Promise<void> {
  try {
    const { data: metaRows } = await sb.from('meta')
      .select('value,user_id')
      .eq('key', 'booking_admin_email')
      .order('updated_at', { ascending: false })
      .limit(1)
    const adminEmail = metaRows?.[0]?.value
    const adminUserId = metaRows?.[0]?.user_id || process.env.ADMIN_USER_ID
    if (!adminEmail || !adminUserId) return
    if (!EMAIL_RE.test(adminEmail)) {
      Sentry.captureException(new Error(`notifyAdminError: invalid adminEmail in meta: "${adminEmail}"`))
      return
    }

    const { data: tokenRows } = await sb.from('google_tokens')
      .select('user_id,access_token,refresh_token,expiry')
      .eq('user_id', adminUserId)
      .limit(1)
    if (!tokenRows?.[0]) return

    let { access_token: accessToken, refresh_token: refreshToken, expiry, user_id: userId } = tokenRows[0]

    if (!expiry || Date.now() > expiry - 60000) {
      let refreshed = false
      try {
        const r = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '',
            client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
          }),
          signal: AbortSignal.timeout(10000),
        })
        const ref = await r.json()
        if (r.ok && ref.access_token) {
          accessToken = ref.access_token
          refreshed = true // token is valid — persist best-effort, don't block on DB write
          sb.from('google_tokens').update({
            access_token: ref.access_token,
            expiry: Date.now() + (ref.expires_in ?? 3600) * 1000,
            ...(ref.refresh_token ? { refresh_token: ref.refresh_token } : {}),
            updated_at: new Date().toISOString(),
          }).eq('user_id', userId).then(({ error: dbErr }) => {
            if (dbErr) console.error('notifyAdminError: token DB persist failed:', dbErr.message)
          })
        }
      } catch {}
      if (!refreshed) {
        Sentry.captureException(new Error('notifyAdminError: token refresh failed'), { extra: { subjectLength: subject.length } })
        return
      }
    }

    const safeEmail = adminEmail.replace(/[\r\n]/g, '')
    const encSubject = '=?UTF-8?B?' + Buffer.from(subject, 'utf-8').toString('base64') + '?='
    const raw = [
      `To: ${safeEmail}`,
      `Subject: ${encSubject}`,
      `MIME-Version: 1.0`,
      `Content-Type: text/plain; charset=utf-8`,
      ``,
      body,
    ].join('\r\n')
    const encoded = Buffer.from(raw).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

    const sendRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw: encoded }),
      signal: AbortSignal.timeout(10000),
    })
    if (!sendRes.ok) {
      const errText = await sendRes.text().catch(() => '')
      Sentry.captureException(new Error(`notifyAdminError Gmail send failed: ${sendRes.status} ${errText.slice(0, 200)}`))
    }
  } catch (e: unknown) {
    Sentry.captureException(e)
  }
}
