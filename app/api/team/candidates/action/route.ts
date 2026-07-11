import { NextResponse } from 'next/server'
import { getSbAdmin, verifyUser } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const STAGES = ['Pre-Filter','MG1','MG2','FU1','FU2','FU3','Offer Questions','Offer Call']

export async function POST(req: Request) {
  try {
    const user = await verifyUser(req)
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const sbAdmin = getSbAdmin()

    const { data: member } = await sbAdmin
      .from('team_members')
      .select('level, ibo_number')
      .eq('user_id', user.id)
      .maybeSingle() as { data: { level: number; ibo_number: string } | null }

    if (!member || (member.level || 1) < 3) {
      return NextResponse.json({ error: 'Level 3 required' }, { status: 403 })
    }

    const body = await req.json()
    const { action, candidateId } = body
    if (!candidateId) return NextResponse.json({ error: 'missing candidateId' }, { status: 400 })

    const { data: candidate } = await sbAdmin
      .from('candidates')
      .select('id, stage, interview_notes, status')
      .eq('id', candidateId)
      .maybeSingle()

    if (!candidate) return NextResponse.json({ error: 'not found' }, { status: 404 })

    let notes: any = {}
    try { notes = JSON.parse((candidate.interview_notes as string) || '{}') } catch {}
    if (notes._sponsor_ibo !== member.ibo_number) {
      return NextResponse.json({ error: 'not your candidate' }, { status: 403 })
    }

    const now = new Date().toISOString()

    if (action === 'log_contact') {
      const { outcome, notes: logNotes, nextDate, objection } = body
      await sbAdmin.from('contact_logs').insert({
        id: crypto.randomUUID(),
        entity_id: candidateId,
        entity_name: candidate.stage,
        outcome: outcome || 'Neutral',
        notes: logNotes || '',
        next_date: nextDate || null,
        objection: objection || null,
        event_type: 'contact',
        created_at: now,
      })
      await sbAdmin.from('candidates').update({ updated_at: now }).eq('id', candidateId)
      return NextResponse.json({ ok: true })
    }

    if (action === 'advance_stage') {
      const idx = STAGES.indexOf(candidate.stage as string)
      const nextStage = idx >= 0 && idx < STAGES.length - 1 ? STAGES[idx + 1] : null
      if (!nextStage) return NextResponse.json({ error: 'already at final stage' }, { status: 400 })

      const history = notes._stage_history || []
      history.push({ stage: candidate.stage as string, date: now.slice(0, 10) })
      const newNotes = JSON.stringify({ ...notes, _stage_history: history })

      await sbAdmin.from('candidates').update({
        stage: nextStage,
        interview_notes: newNotes,
        updated_at: now,
      }).eq('id', candidateId)

      await sbAdmin.from('contact_logs').insert({
        id: crypto.randomUUID(),
        entity_id: candidateId,
        entity_name: `Advanced to ${nextStage}`,
        outcome: 'Positive',
        notes: `Stage advanced to ${nextStage}`,
        event_type: 'advance',
        created_at: now,
      })
      return NextResponse.json({ ok: true, stage: nextStage })
    }

    if (action === 'dq') {
      const { reason } = body
      await sbAdmin.from('candidates').update({
        status: 'disqualified',
        updated_at: now,
      }).eq('id', candidateId)

      await sbAdmin.from('contact_logs').insert({
        id: crypto.randomUUID(),
        entity_id: candidateId,
        entity_name: 'DQ',
        outcome: 'Negative',
        notes: reason || 'Disqualified',
        event_type: 'disqualified',
        created_at: now,
      })
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'unknown action' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
