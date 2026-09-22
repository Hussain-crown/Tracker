import { NextResponse } from 'next/server'
import { getSbAdmin, verifyUser } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// GET — modules/parts plus this member's completed part ids, proxied from
// Operations' database (same pattern as /api/team/my-candidates).
export async function GET(req: Request) {
  try {
    const user = await verifyUser(req)
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const sbAdmin = getSbAdmin()
    const { data: member } = await sbAdmin
      .from('team_members')
      .select('ibo_number')
      .eq('user_id', user.id)
      .maybeSingle()

    const iboNumber = member?.ibo_number || ''
    if (!iboNumber) return NextResponse.json({ modules: [], completedPartIds: [] })

    const base = process.env.OPERATIONS_API_URL
    const secret = process.env.INTERNAL_BRIDGE_SECRET
    if (!base || !secret) return NextResponse.json({ modules: [], completedPartIds: [], error: 'bridge_not_configured' })

    const res = await fetch(`${base}/api/team/training-bridge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': secret },
      body: JSON.stringify({ op: 'list', ibo: iboNumber }),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) return NextResponse.json({ modules: [], completedPartIds: [], error: d?.error || 'bridge_error' })
    return NextResponse.json(d)
  } catch (e: any) {
    console.error('track/team/training error:', e); return NextResponse.json({ modules: [], completedPartIds: [], error: 'internal_error' })
  }
}
