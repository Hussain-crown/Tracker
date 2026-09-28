export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getSbAdmin } from '@/lib/supabase/admin'
import { secretMatches } from '@/lib/internalAuth'

// Marks any active member quiet for 3+ months as dormant -- not a real
// drop-out (that's status:'inactive', set from Operations when a partner is
// actually removed and never auto-reversed), just "hasn't opened the app in
// a while." A dormant member's data is untouched and they're fully restored
// the instant they log in again (see app/page.tsx's member-load effect) --
// this only hides them from the admin's active roster in the meantime.
const DORMANT_AFTER_DAYS = 90

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') || ''
  if (!secret || !secretMatches(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const sb = getSbAdmin()
  const cutoff = new Date(Date.now() - DORMANT_AFTER_DAYS * 86400000).toISOString()

  try {
    const { data: members, error } = await sb.from('team_members')
      .select('user_id').eq('status', 'active').eq('dormant', false)
    if (error) return NextResponse.json({ error: 'db_error' }, { status: 500 })
    if (!members?.length) return NextResponse.json({ ok: true, marked: 0 })

    // One getUserById call per active member used to run sequentially here --
    // fine for a handful of people, but it scales linearly with team size and
    // risks the function timing out as the roster grows. listUsers paginates
    // in batches of 200 instead, so the whole roster costs a handful of calls
    // no matter how many members there are.
    const lastSignInById = new Map<string, string | null>()
    let page = 1
    while (true) {
      const { data, error: listErr } = await sb.auth.admin.listUsers({ page, perPage: 200 })
      if (listErr) return NextResponse.json({ error: 'db_error' }, { status: 500 })
      for (const u of data?.users || []) lastSignInById.set(u.id, u.last_sign_in_at || null)
      if (!data?.users?.length || data.users.length < 200) break
      page++
    }

    const toMark: string[] = []
    for (const m of members as { user_id: string }[]) {
      const lastSignIn = lastSignInById.get(m.user_id) ?? null
      if (!lastSignIn || lastSignIn < cutoff) toMark.push(m.user_id)
    }
    if (!toMark.length) return NextResponse.json({ ok: true, marked: 0 })

    const { error: updErr } = await sb.from('team_members')
      .update({ dormant: true, dormant_since: new Date().toISOString() })
      .in('user_id', toMark)
    if (updErr) return NextResponse.json({ error: 'update_failed' }, { status: 500 })

    return NextResponse.json({ ok: true, marked: toMark.length })
  } catch (e: any) {
    console.error('cron/dormant-check error:', e)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
