import { NextResponse } from 'next/server'
import { getSbAdmin, verifyUser } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const user = await verifyUser(req)
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const sbAdmin = getSbAdmin()

    const { data: member } = await sbAdmin
      .from('team_members')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!member) return NextResponse.json({ error: 'member not found' }, { status: 404 })

    const currentLevel = member.level || 1
    let newLevel = currentLevel

    if (currentLevel === 1) {
      // L1 → L2: 100+ active (non-archived) prospects
      const { count } = await sbAdmin
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .not('archived', 'is', true)
      if ((count || 0) >= 100) newLevel = 2
    }

    const upgraded = newLevel !== currentLevel
    if (upgraded) {
      const { error: upErr } = await sbAdmin
        .from('team_members')
        .update({ level: newLevel, updated_at: new Date().toISOString() })
        .eq('user_id', user.id)
      if (upErr) throw upErr
    }

    return NextResponse.json({ level: newLevel, upgraded })
  } catch (e: any) {
    console.error('team/auto-upgrade error:', e); return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
