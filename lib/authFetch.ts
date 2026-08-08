import { supabase } from './supabase/client'

export async function authFetch(url: string, opts: RequestInit = {}): Promise<Response> {
  let { data: { session } } = await supabase.auth.getSession()
  // Force refresh if token is within 60 s of expiry so verifyUser never gets a stale JWT
  if (session?.expires_at && session.expires_at * 1000 < Date.now() + 60000) {
    const { data, error: refreshError } = await supabase.auth.refreshSession()
    if (refreshError || !data.session) throw new Error(`Token refresh failed: ${refreshError?.message ?? 'no session'}`)
    session = data.session
  }
  const token = session?.access_token ?? ''
  return fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...((opts.headers as Record<string, string>) || {}),
      // Always override Authorization last so callers cannot spoof the session token
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
}
