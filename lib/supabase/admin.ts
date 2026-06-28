import { createClient } from '@supabase/supabase-js'

// Service-role client for server routes — bypasses RLS, so every route using
// this must verify the caller itself via verifyUser() rather than trusting
// any identity fields the client sends in the request body/query.
let _sbAdmin: ReturnType<typeof createClient> | null = null
export function getSbAdmin() {
  if (!_sbAdmin) {
    _sbAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
  }
  return _sbAdmin
}
// Backwards-compatible alias (lazy)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const sbAdmin: any = new Proxy({} as ReturnType<typeof createClient>, {
  get(_t, prop) { return (getSbAdmin() as any)[prop] },
})

export async function verifyUser(req: Request): Promise<{ id: string; email: string } | null> {
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return null
  const { data, error } = await sbAdmin.auth.getUser(token)
  if (error || !data.user) return null
  return { id: data.user.id, email: (data.user.email || '').toLowerCase() }
}
