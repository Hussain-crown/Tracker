import { NextResponse } from 'next/server'
import { getSbAdmin, verifyUser, resolveAdminId } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const user = await verifyUser(req)
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const sbAdmin = getSbAdmin()

    const { data: member } = await sbAdmin
      .from('team_members')
      .select('ibo_number')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!member) return NextResponse.json({ error: 'not a team member' }, { status: 403 })

    let body: any
    try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }

    const adminId = await resolveAdminId()
    const payload = { ...body, user_id: adminId }

    const { error } = await sbAdmin.from('candidates').upsert(payload, { onConflict: 'id' })
    if (error) { console.error('team/candidates upsert error:', error); return NextResponse.json({ error: 'upsert_failed' }, { status: 500 }) }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('track/team/candidates error:', e); return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
