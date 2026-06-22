import { NextResponse } from 'next/server'
import { sbAdmin as sb, verifyUser } from '@/lib/supabase/admin'

// POST — admin only: set a team member's level
export async function POST(req: Request) {
  try {
    const requester = await verifyUser(req)
    const adminEmail = (process.env.NEXT_PUBLIC_ADMIN_EMAIL || '').toLowerCase().trim()
    if (!requester || !adminEmail || requester.email !== adminEmail)
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })

    const body = await req.json()
    const userId = body.userId
    const level = Number(body.level)
    if (!userId || !Number.isFinite(level)) {
      return NextResponse.json({ error: 'userId and level required' }, { status: 400 })
    }

    const { error } = await sb.from('team_members').update({ level }).eq('user_id', userId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
