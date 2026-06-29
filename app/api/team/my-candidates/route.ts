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

    // Admin fallback: if no team_members row, use ADMIN_IBO env var.
    // Mirrors admin OS "My Candidates" filter: candidates with no _sponsor_ibo OR _sponsor_ibo === adminIbo.
    const iboNumber = member?.ibo_number || ''
    const adminIbo = process.env.ADMIN_IBO || ''
    const isAdmin = !iboNumber && !!adminIbo && user.email?.toLowerCase() === (process.env.NEXT_PUBLIC_ADMIN_EMAIL || '').toLowerCase()

    if (!iboNumber && !isAdmin) return NextResponse.json({ candidates: [], logs: [], iboNumber: '' })

    const { data: allCandidates } = await sbAdmin
      .from('candidates')
      .select('*')
      .order('created_at', { ascending: false })

    const candidates = (allCandidates || []).filter((c: any) => {
      try {
        const notes = JSON.parse(c.interview_notes || '{}')
        const sponsor = notes._sponsor_ibo || ''
        if (isAdmin) {
          // Mirror admin OS "My Candidates": strictly assigned to admin IBO
          return sponsor === adminIbo
        }
        return sponsor === iboNumber
      } catch {
        return false
      }
    })

    const ids = candidates.map((c: any) => c.id)

    let logs: any[] = []
    if (ids.length > 0) {
      const { data } = await sbAdmin
        .from('contact_logs')
        .select('id,entity_id,entity_name,outcome,notes,next_action,next_date,created_at,event_type,fathom_link,objection')
        .in('entity_id', ids)
        .order('created_at', { ascending: false })
      logs = data || []
    }

    return NextResponse.json({ candidates, logs, iboNumber: isAdmin ? adminIbo : iboNumber })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
