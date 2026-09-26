import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getSbAdmin } from '@/lib/supabase/admin'
import { isRateLimited, getClientIp } from '@/lib/ratelimit'
import { sendPushToUser } from '@/lib/push'
import { secretMatches } from '@/lib/internalAuth'
import { parseBody } from '@/lib/validate'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  userId: z.string(),
  action: z.enum(['approve', 'reject']),
})

function checkAuth(req: Request): NextResponse | null {
  const provided = req.headers.get('x-internal-secret') || ''
  const expected = process.env.INTERNAL_BRIDGE_SECRET || ''
  if (!expected || !secretMatches(provided, expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  return null
}

// Server-to-server only: team_members now lives exclusively in this
// project's database, so Operations' admin UI (Organisation → pending
// members) can no longer read or write it directly — it proxies here.
// GET — list members awaiting approval.
export async function GET(req: Request) {
  if (await isRateLimited(getClientIp(req), 60, 60_000))
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  const authErr = checkAuth(req)
  if (authErr) return authErr

  try {
    const sb = getSbAdmin()
    const { data, error } = await sb
      .from('team_members')
      .select('user_id,name,ibo_number,email,created_at,status')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
    if (error) return NextResponse.json({ error: 'db_error' }, { status: 500 })
    return NextResponse.json({ members: data || [] })
  } catch (e: any) {
    console.error('team/pending GET error:', e)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}

// POST — approve or reject a pending member.
export async function POST(req: Request) {
  if (await isRateLimited(getClientIp(req), 60, 60_000))
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  const authErr = checkAuth(req)
  if (authErr) return authErr

  const parsed = await parseBody(req, bodySchema)
  if (parsed.res) return parsed.res
  const { userId, action } = parsed.data

  try {
    const sb = getSbAdmin()
    if (action === 'approve') {
      const { data, error } = await sb
        .from('team_members')
        .update({ status: 'active', updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('status', 'pending')
        .select()
      if (error) return NextResponse.json({ error: 'db_error' }, { status: 500 })
      if (!data || data.length === 0) return NextResponse.json({ ok: false, error: 'already_processed' }, { status: 409 })
      sendPushToUser(userId, "🎉 You're approved!", 'Your account is now active. Open the tracker to get started.')
        .catch(e => console.error('approval push error:', e))
    } else {
      const { data, error } = await sb.from('team_members').delete().eq('user_id', userId).eq('status', 'pending').select()
      if (error) return NextResponse.json({ error: 'db_error' }, { status: 500 })
      if (!data || data.length === 0) return NextResponse.json({ ok: false, error: 'already_processed' }, { status: 409 })
    }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('team/pending POST error:', e)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
