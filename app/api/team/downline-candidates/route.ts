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
      .select('level, ibo_number, name')
      .eq('user_id', user.id)
      .maybeSingle() as { data: { level: number; ibo_number: string; name: string } | null }

    if (!member || (member.level || 1) < 4) {
      return NextResponse.json({ error: 'Level 4 required' }, { status: 403 })
    }

    const myIbo = member.ibo_number || ''
    if (!myIbo) return NextResponse.json({ candidates: [], logs: [], memberMap: {} })

    // Get direct reports in the member's downline
    const { data: directReports } = await sbAdmin
      .from('team_members')
      .select('ibo_number, name, user_id')
      .eq('referred_by', myIbo)

    const reportIbos = (directReports || []).map((r: any) => r.ibo_number).filter(Boolean)

    const memberMap: Record<string, string> = {}
    ;(directReports || []).forEach((r: any) => { if (r.ibo_number) memberMap[r.ibo_number] = r.name })

    if (reportIbos.length === 0) return NextResponse.json({ candidates: [], logs: [], memberMap })

    // Fetch candidates for all direct reports in parallel
    const candidateResults = await Promise.all(
      reportIbos.map(ibo =>
        sbAdmin.from('candidates').select('*')
          .filter('interview_notes->>_sponsor_ibo', 'eq', ibo)
          .order('created_at', { ascending: false })
      )
    )
    const allCandidates: any[] = candidateResults.flatMap(r => r.data || [])

    const ids = allCandidates.map((c: any) => c.id)
    let logs: any[] = []
    if (ids.length > 0) {
      const { data } = await sbAdmin
        .from('contact_logs')
        .select('id,entity_id,entity_name,outcome,notes,next_action,next_date,created_at,event_type,fathom_link,objection')
        .in('entity_id', ids)
        .order('created_at', { ascending: false })
      logs = data || []
    }

    return NextResponse.json({ candidates: allCandidates, logs, memberMap })
  } catch (e: any) {
    console.error('track/downline-candidates error:', e); return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
