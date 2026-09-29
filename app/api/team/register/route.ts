export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getSbAdmin, verifyUser, resolveAdminId } from '@/lib/supabase/admin'
import { isRateLimited, getClientIp } from '@/lib/ratelimit'
import { notifyAdminError } from '@/lib/notify'
import { sendPushToUser } from '@/lib/push'
import { relinkUserData } from '@/lib/supabase/relink'
import { parseBody } from '@/lib/validate'

const bodySchema = z.object({
  ibo: z.string(),
  name: z.string().optional(),
})

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
  if (await isRateLimited(`team-register:post:${getClientIp(req)}`, 10, 60_000))
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const parsed = await parseBody(req, bodySchema)
  if (parsed.res) return parsed.res
  const ibo = parsed.data.ibo.trim()
  const name = String(parsed.data.name || '').trim().slice(0, 200)
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
      .select('user_id, name, ibo_number, status, level, email').eq('ibo_number', ibo).maybeSingle()
    if (existingErr) return NextResponse.json({ error: 'db_error' }, { status: 500 })

    if (existing && existing.user_id !== user.id) {
      // IBO numbers can be enumerated (verify-ibo returns a name for any
      // valid-looking number, rate-limited but not secret), so this branch
      // used to let ANY signed-in Google account take over an existing
      // member's account -- just by knowing their IBO, with no proof it was
      // the same person. The only thing recoverable from here is whether the
      // new login's email matches the email already on file for this IBO.
      // Without a match, refuse the auto-relink and tell the admin instead,
      // rather than moving someone's whole history to a stranger's account.
      const existingEmail = String(existing.email || '').trim().toLowerCase()
      const callerEmail = (user.email || '').trim().toLowerCase()
      const emailsMatch = !!existingEmail && !!callerEmail && existingEmail === callerEmail
      if (!emailsMatch) {
        notifyAdminError(
          `Blocked account re-link — IBO ${ibo}`,
          [
            `Someone signed in and tried to register with IBO ${ibo}, which is already linked to a different account.`,
            `Existing account: ${existing.user_id}${existing.email ? ' (' + existing.email + ')' : ''}`,
            `Attempting account: ${user.id}${user.email ? ' (' + user.email + ')' : ''}`,
            '',
            'The email on the new login did not match the email on file, so this was blocked automatically.',
            'If this IS the same person (e.g. they changed Google accounts), relink them manually in Organisation, or ask them to sign in with their original email.',
          ].join('\n'),
        ).catch(e => console.error('team/register blocked-relink email error:', e))
        return NextResponse.json({ error: 'relink_requires_admin', message: 'This IBO is already linked to a different account. Ask your admin to reconnect it.' }, { status: 409 })
      }

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
