import { NextResponse } from 'next/server'
import { z } from 'zod'
import { verifyUser } from '@/lib/supabase/admin'
import { isRateLimited, getClientIp } from '@/lib/ratelimit'
import { sendPushToUser } from '@/lib/push'
import { parseBody } from '@/lib/validate'

export const dynamic = 'force-dynamic'

// Fixed, server-defined message per event type -- the client sends only the
// type and the small bit of data each template needs, never free-text, so
// this can't be used to push arbitrary notification content to a user.
const bodySchema = z.object({
  type: z.enum(['habit_logged', 'streak_milestone', 'level_up']),
  streakDays: z.number().optional(),
  milestoneMsg: z.string().max(200).optional(),
  level: z.number().optional(),
})

// Called by the client right when one of these events happens, so the push
// arrives instantly instead of waiting for the once-daily reminder cron.
export async function POST(req: Request) {
  if (await isRateLimited(`team-notify-event:post:${getClientIp(req)}`, 30, 60_000))
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

  const user = await verifyUser(req)
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const parsed = await parseBody(req, bodySchema)
  if (parsed.res) return parsed.res
  const { type, streakDays, milestoneMsg, level } = parsed.data

  try {
    let title = ''; let body = ''; let url = '/'
    if (type === 'habit_logged') {
      title = '✅ Habit logged'
      body = "Nice work — today's activity is saved."
      url = '/?tab=habits'
    } else if (type === 'streak_milestone') {
      title = `🔥 ${streakDays ?? ''}-day streak!`
      body = milestoneMsg || 'Keep it going.'
      url = '/?tab=habits'
    } else if (type === 'level_up') {
      title = '🎉 Level up!'
      body = level ? `You're now Level ${level}.` : "You've been upgraded."
      url = '/'
    } else {
      return NextResponse.json({ error: 'unknown_type' }, { status: 400 })
    }
    const result = await sendPushToUser(user.id, title, body, url)
    return NextResponse.json({ ok: true, ...result })
  } catch (e: any) {
    console.error('notify-event error:', e)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
