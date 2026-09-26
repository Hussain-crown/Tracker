import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getSbAdmin } from '@/lib/supabase/admin'
import { isRateLimited, getClientIp } from '@/lib/ratelimit'
import { secretMatches } from '@/lib/internalAuth'
import { parseBody } from '@/lib/validate'

export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  ibo: z.string(),
  action: z.string().optional(),
})

// Server-to-server only: called by Operations when a partner is marked
// "dropped out" (or restored) there, so their Tracker access follows in the
// same action instead of relying on someone remembering to do it separately.
// Auth is a shared secret header, not a user session — there is no
// logged-in Tracker user on the Operations side of this call.
export async function POST(req: Request) {
  if (await isRateLimited(getClientIp(req), 60, 60_000))
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  const provided = req.headers.get('x-internal-secret') || ''
  const expected = process.env.INTERNAL_BRIDGE_SECRET || ''
  if (!expected || !secretMatches(provided, expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const parsed = await parseBody(req, bodySchema)
  if (parsed.res) return parsed.res
  const ibo = parsed.data.ibo.trim()
  const action = parsed.data.action === 'reactivate' ? 'reactivate' : 'deactivate'
  if (!/^\d{4,12}$/.test(ibo)) return NextResponse.json({ error: 'invalid_ibo' }, { status: 400 })

  try {
    const sb = getSbAdmin()
    const { data: existing } = await sb.from('team_members')
      .select('status').eq('ibo_number', ibo).maybeSingle()

    // Reactivating never clobbers a still-pending approval into "active" —
    // only a previously deactivated member gets restored, and to the status
    // they'd have had before deactivation (pending members haven't finished
    // onboarding yet, so they go back to pending, not active).
    const newStatus = action === 'reactivate'
      ? (existing?.status === 'inactive' ? 'active' : existing?.status)
      : 'inactive'

    if (!existing || newStatus === existing.status) {
      return NextResponse.json({ ok: true, updated: false })
    }

    // Guard the write with the status this decision was based on (optimistic
    // concurrency) rather than a blind update. Operations fires both
    // directions fire-and-forget, so a drop-out immediately followed by a
    // restore (or vice versa) can otherwise interleave two reads before
    // either write lands, and whichever write happens to finish last wins —
    // silently leaving the account in the wrong final state. Scoping the
    // update to .eq('status', existing.status) makes the second call's write
    // a no-op instead: it re-reads a status that already moved and correctly
    // sees nothing left to do.
    const { data: updated, error } = await sb
      .from('team_members')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('ibo_number', ibo)
      .eq('status', existing.status)
      .select('user_id, name')
      .maybeSingle()
    if (error) {
      console.error('team/deactivate update failed:', error.message)
      return NextResponse.json({ error: 'db_error' }, { status: 500 })
    }
    return NextResponse.json({ ok: true, updated: !!updated, member: updated || null })
  } catch (e: any) {
    console.error('team/deactivate error:', e)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
