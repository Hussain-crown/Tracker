export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getSbAdmin, verifyUser, resolveAdminId } from '@/lib/supabase/admin'
import { isRateLimited, getClientIp } from '@/lib/ratelimit'
import { notifyAdminError } from '@/lib/notify'
import { sendPushToUser } from '@/lib/push'
import { relinkUserData } from '@/lib/supabase/relink'

// Registers or re-links a team member by IBO number, server-side with the
// service-role client — the client-side equivalent of this (a direct
// `supabase.from('team_members').select(...).eq('ibo_number', ibo)` from the
// browser) is silently blind under RLS, since team_members_own_select only
// allows a user to see their OWN row. That meant the "is this IBO already
// linked to another account?" check could never actually see a conflict,
// and a member re-registering under a new Google account (email change, new
// device signed into a different account, etc.) would get a second,
// disconnected team_members row instead of being reconnected to their real
// one — an IBO must map to exactly one account.
export async function POST(req: Request) {
  if (await isRateLimited(getClientIp(req), 10, 60_000))
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  const ibo = String(body?.ibo || '').trim()
  const name = String(body?.name || '').trim().slice(0, 200)
  if (!/^\d{4,12}$/.test(ibo)) return NextResponse.json({ error: 'invalid_ibo' }, { status: 400 })

  const sb = getSbAdmin()
  const now = new Date().toISOString()

  try {
    // Does the caller already have a row, and is it for a different IBO?
    const { data: myRow, error: myRowErr } = await sb.from('team_members')
      .select('user_id, ibo_number, status, level').eq('user_id', user.id).maybeSingle()
    if (myRowErr) return NextResponse.json({ error: 'db_error' }, { status: 500 })

    if (myRow && myRow.ibo_number !== ibo) {
      return NextResponse.json({ error: 'account_linked_to_other_ibo', currentIbo: myRow.ibo_number }, { status: 409 })
    }

    // Does any row already exist for this IBO (possibly under a different account)?
    const { data: existing, error: existingErr } = await sb.from('team_members')
      .select('user_id, name, ibo_number, status, level').eq('ibo_number', ibo).maybeSingle()
    if (existingErr) return NextResponse.json({ error: 'db_error' }, { status: 500 })

    if (existing && existing.user_id !== user.id) {
      // One IBO, one account — re-point the existing record to the caller's
      // current auth id instead of creating a duplicate. Preserves their
      // approval status/level/history; only the auth link changes.
      const { data: updated, error: updErr } = await sb.from('team_members')
        .update({
          user_id: user.id,
          name: name || existing.name,
          email: user.email || '',
          updated_at: now,
        })
        .eq('ibo_number', ibo)
        .select('*')
        .maybeSingle()
      if (updErr) {
        console.error('team/register re-link failed:', updErr.message)
        return NextResponse.json({ error: 'relink_failed' }, { status: 500 })
      }

      // A re-link changes who controls an existing account — this must never happen
      // silently. Alert the admin every time, the same way a brand-new registration
      // does, so an unexpected account transfer (wrong person, guessed IBO, a member
      // relinking under a Google account that isn't actually theirs) gets noticed
      // instead of going unnoticed indefinitely.
      const subject = `Team tracker account re-linked — ${updated?.name || name || ibo}`

      // A re-link means this IBO's whole history — leads, habits, contact
      // logs, goals — still sits under their old auth id from before this
      // project got its own database. Move it over now, in the same action,
      // rather than leaving it invisible under RLS until someone notices
      // and manually re-points it (the exact bug the admin himself hit).
      const relinkResults = await relinkUserData(sb, existing.user_id as string, user.id)
      const moved = relinkResults.filter(r => r.moved > 0)
      const failed = relinkResults.filter(r => r.error)

      const bodyText = [
        `IBO ${ibo} (${updated?.name || name}) was just re-linked to a different login.`,
        `Previous account: ${existing.user_id}`,
        `New account: ${user.id}${user.email ? ' (' + user.email + ')' : ''}`,
        '',
        moved.length
          ? `Historical data moved: ${moved.map(r => `${r.table} (${r.moved})`).join(', ')}`
          : 'No historical data found under the previous account.',
        failed.length ? `\nFAILED to move (needs manual SQL): ${failed.map(r => `${r.table}: ${r.error}`).join('; ')}` : '',
        '',
        "If this wasn't expected, check Team Tracker in the admin OS.",
      ].join('\n')
      notifyAdminError(subject, bodyText).catch(e => console.error('team/register relink email error:', e))
      resolveAdminId().then(adminId => {
        if (adminId) sendPushToUser(adminId, '🔄 Account re-linked', `${updated?.name || name} (IBO ${ibo}) switched accounts`).catch(() => {})
      }).catch(() => {})

      return NextResponse.json({ ok: true, member: updated, relinked: true, dataRelinked: moved.map(r => r.table) })
    }

    if (existing && existing.user_id === user.id) {
      // Already the caller's own row — update display fields only, never status/level.
      const { data: updated, error: updErr } = await sb.from('team_members')
        .update({ name: name || existing.name, email: user.email || '', updated_at: now })
        .eq('user_id', user.id)
        .select('*')
        .maybeSingle()
      if (updErr) return NextResponse.json({ error: 'update_failed' }, { status: 500 })
      return NextResponse.json({ ok: true, member: updated, relinked: false })
    }

    // Brand new — no row for this IBO or this user at all.
    const { data: inserted, error: insErr } = await sb.from('team_members').insert({
      user_id: user.id,
      name: name || (user.email ? user.email.split('@')[0] : 'Member'),
      ibo_number: ibo,
      leg: ibo,
      email: user.email || '',
      role: 'member',
      referred_by: '',
      first_login: true,
      status: 'pending',
      baseline_set: true,
      seen_milestones: '[]',
      created_at: now,
      updated_at: now,
    }).select('*').maybeSingle()
    if (insErr) {
      console.error('team/register insert failed:', insErr.message)
      return NextResponse.json({ error: 'insert_failed' }, { status: 500 })
    }
    return NextResponse.json({ ok: true, member: inserted, relinked: false, isNew: true })
  } catch (e: any) {
    console.error('team/register error:', e)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
