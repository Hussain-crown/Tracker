import { NextResponse } from 'next/server'
import { getSbAdmin, verifyUser } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const user = await verifyUser(req)
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const sbAdmin = getSbAdmin()

    const { data: member } = await sbAdmin
      .from('team_members')
      .select('ibo_number')
      .eq('user_id', user.id)
      .maybeSingle()

    const iboNumber = member?.ibo_number || ''
    if (!iboNumber) return NextResponse.json({ candidates: [], logs: [], iboNumber: '' })

    const { data: candidates } = await sbAdmin
      .from('candidates')
      .select('*')
      .filter('interview_notes->>_sponsor_ibo', 'eq', iboNumber)
      .order('created_at', { ascending: false })

    const ids = (candidates || []).map((c: any) => c.id)

    let logs: any[] = []
    if (ids.length > 0) {
      const { data } = await sbAdmin
        .from('contact_logs')
        .select('id,entity_id,entity_name,outcome,notes,next_action,next_date,created_at,event_type,fathom_link,objection')
        .in('entity_id', ids)
        .order('created_at', { ascending: false })
      logs = data || []
    }

    return NextResponse.json({ candidates: candidates || [], logs, iboNumber })
  } catch (e: any) {
    console.error('track/my-candidates error:', e); return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
