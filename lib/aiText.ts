// Rule-based "AI" text generation — zero cost, no API key, no network call.
// Built so each function's call site can later be swapped for a real LLM call
// (e.g. POST /api/ai) without changing the surrounding component code: just
// replace the function body with a fetch, same input shape, same return type.

export type PreCallBriefInput = {
  name: string
  stageLabel?: string | null
  daysSinceContact?: number | null
  driver?: string | null
  painPoint?: string | null
  metricLabel?: string | null
  metricValue?: string | number | null
  notes?: string | null
  recentOutcomes?: string[]
  nextAction?: string | null
}

export function buildPreCallBrief(input: PreCallBriefInput): string {
  const { name, stageLabel, daysSinceContact, driver, painPoint, metricLabel, metricValue, notes, recentOutcomes, nextAction } = input
  const sentences: string[] = []

  if (daysSinceContact == null) {
    sentences.push(`No prior contact logged with ${name} — this is a cold or first touch.`)
  } else if (daysSinceContact >= 14) {
    sentences.push(`${daysSinceContact} days since you last spoke to ${name} — re-open warmly, don't assume they remember where things were left.`)
  } else if (daysSinceContact >= 7) sentences.push(`It's been ${daysSinceContact} days since contact — quick re-engage, low pressure.`)
  else sentences.push(`Last contact was ${daysSinceContact} day${daysSinceContact === 1 ? '' : 's'} ago — momentum is still warm, build on it directly.`)

  if (driver || painPoint) {
    sentences.push(`Lead with ${driver ? `their driver (${driver})` : 'what matters to them'}${painPoint ? `, and speak to their pain point: ${painPoint}.` : '.'}`)
  }

  if (recentOutcomes && recentOutcomes.length) {
    const last = recentOutcomes[0]
    if (/negative|objection|no/i.test(last)) sentences.push(`Last interaction was ${last.toLowerCase()} — address that before pushing forward, don't repeat the same pitch.`)
    else sentences.push(`Last interaction was ${last.toLowerCase()} — build on that, don't reset the conversation.`)
  }

  if (stageLabel) sentences.push(`They're at "${stageLabel}"${nextAction ? ` — the goal this call is to move them toward: ${nextAction}.` : '.'}`)
  if (metricLabel && metricValue != null) sentences.push(`${metricLabel}: ${metricValue}.`)
  if (notes) sentences.push(`Note from last time: "${notes.slice(0, 140)}"`)

  sentences.push(`Ask one direct question: what's actually stopping them right now?`)

  return sentences.slice(0, 5).join(' ')
}

export type HabitCoachInput = {
  todayScore: number
  mg1Today: number
  convoToday: number
  mg1Goal: number
  monthMg1: number
  monthConvo: number
  targetMg1: number
  targetConvo: number
  daysLeftInMonth: number
  sevenDayAvgMg1: number
  sevenDayAvgConvo: number
  streak: number
  consistency: number
}

export function buildHabitCoach(ctx: HabitCoachInput): string {
  const { todayScore, mg1Today, convoToday, mg1Goal, monthMg1, monthConvo, targetMg1, targetConvo, daysLeftInMonth, sevenDayAvgMg1, streak, consistency } = ctx
  const sentences: string[] = []

  if (todayScore >= 80) sentences.push(`Strong day — score of ${todayScore}, ${mg1Today} MG1${mg1Today === 1 ? '' : 's'} and ${convoToday} convos logged.`)
  else if (todayScore >= 50) sentences.push(`Average day — score of ${todayScore}. ${mg1Today === 0 ? 'No MG1s landed today.' : `${mg1Today} MG1${mg1Today === 1 ? '' : 's'} logged.`}`)
  else sentences.push(`Off day — score of ${todayScore}, well below your usual output.`)

  const mg1Pace = monthMg1 / Math.max(targetMg1, 1)
  const daysIntoMonth = 30 - daysLeftInMonth
  const expectedPace = daysIntoMonth / 30
  if (mg1Pace < expectedPace - 0.1) sentences.push(`You're behind pace on MG1s — ${monthMg1}/${targetMg1} this month with ${daysLeftInMonth} days left, need to pick up the rate.`)
  else if (mg1Pace >= expectedPace) sentences.push(`On or ahead of pace for MG1s — ${monthMg1}/${targetMg1} this month.`)

  if (consistency < 40) sentences.push(`Consistency is low (${consistency}) — that's binge-and-crash, not a sustainable rhythm.`)
  else if (streak >= 5) sentences.push(`${streak}-day streak — the consistency is working, don't break it now.`)

  const action = mg1Today === 0
    ? 'Tomorrow: lock in at least one MG1 before anything else.'
    : sevenDayAvgMg1 < targetMg1 / 30
    ? 'Tomorrow: push convos earlier in the day so MG1s have room to land.'
    : 'Tomorrow: keep the same routine, it is producing results.'
  sentences.push(action)

  return sentences.join(' ')
}
