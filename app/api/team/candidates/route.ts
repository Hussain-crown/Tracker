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
    if (!adminId) return NextResponse.json({ error: 'admin_not_configured' }, { status: 500 })

    // Explicit whitelist — team members must not overwrite protected fields (user_id, created_at, sponsor_ibo, etc.)
    const ALLOWED = new Set([
      'id','name','email','phone','stage','source','interview_notes','status',
      'booker_ibo','hxl_score','hunger','looking',
      'relationship','age_range','life_stage','primary_driver','pain_point',
      'next_action','next_action_date',
    ])
    const payload: Record<string,any> = { user_id: adminId, updated_at: new Date().toISOString() }
    if (typeof body === 'object' && body !== null) {
      for (const key of Object.keys(body as object)) {
        if (ALLOWED.has(key)) payload[key] = (body as any)[key]
      }
    }

    // Ownership check: team member may only edit candidates they sponsor (scoped to admin tenant)
    if (payload.id) {
      const { data: existing } = await sbAdmin.from('candidates').select('sponsor_ibo').eq('id', payload.id).eq('user_id', adminId).maybeSingle()
      if (!existing) return NextResponse.json({ error: 'not_found' }, { status: 404 })
      // null sponsor_ibo = unassigned candidate; any team member may edit it (the unassigned tab surfaces these rows)
      if (existing.sponsor_ibo !== null && existing.sponsor_ibo !== member.ibo_number) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    } else {
      // New candidate — stamp sponsor_ibo so subsequent ownership checks pass
      payload.sponsor_ibo = member.ibo_number
    }

    const { error } = await sbAdmin.from('candidates').upsert(payload, { onConflict: 'id' })
    if (error) { console.error('team/candidates upsert error:', error); return NextResponse.json({ error: 'upsert_failed' }, { status: 500 }) }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('track/team/candidates error:', e); return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
