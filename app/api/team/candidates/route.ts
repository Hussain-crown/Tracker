import { NextResponse } from 'next/server'
import { getSbAdmin, verifyUser } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// Candidates live in Operations' own database now — this resolves the
// caller's real membership locally (team_members lives here), then proxies
// the actual create/update to Operations' candidates-bridge.
export async function POST(req: Request) {
  try {
    const user = await verifyUser(req)
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const sbAdmin = getSbAdmin()
    const { data: member } = await sbAdmin
      .from('team_members')
      .select('ibo_number')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!member) return NextResponse.json({ error: 'not a team member' }, { status: 403 })

    let body: any
    try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }

    const base = process.env.OPERATIONS_API_URL
    const secret = process.env.INTERNAL_BRIDGE_SECRET
    if (!base || !secret) return NextResponse.json({ error: 'bridge_not_configured' }, { status: 503 })

    const res = await fetch(`${base}/api/team/candidates-bridge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': secret },
      body: JSON.stringify({ op: 'upsert', ibo: member.ibo_number, payload: body }),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) return NextResponse.json({ error: d?.error || 'bridge_error' }, { status: res.status === 403 || res.status === 404 ? res.status : 502 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('track/team/candidates error:', e); return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
