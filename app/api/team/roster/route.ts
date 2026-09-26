import { NextResponse } from 'next/server'
import { getSbAdmin } from '@/lib/supabase/admin'
import { isRateLimited, getClientIp } from '@/lib/ratelimit'
import { secretMatches } from '@/lib/internalAuth'

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

// Server-to-server only: team_members now lives exclusively in this
// project's database, so every place Operations' admin UI/crons need to
// look a member up (roster views, booking flows, push targeting, level
// changes) goes through here instead of Operations' own now-frozen copy —
// the exact bug class already found and fixed for pending-members.
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
  const filter: Filter = body?.filter || {}
  const includeAuthStatus = !!body?.includeAuthStatus

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
    // always report "not found", so this check has to run here.
    const enriched = await Promise.all(members.map(async (m: any) => {
      let authLinked = false
      let lastSignInAt: string | null = null
      if (m.user_id) {
        try {
          const { data } = await sb.auth.admin.getUserById(m.user_id)
          if (data?.user) { authLinked = true; lastSignInAt = data.user.last_sign_in_at || null }
        } catch { /* malformed/nonexistent id — treat as unlinked */ }
      }
      return { ...m, authLinked, lastSignInAt }
    }))
    return NextResponse.json({ members: enriched })
  } catch (e: any) {
    console.error('team/roster error:', e)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
