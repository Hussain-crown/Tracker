import { NextResponse } from 'next/server'
import { getSbAdmin, verifyUser } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// Candidates live in Operations' own database now — the Level-2 gate and
// membership/ibo resolution still happen here (team_members is real here),
// then every actual candidate mutation proxies to Operations' bridge.
export async function POST(req: Request) {
  try {
    const user = await verifyUser(req)
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const sbAdmin = getSbAdmin()
    const { data: member, error: memberErr } = await sbAdmin
      .from('team_members')
      .select('level, ibo_number')
      .eq('user_id', user.id)
      .maybeSingle()
    if (memberErr) {
      console.error('team_members fetch failed:', memberErr)
      return NextResponse.json({ error: 'internal_error' }, { status: 500 })
    }

    if (!member || (Number(member.level) || 1) < 2) {
      return NextResponse.json({ error: 'Level 2 required' }, { status: 403 })
    }

    let body: any
    try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
    const { candidateId } = body
    if (!candidateId) return NextResponse.json({ error: 'missing candidateId' }, { status: 400 })

    const base = process.env.OPERATIONS_API_URL
    const secret = process.env.INTERNAL_BRIDGE_SECRET
    if (!base || !secret) return NextResponse.json({ error: 'bridge_not_configured' }, { status: 503 })

    const res = await fetch(`${base}/api/team/candidates-bridge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': secret },
      body: JSON.stringify({ op: 'action', ibo: member.ibo_number, ...body }),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) {
      const status = [400, 403, 404].includes(res.status) ? res.status : 502
      return NextResponse.json({ error: d?.error || 'bridge_error' }, { status })
    }
    return NextResponse.json(d)
  } catch (e: any) {
    console.error('track/candidates/action error:', e); return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
