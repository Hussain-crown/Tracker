import { NextResponse } from 'next/server'
import { sbAdmin as sb, verifyUser } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// POST — admin only: set a team member's level
export async function POST(req: Request) {
  try {
    const requester = await verifyUser(req)
    const adminEmail = (process.env.ADMIN_EMAIL || process.env.NEXT_PUBLIC_ADMIN_EMAIL || '').toLowerCase().trim()
    const isAdmin = process.env.ADMIN_USER_ID
      ? requester?.id === process.env.ADMIN_USER_ID
      : (!!adminEmail && (requester?.email || '').toLowerCase() === adminEmail)
    if (!isAdmin)
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })

    let body: any
    try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
    const userId = body?.userId
    const level = Number(body.level)
    if (!userId || typeof userId !== 'string' || !Number.isFinite(level) || !Number.isInteger(level) || level < 1 || level > 2) {
      return NextResponse.json({ error: 'userId (string) and level (1-2) required' }, { status: 400 })
    }

    const { data: existing } = await sb.from('team_members').select('user_id').eq('user_id', userId).maybeSingle()
    if (!existing) return NextResponse.json({ error: 'team member not found' }, { status: 404 })
    const { error } = await sb.from('team_members').update({ level, updated_at: new Date().toISOString() }).eq('user_id', userId)
    if (error) { console.error('track/team/set-level DB error:', error); return NextResponse.json({ error: 'internal_error' }, { status: 500 }) }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('track/team/set-level error:', e); return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
