import { NextResponse } from 'next/server'
import { getSbAdmin, verifyUser } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// Candidates (and their contact_logs) are centralized in Operations' own
// database now — this proxies there instead of Tracker's own local
// `candidates` table, which was a frozen, disconnected copy from the
// original DB split (a team member's edits there were invisible to the
// admin's view in Operations, and vice versa).
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
    if (!iboNumber) return NextResponse.json({ candidates: [], logs: [], iboNumber: '' })

    const base = process.env.OPERATIONS_API_URL
    const secret = process.env.INTERNAL_BRIDGE_SECRET
    if (!base || !secret) return NextResponse.json({ candidates: [], logs: [], iboNumber, error: 'bridge_not_configured' })

    const res = await fetch(`${base}/api/team/candidates-bridge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': secret },
      body: JSON.stringify({ op: 'list', ibo: iboNumber }),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) return NextResponse.json({ candidates: [], logs: [], iboNumber, error: d?.error || 'bridge_error' }, { status: 502 })
    return NextResponse.json({ candidates: d.candidates || [], logs: d.logs || [], iboNumber })
  } catch (e: any) {
    console.error('track/my-candidates error:', e); return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
