import { supabase } from './supabase/client'

export async function authFetch(url: string, opts: RequestInit = {}): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession()
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
