import { createClient } from '@supabase/supabase-js'

// Sliding-window rate limiter backed by the same Supabase rate_limits table /
// rate_limit_hit RPC as the main OS app, so the limit is enforced across all
// serverless instances instead of only the one warm instance that happened
// to handle a given request. Falls back to a module-level in-memory counter
// (best-effort, single-instance only) if the DB call fails.

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'placeholder',
)

interface Window {
  count: number
  resetAt: number
}
const fallbackStore = new Map<string, Window>()
let callsSincePrune = 0
function fallbackCheck(key: string, limit: number, windowMs: number): boolean {
  if (++callsSincePrune >= 100) {
    callsSincePrune = 0
    const now = Date.now()
    for (const [k, v] of fallbackStore) if (v.resetAt < now) fallbackStore.delete(k)
  }
  const now = Date.now()
  const entry = fallbackStore.get(key)
  if (!entry || entry.resetAt < now) {
    fallbackStore.set(key, { count: 1, resetAt: now + windowMs })
    return false
  }
  entry.count++
  return entry.count > limit
}

export async function isRateLimited(key: string, limit: number, windowMs: number): Promise<boolean> {
  try {
    const { data, error } = await sb.rpc('rate_limit_hit', { p_key: key, p_window_ms: windowMs })
    if (error) throw error
    return (data as number) > limit
  } catch (e: any) {
    console.error('rate_limit_hit RPC failed, using in-memory fallback:', e?.message ?? e)
    return fallbackCheck(key, limit, windowMs)
  }
}

export function getClientIp(req: Request): string {
  const r = req as any
  const h = (name: string): string => r.headers?.get?.(name) ?? ''
  return (
    r.ip ||
    h('x-real-ip') ||
    h('cf-connecting-ip') ||
    (h('x-forwarded-for') || '').split(',').at(-1)?.trim() ||
    'unknown'
  )
}
