import { NextResponse } from 'next/server'
import { getSbAdmin } from '@/lib/supabase/admin'
import { isRateLimited, getClientIp } from '@/lib/ratelimit'
import { secretMatches } from '@/lib/internalAuth'

export const dynamic = 'force-dynamic'

// Server-to-server only: Operations' team/analytics dashboard needs per-
// member habits/leads/goal data that lives exclusively in this project's
// database now — this bundles exactly what that dashboard aggregates, so
// Operations doesn't need N separate round trips.
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
  const memberIds: string[] = Array.isArray(body?.memberIds) ? body.memberIds.filter((x: any) => typeof x === 'string').slice(0, 1000) : []
  const sinceDate = String(body?.sinceDate || '')
  if (!memberIds.length) return NextResponse.json({ habits: [], leads: [], metas: [] })

  try {
    const sb = getSbAdmin()
    const [habitsRes, leadsRes, metasRes] = await Promise.all([
      sb.from('habits')
        .select('user_id,date,interruptions,convo,mpa,contact,catch_up,dtm,pre_filter,mg1,launch')
        .in('user_id', memberIds)
        .gte('date', sinceDate || '1970-01-01'),
      sb.from('leads').select('*').in('user_id', memberIds).not('archived', 'is', true).limit(5000),
      sb.from('meta').select('user_id,key,value').in('user_id', memberIds).in('key', ['core_goals_v4', 'core_goals_v3']),
    ])
    const err = habitsRes.error ?? leadsRes.error ?? metasRes.error
    if (err) return NextResponse.json({ error: 'db_error' }, { status: 500 })
    return NextResponse.json({ habits: habitsRes.data || [], leads: leadsRes.data || [], metas: metasRes.data || [] })
  } catch (e: any) {
    console.error('team/analytics-data error:', e)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
