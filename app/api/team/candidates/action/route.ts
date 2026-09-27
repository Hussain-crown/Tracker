import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getSbAdmin, verifyUser } from '@/lib/supabase/admin'
import { parseBody } from '@/lib/validate'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({ candidateId: z.string().min(1) }).passthrough()

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

    const parsed = await parseBody(req, bodySchema)
    if (parsed.res) return parsed.res
    const body = parsed.data as any
    const { candidateId } = body

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

    // Permanently deleting a candidate must also remove the lead it was
    // converted from -- otherwise the person a member just deleted for good
    // reappears in Pipeline's Archived tab as a "Converted to candidate"
    // stub, looking like the delete didn't actually take. Candidates and
    // leads live in two separate databases (Operations / this project), so
    // this side of the cascade has to run here, not in the bridge.
    if (body?.action === 'delete') {
      const { data: matchingLead } = await sbAdmin.from('leads')
        .select('id').eq('user_id', user.id).eq('converted_candidate_id', candidateId).maybeSingle()
      if (matchingLead) {
        await sbAdmin.from('contact_logs').delete().eq('entity_id', matchingLead.id).eq('user_id', user.id)
        await sbAdmin.from('leads').delete().eq('id', matchingLead.id).eq('user_id', user.id)
      }
    }

    return NextResponse.json(d)
  } catch (e: any) {
    console.error('track/candidates/action error:', e); return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
