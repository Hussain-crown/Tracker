import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { getSbAdmin } from '@/lib/supabase/admin'
import { isRateLimited, getClientIp } from '@/lib/ratelimit'
import { sendPushToUser } from '@/lib/push'

export const dynamic = 'force-dynamic'

function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

const STAGES = ['New', 'Connected', 'MPA', 'Catch-Up', 'DTM']

// Server-to-server only: backs Operations' team/all-prospects admin feature.
// Team members' own `leads` and `contact_logs` (entity_type='lead') live
// exclusively in this project's database — this mirrors the exact
// operations that page performs (list, log a contact, advance a lead's
// stage, claim a lead ahead of converting it to a candidate, dedup cleanup)
// against the real data instead of Operations' own frozen copy.
export async function POST(req: Request) {
  if (await isRateLimited(getClientIp(req), 30, 60_000))
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  const provided = req.headers.get('x-internal-secret') || ''
  const expected = process.env.INTERNAL_BRIDGE_SECRET || ''
  if (!expected || !secretMatches(provided, expected)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  const op = String(body?.op || '')
  const sb = getSbAdmin()

  try {
    switch (op) {
      case 'list': {
        const { data: members, error: membersErr } = await sb.from('team_members').select('*').eq('role', 'member').eq('status', 'active')
        if (membersErr) return NextResponse.json({ error: 'db_error' }, { status: 500 })
        const memberIds = (members || []).map((m: any) => m.user_id)
        if (!memberIds.length) return NextResponse.json({ members: [], leads: [], logs: [] })

        const sinceISO = String(body?.sinceISO || new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString())
        const [leadsRes, logsRes] = await Promise.all([
          sb.from('leads').select('*').in('user_id', memberIds).not('archived', 'is', true).limit(5000),
          sb.from('contact_logs').select('*').in('user_id', memberIds).eq('entity_type', 'lead').gte('created_at', sinceISO).order('created_at', { ascending: false }),
        ])
        if (leadsRes.error) return NextResponse.json({ error: 'db_error' }, { status: 500 })
        if (logsRes.error) return NextResponse.json({ error: 'db_error' }, { status: 500 })
        return NextResponse.json({ members: members || [], leads: leadsRes.data || [], logs: logsRes.data || [] })
      }

      case 'validate_member': {
        const userId = String(body?.userId || '')
        if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })
        const { data, error } = await sb.from('team_members').select('user_id').eq('user_id', userId).maybeSingle()
        if (error) return NextResponse.json({ error: 'db_error' }, { status: 500 })
        return NextResponse.json({ found: !!data })
      }

      case 'active_member_owns_lead': {
        const userId = String(body?.userId || '')
        if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })
        const { data, error } = await sb.from('team_members').select('user_id').eq('user_id', userId).eq('role', 'member').eq('status', 'active').maybeSingle()
        if (error) return NextResponse.json({ error: 'db_error' }, { status: 500 })
        return NextResponse.json({ found: !!data })
      }

      // Used by Operations' booking submit flow to best-effort prefill a
      // booking from a matching lead already in the booker's own pipeline.
      case 'leads_for_user': {
        const userId = String(body?.userId || '')
        if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })
        const { data, error } = await sb.from('leads').select('*').eq('user_id', userId).not('archived', 'is', true).limit(500)
        if (error) return NextResponse.json({ error: 'db_error' }, { status: 500 })
        return NextResponse.json({ leads: data || [] })
      }

      case 'lead_owner': {
        const leadId = String(body?.leadId || '')
        if (!leadId) return NextResponse.json({ error: 'leadId required' }, { status: 400 })
        const { data, error } = await sb.from('leads').select('user_id').eq('id', leadId).maybeSingle()
        if (error) return NextResponse.json({ error: 'db_error' }, { status: 500 })
        return NextResponse.json({ lead: data || null })
      }

      case 'log_contact': {
        const { memberUserId, leadId, leadName, outcome, notes, next_action, next_date, objection } = body
        if (!memberUserId || !leadId) return NextResponse.json({ error: 'memberUserId and leadId required' }, { status: 400 })
        const now = new Date().toISOString()
        const { error: logErr } = await sb.from('contact_logs').insert({
          id: crypto.randomUUID(),
          user_id: memberUserId,
          entity_type: 'lead',
          entity_id: leadId,
          entity_name: (leadName || '').slice(0, 200),
          event_type: 'contact',
          outcome: (outcome || '').slice(0, 100),
          notes: (notes || '').slice(0, 2000),
          fathom_link: '',
          next_action: (next_action || '').slice(0, 300),
          next_date: (next_date || '').slice(0, 20),
          objection: (objection || '').slice(0, 500),
          created_at: now,
        })
        if (logErr) return NextResponse.json({ error: 'db_error' }, { status: 500 })
        const { error: leadErr } = await sb.from('leads').update({
          next_action: next_action || '', next_action_date: next_date || '', updated_at: now,
        }).eq('id', leadId)
        if (leadErr) return NextResponse.json({ error: 'db_error' }, { status: 500 })
        return NextResponse.json({ ok: true })
      }

      case 'advance_stage': {
        const leadId = String(body?.leadId || '')
        const currentStage = String(body?.currentStage || '')
        if (!leadId) return NextResponse.json({ error: 'leadId required' }, { status: 400 })
        const idx = STAGES.indexOf(currentStage)
        if (idx < 0) return NextResponse.json({ error: 'unknown stage' }, { status: 400 })
        if (idx >= STAGES.length - 1) return NextResponse.json({ error: 'already at final stage' }, { status: 400 })
        const nextStage = STAGES[idx + 1]
        const { error } = await sb.from('leads').update({ stage: nextStage, updated_at: new Date().toISOString() }).eq('id', leadId)
        if (error) return NextResponse.json({ error: 'db_error' }, { status: 500 })
        return NextResponse.json({ ok: true, nextStage })
      }

      case 'get_lead': {
        const leadId = String(body?.leadId || '')
        if (!leadId) return NextResponse.json({ error: 'leadId required' }, { status: 400 })
        const { data, error } = await sb.from('leads').select('*').eq('id', leadId).maybeSingle()
        if (error) return NextResponse.json({ error: 'db_error' }, { status: 500 })
        return NextResponse.json({ lead: data || null })
      }

      // Atomically claim the lead (archive it) so two near-simultaneous
      // conversions can't both succeed — mirrors the exact same conditional
      // update Operations used to run locally.
      case 'claim_lead': {
        const leadId = String(body?.leadId || '')
        if (!leadId) return NextResponse.json({ error: 'leadId required' }, { status: 400 })
        const now = new Date().toISOString()
        const { data: claimed, error: claimErr } = await sb.from('leads')
          .update({ archived: true, updated_at: now })
          .eq('id', leadId).not('archived', 'is', true)
          .select('*')
        if (claimErr) return NextResponse.json({ error: 'db_error' }, { status: 500 })
        if (!claimed?.length) return NextResponse.json({ ok: false, error: 'already_converted' }, { status: 409 })
        return NextResponse.json({ ok: true, lead: claimed[0] })
      }

      // Rollback for a claim whose downstream candidate insert (in
      // Operations' own database) failed — undoes the archive so the lead
      // isn't left stuck hidden with nothing to show for it.
      case 'unclaim_lead': {
        const leadId = String(body?.leadId || '')
        if (!leadId) return NextResponse.json({ error: 'leadId required' }, { status: 400 })
        const { error } = await sb.from('leads').update({ archived: false, updated_at: new Date().toISOString() }).eq('id', leadId)
        if (error) return NextResponse.json({ error: 'db_error' }, { status: 500 })
        return NextResponse.json({ ok: true })
      }

      // Best-effort: hand back a claimed lead's own contact history so
      // Operations can copy it forward onto the new candidate record it
      // creates in its own database — the two `contact_logs` tables are in
      // separate projects, so this can't be a single cross-database UPDATE
      // the way the original same-database version was.
      case 'contact_logs_for_lead': {
        const leadId = String(body?.leadId || '')
        if (!leadId) return NextResponse.json({ error: 'leadId required' }, { status: 400 })
        const { data, error } = await sb.from('contact_logs').select('*').eq('entity_id', leadId).eq('entity_type', 'lead')
        if (error) return NextResponse.json({ error: 'db_error' }, { status: 500 })
        return NextResponse.json({ logs: data || [] })
      }

      // Used by Operations' booking submit flow to auto-credit a Pre-Filter
      // booking toward the booker's daily habit count. habits lives
      // exclusively in this project's database now, for every member
      // including the admin (Tracker's own Habits page is what everyone,
      // admin included, actually logs against) — so "self-booked" resolves
      // to Tracker's own ADMIN_USER_ID rather than anything Operations knows.
      case 'increment_habit': {
        const HABIT_FIELDS = ['interruptions', 'convo', 'mpa', 'contact', 'catch_up', 'dtm', 'pre_filter', 'mg1', 'launch']
        const field = String(body?.field || '')
        const date = String(body?.date || '')
        const iboNumber = body?.ibo_number ? String(body.ibo_number) : null
        if (!HABIT_FIELDS.includes(field) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          return NextResponse.json({ error: 'invalid_input' }, { status: 400 })
        }
        let userId: string | null = null
        if (iboNumber) {
          const { data: m } = await sb.from('team_members').select('user_id').eq('ibo_number', iboNumber).maybeSingle()
          userId = (m?.user_id as string | undefined) ?? null
        } else {
          userId = process.env.ADMIN_USER_ID || null
        }
        if (!userId) return NextResponse.json({ ok: false, error: 'no_user_resolved' })

        const { data: existing } = await sb.from('habits').select(field).eq('user_id', userId).eq('date', date).maybeSingle()
        if (existing) {
          const current = (existing as any)[field] || 0
          const { error } = await sb.from('habits').update({ [field]: current + 1 }).eq('user_id', userId).eq('date', date)
          if (error) return NextResponse.json({ error: 'db_error' }, { status: 500 })
        } else {
          const row: Record<string, any> = { id: crypto.randomUUID(), user_id: userId, date }
          for (const f of HABIT_FIELDS) row[f] = f === field ? 1 : 0
          const { error } = await sb.from('habits').insert(row)
          if (error) return NextResponse.json({ error: 'db_error' }, { status: 500 })
        }
        return NextResponse.json({ ok: true })
      }

      // Relay for Operations' push-reminders cron: push_subscriptions lives
      // exclusively in this project's database now, so a team member's
      // push subscription is invisible to Operations' own push sender —
      // it must actually be sent from here.
      case 'send_push': {
        const userId = String(body?.userId || '')
        const title = String(body?.title || '')
        const pushBody = String(body?.body || '')
        const url = typeof body?.url === 'string' ? body.url : '/'
        if (!userId || !title || !pushBody) return NextResponse.json({ error: 'invalid_input' }, { status: 400 })
        const result = await sendPushToUser(userId, title, pushBody, url)
        return NextResponse.json({ ok: true, ...result })
      }

      case 'cleanup': {
        const { data: members, error: membersErr } = await sb.from('team_members').select('user_id').eq('role', 'member').eq('status', 'active')
        if (membersErr) return NextResponse.json({ error: 'db_error' }, { status: 500 })
        const memberIds = (members || []).map((m: any) => m.user_id)
        if (!memberIds.length) return NextResponse.json({ ok: true, deleted: 0 })
        const { data: rawLeads, error: rawLeadsErr } = await sb.from('leads').select('id, phone, created_at').not('archived', 'is', true).in('user_id', memberIds)
        if (rawLeadsErr) return NextResponse.json({ error: 'db_error' }, { status: 500 })
        const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000
        const allLeads: any[] = rawLeads || []
        const phoneGrps: Record<string, any[]> = {}
        allLeads.forEach((l: any) => {
          const p = (l.phone || '').replace(/\D/g, '')
          if (p.length >= 8) { if (!phoneGrps[p]) phoneGrps[p] = []; phoneGrps[p].push(l) }
        })
        const staleIds: string[] = []
        Object.values(phoneGrps).forEach((group: any[]) => {
          if (group.length < 2) return
          const sorted = [...group].sort((a: any, b: any) => a.created_at.localeCompare(b.created_at))
          sorted.slice(1).forEach((l: any) => {
            if (Date.now() - new Date(l.created_at).getTime() > THREE_DAYS_MS) staleIds.push(l.id)
          })
        })
        if (staleIds.length > 0) {
          const { error: deleteErr } = await sb.from('leads').delete().in('id', staleIds)
          if (deleteErr) return NextResponse.json({ error: 'db_error' }, { status: 500 })
        }
        return NextResponse.json({ ok: true, deleted: staleIds.length })
      }

      default:
        return NextResponse.json({ error: 'unknown_op' }, { status: 400 })
    }
  } catch (e: any) {
    console.error('team/prospects error:', e)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
