import { NextResponse } from 'next/server'
import { sbAdmin, verifyUser, resolveAdminId } from '@/lib/supabase/admin'
import { notifyAdminError } from '@/lib/notify'
import { sendPushToUser } from '@/lib/push'

export const dynamic = 'force-dynamic'

// POST — called fire-and-forget after a member registers; notifies admin via email + push.
// Requires the caller to be authenticated as the registering member.
export async function POST(req: Request) {
  try {
    let body: any
    try { body = await req.json() } catch { return NextResponse.json({ ok: true }) }
    const { userId } = body || {}
    if (!userId || typeof userId !== 'string') return NextResponse.json({ ok: true })

    const caller = await verifyUser(req)
    if (!caller || caller.id !== userId) return NextResponse.json({ ok: true })

    // Verify the member actually exists and is pending — never notify for fabricated ids
    const { data: member } = await sbAdmin.from('team_members')
      .select('user_id,name,ibo_number,email,status').eq('user_id', userId).maybeSingle()
    if (!member || member.status !== 'pending') return NextResponse.json({ ok: true })

    const memberName = member.name || 'Unknown'
    const memberIbo  = member.ibo_number || ''
    const memberEmail = member.email || ''

    const subject = `New team member awaiting approval — ${memberName}`
    const bodyText = [
      `${memberName} (IBO ${memberIbo}${memberEmail ? ', ' + memberEmail : ''}) just registered and is waiting for your approval.`,
      '',
      'Log in to the admin OS → Team Tracker to approve or reject them.',
    ].join('\n')

    // Email admin (best-effort)
    await notifyAdminError(subject, bodyText).catch(e => console.error('notify-registration email error:', e))

    // Push notification to admin (best-effort)
    const adminId = await resolveAdminId()
    if (adminId) {
      await sendPushToUser(adminId, '👤 New member waiting', `${memberName} · IBO ${memberIbo} is pending approval`)
        .catch(e => console.error('notify-registration push error:', e))
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('notify-registration error:', e)
    return NextResponse.json({ ok: true }) // never fail the caller
  }
}
