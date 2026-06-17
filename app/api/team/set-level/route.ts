import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// POST — admin only: set a team member's level
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const adminEmail = (process.env.NEXT_PUBLIC_ADMIN_EMAIL || '').toLowerCase().trim()
    if (!adminEmail || (body.requesterEmail || '').toLowerCase().trim() !== adminEmail)
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })

    const userId = body.userId
    const level = Number(body.level)
    if (!userId || !Number.isFinite(level)) {
      return NextResponse.json({ error: 'userId and level required' }, { status: 400 })
    }

    await sb.from('team_members').update({ level }).eq('user_id', userId)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
