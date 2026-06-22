import { createClient } from '@supabase/supabase-js'

// Service-role client for server routes — bypasses RLS, so every route using
// this must verify the caller itself via verifyUser() rather than trusting
// any identity fields the client sends in the request body/query.
export const sbAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function verifyUser(req: Request): Promise<{ id: string; email: string } | null> {
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return null
  const { data, error } = await sbAdmin.auth.getUser(token)
  if (error || !data.user) return null
  return { id: data.user.id, email: (data.user.email || '').toLowerCase() }
}
