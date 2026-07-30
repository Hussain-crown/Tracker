interface Window {
  count: number
  resetAt: number
}

const store = new Map<string, Window>()

let callsSincePrune = 0
function prune() {
  if (++callsSincePrune < 100) return
  callsSincePrune = 0
  const now = Date.now()
  for (const [k, v] of store) {
    if (v.resetAt < now) store.delete(k)
  }
}

export function isRateLimited(key: string, limit: number, windowMs: number): boolean {
  prune()
  const now = Date.now()
  const entry = store.get(key)
  if (!entry || entry.resetAt < now) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return false
  }
  entry.count++
  if (entry.count > limit) return true
  return false
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
