import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getSbAdmin } from '@/lib/supabase/admin'
import { isRateLimited, getClientIp } from '@/lib/ratelimit'
import { secretMatches } from '@/lib/internalAuth'
import { parseBody } from '@/lib/validate'

export const dynamic = 'force-dynamic'

interface Filter {
  role?: string
  status?: string
  user_id?: string
  user_ids?: string[]
  ibo_number?: string
  ibo_numbers?: string[]
  email?: string
}

const bodySchema = z.object({
  filter: z.object({}).passthrough().optional(),
  includeAuthStatus: z.unknown().optional(),
})

// Server-to-server only: team_members now lives exclusively in this
// project's database, so every place Operations' admin UI/crons need to
// look a member up (roster views, booking flows, push targeting, level
// changes) goes through here instead of Operations' own now-frozen copy —
// the exact bug class already found and fixed for pending-members.
export async function POST(req: Request) {
  if (await isRateLimited(`team-roster:post:${getClientIp(req)}`, 60, 60_000))
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  const provided = req.headers.get('x-internal-secret') || ''
  const expected = process.env.INTERNAL_BRIDGE_SECRET || ''
  if (!expected || !secretMatches(provided, expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const parsed = await parseBody(req, bodySchema)
  if (parsed.res) return parsed.res
  const filter: Filter = (parsed.data.filter || {}) as Filter
  const includeAuthStatus = !!parsed.data.includeAuthStatus

  try {
    const sb = getSbAdmin()
    let q = sb.from('team_members').select('*')
    if (filter.role) q = q.eq('role', filter.role)
    if (filter.status) q = q.eq('status', filter.status)
    if (filter.user_id) q = q.eq('user_id', filter.user_id)
    if (filter.user_ids?.length) q = q.in('user_id', filter.user_ids.slice(0, 1000))
    if (filter.ibo_number) q = q.eq('ibo_number', filter.ibo_number)
    if (filter.ibo_numbers?.length) q = q.in('ibo_number', filter.ibo_numbers.slice(0, 1000))
    if (filter.email) q = q.eq('email', filter.email.toLowerCase())

    const { data: members, error } = await q
    if (error) return NextResponse.json({ error: 'db_error' }, { status: 500 })

    if (!includeAuthStatus || !members?.length) {
      return NextResponse.json({ members: members || [] })
    }

    // Each member's real Supabase Auth account lives in THIS project now —
    // Operations checking its own auth.users for a Tracker user_id would
    // always report "not found", so this check has to run here. This used
    // to issue one getUserById call per member (parallelized, but still N
    // Admin API calls per request) -- listUsers paginates the whole roster
    // in a handful of calls instead, the same fix applied to the
    // dormant-check cron's identical pattern.
    const authById = new Map<string, { authLinked: boolean; lastSignInAt: string | null }>()
    let page = 1
    while (true) {
      const { data, error: listErr } = await sb.auth.admin.listUsers({ page, perPage: 200 })
      if (listErr) return NextResponse.json({ error: 'db_error' }, { status: 500 })
      for (const u of data?.users || []) authById.set(u.id, { authLinked: true, lastSignInAt: u.last_sign_in_at || null })
      if (!data?.users?.length || data.users.length < 200) break
      page++
    }

    const enriched = members.map((m: any) => ({
      ...m,
      ...(authById.get(m.user_id) || { authLinked: false, lastSignInAt: null }),
    }))
    return NextResponse.json({ members: enriched })
  } catch (e: any) {
    console.error('team/roster error:', e)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
