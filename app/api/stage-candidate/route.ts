export const dynamic = 'force-dynamic'

// iOS Shortcut endpoint — set a candidate's stage directly.
// Auth: X-API-Key header (same key used for /api/log-habit and /api/log-prospect)
// Body: { stage*, id? | email? | name?, notes? }
// Lookup priority: id > email > name (partial match)
//
// Candidates live in Operations' own database, not here (see
// team/candidates/action and team/my-candidates) -- this authenticates the
// shortcut's API key locally, resolves which team member it belongs to, then
// proxies the actual stage change to Operations' candidates-bridge exactly
// like every other Tracker-side candidate mutation does.
import { NextRequest, NextResponse } from 'next/server'
import { getSbAdmin } from '@/lib/supabase/admin'
import { isRateLimited, getClientIp } from '@/lib/ratelimit'
import { authenticateApiKey, API_KEY_CORS } from '@/lib/apiKeyAuth'

const VALID_STAGES = ['Pre-Filter','MG1','MG2','FU1','FU2','FU3','Offer Questions','Offer Call','Offer','Activation']

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: API_KEY_CORS })
}

export async function POST(req: NextRequest) {
  try {
    if (await isRateLimited(`stage-candidate:post:${getClientIp(req)}`, 20, 60_000))
      return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: API_KEY_CORS })

    const auth = await authenticateApiKey(req)
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: API_KEY_CORS })
    const userId = auth.userId

    const body = await req.json().catch(() => ({}))
    const stage = (typeof body.stage === 'string' ? body.stage.trim() : '')
    if (!stage || !VALID_STAGES.includes(stage))
      return NextResponse.json({ error: `Invalid stage. Valid: ${VALID_STAGES.join(', ')}` }, { status: 400, headers: API_KEY_CORS })

    const inputId = (typeof body.id    === 'string' ? body.id.trim()            : '')
    const email   = (typeof body.email === 'string' ? body.email.toLowerCase().trim() : '')
    const name    = (typeof body.name  === 'string' ? body.name.trim().slice(0, 200)  : '')
    if (!inputId && !email && !name)
      return NextResponse.json({ error: 'Provide id, email, or name to identify the candidate' }, { status: 400, headers: API_KEY_CORS })

    const sbAdmin = getSbAdmin()
    const { data: member } = await sbAdmin.from('team_members').select('ibo_number').eq('user_id', userId).maybeSingle()
    const iboNumber = (member as any)?.ibo_number || ''
    if (!iboNumber) return NextResponse.json({ error: 'No IBO on file for this account' }, { status: 403, headers: API_KEY_CORS })

    const base = process.env.OPERATIONS_API_URL
    const secret = process.env.INTERNAL_BRIDGE_SECRET
    if (!base || !secret) return NextResponse.json({ error: 'bridge_not_configured' }, { status: 503, headers: API_KEY_CORS })

    const listRes = await fetch(`${base}/api/team/candidates-bridge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': secret },
      body: JSON.stringify({ op: 'list', ibo: iboNumber }),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })
    const listData = await listRes.json().catch(() => ({}))
    if (!listRes.ok) return NextResponse.json({ error: listData?.error || 'bridge_error' }, { status: 502, headers: API_KEY_CORS })
    const candidates: any[] = listData.candidates || []

    let candidate: any = null
    if (inputId) candidate = candidates.find(c => c.id === inputId) || null
    if (!candidate && email) candidate = candidates.find(c => (c.email || '').toLowerCase() === email) || null
    if (!candidate && name) {
      const lname = name.toLowerCase()
      candidate = candidates.find(c => (c.name || '').toLowerCase().includes(lname) && c.status === 'active') || null
    }
    if (!candidate) return NextResponse.json({ error: 'Candidate not found' }, { status: 404, headers: API_KEY_CORS })

    const oldStage = candidate.stage || 'Pre-Filter'
    const actionRes = await fetch(`${base}/api/team/candidates-bridge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-secret': secret },
      body: JSON.stringify({ op: 'action', ibo: iboNumber, candidateId: candidate.id, action: 'set_stage', targetStage: stage }),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })
    const actionData = await actionRes.json().catch(() => ({}))
    if (!actionRes.ok) return NextResponse.json({ error: actionData?.error || 'bridge_error' }, { status: 502, headers: API_KEY_CORS })

    return NextResponse.json({
      success: true,
      candidate_id: candidate.id,
      name: candidate.name,
      old_stage: oldStage,
      new_stage: stage,
      message: `${candidate.name} moved to ${stage}`,
    }, { status: 200, headers: API_KEY_CORS })

  } catch (e) {
    console.error('stage-candidate error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: API_KEY_CORS })
  }
}
