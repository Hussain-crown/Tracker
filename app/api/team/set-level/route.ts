import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getSbAdmin } from '@/lib/supabase/admin'
import { isRateLimited, getClientIp } from '@/lib/ratelimit'
import { secretMatches } from '@/lib/internalAuth'
import { parseBody } from '@/lib/validate'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  userId: z.string(),
  level: z.union([z.number(), z.string()]),
})

// Server-to-server only: Operations' admin UI sets a member's level here
// since team_members lives exclusively in this project's database now.
export async function POST(req: Request) {
  if (await isRateLimited(getClientIp(req), 60, 60_000))
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  const provided = req.headers.get('x-internal-secret') || ''
  const expected = process.env.INTERNAL_BRIDGE_SECRET || ''
  if (!expected || !secretMatches(provided, expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const parsed = await parseBody(req, bodySchema)
  if (parsed.res) return parsed.res
  const userId = String(parsed.data.userId || '').trim()
  const level = Number(parsed.data.level)
  if (!userId || !Number.isFinite(level) || level < 1 || level > 10) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 })
  }

  try {
    const sb = getSbAdmin()
    const { data: member, error: memberErr } = await sb.from('team_members').select('user_id').eq('user_id', userId).maybeSingle()
    if (memberErr) return NextResponse.json({ error: 'db_error' }, { status: 500 })
    if (!member) return NextResponse.json({ error: 'not_found' }, { status: 404 })

    const { error } = await sb.from('team_members').update({ level, updated_at: new Date().toISOString() }).eq('user_id', userId)
    if (error) return NextResponse.json({ error: 'db_error' }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('team/set-level error:', e)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
