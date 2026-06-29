import { NextResponse } from 'next/server'
import { getSbAdmin, verifyUser } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const user = await verifyUser(req)
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const sbAdmin = getSbAdmin()

    // Get this member's IBO number
    const { data: member } = await sbAdmin
      .from('team_members')
      .select('ibo_number')
      .eq('user_id', user.id)
      .maybeSingle()

    // Load member's own candidates
    const { data: ownCandidates } = await sbAdmin
      .from('candidates')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    // Load admin-assigned candidates by IBO
    let sponsoredCandidates: any[] = []
    if (member?.ibo_number) {
      const { data: allCandidates } = await sbAdmin
        .from('candidates')
        .select('*')
        .order('created_at', { ascending: false })

      sponsoredCandidates = (allCandidates || []).filter((c: any) => {
        if (c.user_id === user.id) return false // already in own
        try {
          const notes = JSON.parse(c.interview_notes || '{}')
          return notes._sponsor_ibo === member.ibo_number
        } catch {
          return false
        }
      })
    }

    const candidates = [...(ownCandidates || []), ...sponsoredCandidates]
    const ids = candidates.map((c: any) => c.id)

    let logs: any[] = []
    if (ids.length > 0) {
      const { data } = await sbAdmin
        .from('contact_logs')
        .select('id,entity_id,entity_name,outcome,notes,next_action,next_date,created_at,event_type')
        .in('entity_id', ids)
        .order('created_at', { ascending: false })
      logs = data || []
    }

    return NextResponse.json({ candidates, logs, iboNumber: member?.ibo_number || '' })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
