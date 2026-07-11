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
        .eq('archived', false)
      if ((count || 0) >= 100) newLevel = 2
    } else if (currentLevel === 2) {
      // L2 → L3: 3+ launched candidates AND no inactive direct legs
      const iboNumber = member.ibo_number || ''
      if (iboNumber) {
        const [{ data: launched }, { data: inactiveLegs }] = await Promise.all([
          sbAdmin.from('candidates').select('id').filter('interview_notes->>_sponsor_ibo', 'eq', iboNumber).eq('status', 'launched'),
          sbAdmin.from('team_members').select('user_id').eq('referred_by', iboNumber).eq('status', 'inactive'),
        ])
        if ((launched?.length || 0) >= 3 && (inactiveLegs?.length || 0) === 0) newLevel = 3
      }
    } else if (currentLevel === 3) {
      // L3 → L2 demotion: any directly referred partner is inactive
      const iboNumber = member.ibo_number || ''
      if (iboNumber) {
        const { data: inactiveLegs } = await sbAdmin
          .from('team_members')
          .select('user_id')
          .eq('referred_by', iboNumber)
          .eq('status', 'inactive')
        if ((inactiveLegs?.length || 0) > 0) newLevel = 2
      }
    }
    // L4 is manual-only — no auto-upgrade or auto-demotion

    const upgraded = newLevel !== currentLevel
    if (upgraded) {
      await sbAdmin
        .from('team_members')
        .update({ level: newLevel, updated_at: new Date().toISOString() })
        .eq('user_id', user.id)
    }

    return NextResponse.json({ level: newLevel, upgraded })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
