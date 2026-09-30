export const dynamic = 'force-dynamic'

// iOS Shortcut endpoint — increment today's (or a given date's) habit
// counters. Auth: X-API-Key header (same key used for /api/log-prospect and
// /api/stage-candidate, generated from Settings).
// Body: { date?, convo?, mg1?, mpa?, contact?, catch_up?, dtm?, pre_filter?, launch?, interruptions? }
// Every count field is additive (an increment on top of whatever's already
// logged for that date), matching how the shortcut is used through the day —
// not a replace/set.
import { NextRequest, NextResponse } from 'next/server'
import { getSbAdmin } from '@/lib/supabase/admin'
import { isRateLimited, getClientIp } from '@/lib/ratelimit'
import { authenticateApiKey, API_KEY_CORS } from '@/lib/apiKeyAuth'

const COUNT_FIELDS = ['interruptions', 'convo', 'mpa', 'contact', 'catch_up', 'dtm', 'pre_filter', 'mg1', 'launch'] as const

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: API_KEY_CORS })
}

export async function POST(req: NextRequest) {
  try {
    if (await isRateLimited(`log-habit:post:${getClientIp(req)}`, 20, 60_000))
      return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers: API_KEY_CORS })

    const auth = await authenticateApiKey(req)
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: API_KEY_CORS })
    const userId = auth.userId

    const body = await req.json().catch(() => ({}))
    const date = (typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date))
      ? body.date
      : new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Brisbane' })

    const increments: Record<string, number> = {}
    for (const f of COUNT_FIELDS) {
      const v = body[f]
      if (typeof v === 'number' && Number.isFinite(v)) increments[f] = Math.max(0, Math.round(v))
    }
    if (Object.keys(increments).length === 0)
      return NextResponse.json({ error: 'Provide at least one count field to log' }, { status: 400, headers: API_KEY_CORS })

    const sbAdmin = getSbAdmin()
    const { data: existing } = await sbAdmin.from('habits').select('*').eq('user_id', userId).eq('date', date).maybeSingle()
    const now = new Date().toISOString()
    const merged: Record<string, unknown> = {
      user_id: userId,
      date,
      created_at: (existing as any)?.created_at || now,
      updated_at: now,
    }
    for (const f of COUNT_FIELDS) {
      merged[f] = ((existing as any)?.[f] || 0) + (increments[f] || 0)
    }
    if (!(existing as any)?.id) merged.id = crypto.randomUUID()
    else merged.id = (existing as any).id

    const { error: upsertErr } = await sbAdmin.from('habits').upsert(merged, { onConflict: 'user_id,date' })
    if (upsertErr) {
      console.error('log-habit upsert error:', upsertErr)
      return NextResponse.json({ error: 'Failed to save habit log' }, { status: 500, headers: API_KEY_CORS })
    }

    return NextResponse.json({
      success: true,
      date,
      logged: increments,
      totals: Object.fromEntries(COUNT_FIELDS.map(f => [f, merged[f]])),
      message: `Logged for ${date}`,
    }, { status: 200, headers: API_KEY_CORS })
  } catch (e) {
    console.error('log-habit error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500, headers: API_KEY_CORS })
  }
}
