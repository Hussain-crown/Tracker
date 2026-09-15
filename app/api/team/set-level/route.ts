import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { getSbAdmin } from '@/lib/supabase/admin'
import { isRateLimited, getClientIp } from '@/lib/ratelimit'

export const dynamic = 'force-dynamic'

function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

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

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  const userId = String(body?.userId || '').trim()
  const level = Number(body?.level)
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
