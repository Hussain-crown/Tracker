import { NextResponse } from 'next/server'
import { getSbAdmin, verifyUser } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const STAGES = ['Pre-Filter','MG1','MG2','FU1','FU2','FU3','Offer Questions','Offer Call']

export async function POST(req: Request) {
  try {
    const user = await verifyUser(req)
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const sbAdmin = getSbAdmin()

    const { data: member, error: memberErr } = await sbAdmin
      .from('team_members')
      .select('level, ibo_number')
      .eq('user_id', user.id)
      .maybeSingle()
    if (memberErr) {
      console.error('team_members fetch failed:', memberErr)
      return NextResponse.json({ error: 'internal_error' }, { status: 500 })
    }

    if (!member || (Number(member.level) || 1) < 2) {
      return NextResponse.json({ error: 'Level 2 required' }, { status: 403 })
    }

    let body: any
    try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
    const { action, candidateId } = body
    if (!candidateId) return NextResponse.json({ error: 'missing candidateId' }, { status: 400 })

    const adminId = process.env.ADMIN_USER_ID || ''
    if (!adminId) return NextResponse.json({ error: 'configuration_error' }, { status: 500 })
    const { data: candidate, error: candidateErr } = await sbAdmin
      .from('candidates')
      .select('id, name, stage, interview_notes, status, sponsor_ibo')
      .eq('id', candidateId)
      .eq('user_id', adminId)
      .maybeSingle()
    if (candidateErr) {
      console.error('candidate fetch failed:', candidateErr)
      return NextResponse.json({ error: 'internal_error' }, { status: 500 })
    }
    if (!candidate) return NextResponse.json({ error: 'not found' }, { status: 404 })
    if (!candidate.sponsor_ibo) {
      return NextResponse.json({ error: 'unassigned_candidate' }, { status: 403 })
    }
    if (candidate.sponsor_ibo !== member.ibo_number) {
      return NextResponse.json({ error: 'not your candidate' }, { status: 403 })
    }

    let notes: any = {}
    const raw = candidate.interview_notes
    try { notes = typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw ?? {}) } catch {}

    const now = new Date().toISOString()

    if (action === 'log_contact') {
      const { outcome, notes: logNotes, nextDate, objection } = body
      const { error: logErr } = await sbAdmin.from('contact_logs').insert({
        id: crypto.randomUUID(),
        user_id: user.id,
        entity_type: 'candidate',
        entity_id: candidateId,
        entity_name: (candidate as any).name || candidateId,
        outcome: outcome || 'Neutral',
        notes: logNotes || '',
        next_date: nextDate || null,
        objection: objection || null,
        event_type: 'contact',
        created_at: now,
      })
      if (logErr) { console.error('log_contact insert failed:', logErr); return NextResponse.json({ error: 'log_failed' }, { status: 500 }) }
      await sbAdmin.from('candidates').update({ updated_at: now }).eq('id', candidateId)
      return NextResponse.json({ ok: true })
    }

    if (action === 'advance_stage') {
      const STAGE_ALIASES: Record<string,string> = {
        'PF Completed':'Pre-Filter','MG1 Booked':'MG1','MG1 Completed':'MG1',
        'MG2 Booked':'MG2','MG2 Completed':'MG2','Follow-Up':'FU1',
        'Offer':'Offer Call','Review':'Offer Call',
      }
      const effectiveStage = STAGE_ALIASES[candidate.stage as string] ?? (candidate.stage as string)
      const idx = STAGES.indexOf(effectiveStage)
      const nextStage = idx >= 0 && idx < STAGES.length - 1 ? STAGES[idx + 1] : null
      if (!nextStage) return NextResponse.json({ error: 'already at final stage' }, { status: 400 })

      const history = notes._stage_history || []
      history.push({ stage: candidate.stage as string, date: now.slice(0, 10) })
      const newNotes = JSON.stringify({ ...notes, _stage_history: history })

      const { error: stageErr } = await sbAdmin.from('candidates').update({
        stage: nextStage,
        interview_notes: newNotes,
        updated_at: now,
      }).eq('id', candidateId)
      if (stageErr) { console.error('advance_stage update failed:', stageErr); return NextResponse.json({ error: 'update_failed' }, { status: 500 }) }

      await sbAdmin.from('contact_logs').insert({
        id: crypto.randomUUID(),
        user_id: user.id,
        entity_type: 'candidate',
        entity_id: candidateId,
        entity_name: (candidate as any).name || candidateId,
        outcome: 'Positive',
        notes: `Stage advanced to ${nextStage}`,
        event_type: 'advance',
        created_at: now,
      })
      return NextResponse.json({ ok: true, stage: nextStage })
    }

    if (action === 'dq') {
      const { reason } = body
      const { error: dqErr } = await sbAdmin.from('candidates').update({
        status: 'disqualified',
        updated_at: now,
      }).eq('id', candidateId)
      if (dqErr) { console.error('dq update failed:', dqErr); return NextResponse.json({ error: 'update_failed' }, { status: 500 }) }

      await sbAdmin.from('contact_logs').insert({
        id: crypto.randomUUID(),
        user_id: user.id,
        entity_type: 'candidate',
        entity_id: candidateId,
        entity_name: (candidate as any).name || candidateId,
        outcome: 'Negative',
        notes: reason || 'Disqualified',
        event_type: 'disqualified',
        created_at: now,
      })
      return NextResponse.json({ ok: true })
    }

    if (action === 'update_notes') {
      const { notes: newNotes } = body
      const merged = JSON.stringify({ ...notes, __notes: typeof newNotes === 'string' ? newNotes : '' })
      const { error: notesErr } = await sbAdmin.from('candidates').update({ interview_notes: merged, updated_at: now }).eq('id', candidateId)
      if (notesErr) { console.error('update_notes failed:', notesErr); return NextResponse.json({ error: 'update_failed' }, { status: 500 }) }
      return NextResponse.json({ ok: true })
    }

    if (action === 'launch') {
      if (candidate.status !== 'active') return NextResponse.json({ error: 'candidate not active' }, { status: 400 })
      const stageHistory = notes._stage_history || []
      stageHistory.push({ stage: candidate.stage as string, date: now.slice(0, 10) })
      const merged = JSON.stringify({ ...notes, _launched_at: now.slice(0, 10), _stage_history: stageHistory, _next_meeting: null })
      const { error: launchErr } = await sbAdmin.from('candidates').update({
        status: 'launched',
        interview_notes: merged,
        updated_at: now,
      }).eq('id', candidateId)
      if (launchErr) { console.error('launch update failed:', launchErr); return NextResponse.json({ error: 'update_failed' }, { status: 500 }) }
      await sbAdmin.from('contact_logs').insert({
        id: crypto.randomUUID(),
        user_id: user.id,
        entity_type: 'candidate',
        entity_id: candidateId,
        entity_name: (candidate as any).name || candidateId,
        outcome: 'Positive',
        notes: 'Launched as team member',
        event_type: 'launched',
        created_at: now,
      })
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'unknown action' }, { status: 400 })
  } catch (e: any) {
    console.error('track/candidates/action error:', e); return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
