import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getSbAdmin, verifyUser } from '@/lib/supabase/admin'
import { parseBody } from '@/lib/validate'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  partId: z.string(),
  completed: z.boolean().optional(),
})

// POST { partId, completed } — mark/unmark a training part complete for the caller.
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
    if (!member?.ibo_number) return NextResponse.json({ error: 'not a team member' }, { status: 403 })

    const parsed = await parseBody(req, bodySchema)
    if (parsed.res) return parsed.res
    const partId = parsed.data.partId
    const body = parsed.data

    const base = process.env.OPERATIONS_API_URL
    const secret = process.env.INTERNAL_BRIDGE_SECRET
    if (!base || !secret) return NextResponse.json({ error: 'bridge_not_configured' }, { status: 503 })

    const res = await fetch(`${base}/api/team/training-bridge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': secret },
      body: JSON.stringify({ op: 'complete', ibo: member.ibo_number, partId, completed: body?.completed !== false }),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) return NextResponse.json({ error: d?.error || 'bridge_error', message: d?.message }, { status: [403, 404].includes(res.status) ? res.status : 502 })
    return NextResponse.json(d)
  } catch (e: any) {
    console.error('track/team/training/complete error:', e); return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
