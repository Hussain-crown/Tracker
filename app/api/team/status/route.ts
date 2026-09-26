import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getSbAdmin } from '@/lib/supabase/admin'
import { isRateLimited, getClientIp } from '@/lib/ratelimit'
import { secretMatches } from '@/lib/internalAuth'
import { parseBody } from '@/lib/validate'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  ibos: z.array(z.unknown()),
})

// Server-to-server only: read-only status lookup used by Operations'
// reconciliation check — lets it verify the deactivate/reactivate bridge
// actually landed, instead of trusting a single synchronous call that could
// have failed silently before alerting existed.
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
  const ibos = parsed.data.ibos.map((x) => String(x).trim()).filter((x: string) => /^\d{4,12}$/.test(x))
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
