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

export async function resolveAdminId(fallback = ''): Promise<string> {
  const envId = (process.env.ADMIN_USER_ID || '').trim()
  if (envId) return envId
  if (fallback) return fallback
  const adminEmail = (process.env.ADMIN_EMAIL || process.env.NEXT_PUBLIC_ADMIN_EMAIL || '').toLowerCase().trim()
  if (adminEmail) {
    let page = 1
    while (page <= 20) {
      const { data } = await sbAdmin.auth.admin.listUsers({ page, perPage: 50 })
      const found = (data?.users || []).find((u: any) => (u.email || '').toLowerCase() === adminEmail)
      if (found) return found.id
      if ((data?.users || []).length < 50) break
      page++
    }
  }
  // Final fallback: look up the admin via the meta table (same approach as book routes)
  const { data: metaRow } = await sbAdmin
    .from('meta')
    .select('user_id')
    .in('key', ['booking_zoom_link', 'booking_display_name', 'booking_admin_email'])
    .order('updated_at', { ascending: false })
    .limit(1)
  return metaRow?.[0]?.user_id ?? ''
}
