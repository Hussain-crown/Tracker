export const dynamic = 'force-dynamic'

// iOS Shortcut endpoint — add a lead/prospect to your own pipeline.
// Auth: X-API-Key header (same key used for /api/log-habit and /api/stage-candidate)
// Body: { name*, phone?, email?, source?, notes?, hxl_score?, hunger?, looking? }
import { NextRequest, NextResponse } from 'next/server'
import { getSbAdmin } from '@/lib/supabase/admin'
import { isRateLimited, getClientIp } from '@/lib/ratelimit'
import { authenticateApiKey, API_KEY_CORS } from '@/lib/apiKeyAuth'

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: API_KEY_CORS })
}

export async function POST(req: NextRequest) {
  try {
    if (await isRateLimited(`log-prospect:post:${getClientIp(req)}`, 20, 60_000))
      return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: API_KEY_CORS })

    const auth = await authenticateApiKey(req)
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: API_KEY_CORS })
    const userId = auth.userId

    const body = await req.json().catch(() => ({}))

    const name = (typeof body.name === 'string' ? body.name : '').trim().slice(0, 200)
    if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400, headers: API_KEY_CORS })

    const phone    = (typeof body.phone    === 'string' ? body.phone    : '').trim().slice(0, 30)
    const email    = (typeof body.email    === 'string' ? body.email    : '').toLowerCase().trim().slice(0, 200)
    const source   = (typeof body.source   === 'string' ? body.source   : 'iOS Shortcut').trim().slice(0, 100) || 'iOS Shortcut'
    const stage    = (typeof body.stage    === 'string' ? body.stage    : '').trim().slice(0, 50)
    const notes    = (typeof body.notes    === 'string' ? body.notes    : '').trim().slice(0, 500)
    // Accept a numeric-looking string too -- see log-habit's identical comment.
    const toScore = (raw: unknown): number | null => {
      const v = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN
      return Number.isFinite(v) ? Math.min(10, Math.max(0, Math.round(v))) : null
    }
    const hxl_score = toScore(body.hxl_score)
    const hunger    = toScore(body.hunger)
    const looking   = toScore(body.looking)

    const toCsv = (v: unknown) => Array.isArray(v) ? v.map(String).map(s => s.trim()).filter(Boolean).slice(0, 3).join(', ') : (typeof v === 'string' ? v.trim() : '')
    const relationship   = (typeof body.relationship === 'string' ? body.relationship : '').trim().slice(0, 50)
    const age_range      = (typeof body.age_range    === 'string' ? body.age_range    : '').trim().slice(0, 20)
    const life_stage     = toCsv(body.life_stage).slice(0, 200)
    const primary_driver = toCsv(body.primary_driver).slice(0, 200)
    const pain_point     = (typeof body.pain_point   === 'string' ? body.pain_point   : '').trim().slice(0, 500)

    const now = new Date().toISOString()
    const id  = crypto.randomUUID()

    const sbAdmin = getSbAdmin()
    const { error: insertErr } = await sbAdmin.from('leads').insert({
      id,
      user_id: userId,
      name,
      ...(phone     ? { phone }     : {}),
      ...(email     ? { email }     : {}),
      source,
      ...(stage     ? { stage }     : {}),
      ...(notes     ? { notes }     : {}),
      ...(hxl_score !== null ? { score: hxl_score } : {}),
      ...(hunger    !== null ? { hunger }            : {}),
      ...(looking   !== null ? { looking }           : {}),
      ...(relationship   ? { relationship }   : {}),
      ...(age_range      ? { age_range }      : {}),
      ...(life_stage     ? { life_stage }     : {}),
      ...(primary_driver ? { primary_driver } : {}),
      ...(pain_point     ? { pain_point }     : {}),
      archived: false,
      next_action: '',
      next_action_date: '',
      created_at: now,
      updated_at: now,
    })

    if (insertErr) {
      console.error('log-prospect insert error:', insertErr)
      return NextResponse.json({ error: 'Failed to save prospect' }, { status: 500, headers: API_KEY_CORS })
    }

    return NextResponse.json({
      success: true,
      lead_id: id,
      name,
      source,
      message: `"${name}" added to your pipeline`,
    }, { status: 200, headers: API_KEY_CORS })

  } catch (e) {
    console.error('log-prospect error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: API_KEY_CORS })
  }
}
