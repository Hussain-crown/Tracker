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

// Server-to-server only: read-only status lookup used by Operations'
// reconciliation check — lets it verify the deactivate/reactivate bridge
// actually landed, instead of trusting a single synchronous call that could
// have failed silently before alerting existed.
export async function POST(req: Request) {
  if (await isRateLimited(getClientIp(req), 10, 60_000))
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  const provided = req.headers.get('x-internal-secret') || ''
  const expected = process.env.INTERNAL_BRIDGE_SECRET || ''
  if (!expected || !secretMatches(provided, expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  const ibos = Array.isArray(body?.ibos) ? body.ibos.map((x: any) => String(x).trim()).filter((x: string) => /^\d{4,12}$/.test(x)) : []
  if (!ibos.length || ibos.length > 200) return NextResponse.json({ error: 'invalid_ibos' }, { status: 400 })

  try {
    const sb = getSbAdmin()
    const { data, error } = await sb.from('team_members')
      .select('ibo_number, status')
      .in('ibo_number', ibos)
    if (error) return NextResponse.json({ error: 'db_error' }, { status: 500 })
    return NextResponse.json({ ok: true, members: data || [] })
  } catch (e: any) {
    console.error('team/status error:', e)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
