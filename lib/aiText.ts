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

// Suggests how many days to wait before the next follow-up based on how the
// last contact went, relative to the entity's normal contact cadence.
export function suggestFollowUpDays(outcome: string, baseCadenceDays = 7): { days: number; rationale: string } {
  const o = (outcome || '').toLowerCase()

  if (o.includes('negative')) {
    return { days: Math.max(baseCadenceDays, 10), rationale: 'Negative outcome — give it more space before re-approaching, don\'t crowd them.' }
  }
  if (o.includes('no show')) {
    return { days: 2, rationale: 'No show — retry soon, before it slips their mind entirely.' }
  }
  if (o.includes('positive')) {
    return { days: Math.max(1, Math.round(baseCadenceDays / 2)), rationale: 'Positive outcome — keep the momentum going, don\'t let it go cold.' }
  }
  if (o.includes('not yet')) {
    return { days: baseCadenceDays, rationale: 'Not ready yet — check back on the normal cadence rather than chasing.' }
  }
  return { days: baseCadenceDays, rationale: 'Neutral outcome — standard cadence applies.' }
}

export type DailyBriefingInput = {
  gpv: number
  bracketLabel: string
  gpvToNext: number
  habitStreak: number
  weekMg1: number
  weekConvo: number
  healthScore: number
  consistencyScore: number
  overdueContacts: number
  staleLeads: number
  activeCandidates: number
  inactionDays: number
  isLowMode: boolean
}

export function buildDailyBriefing(ctx: DailyBriefingInput): string {
  const { gpv, bracketLabel, gpvToNext, habitStreak, weekMg1, weekConvo, healthScore, consistencyScore, overdueContacts, staleLeads, activeCandidates, inactionDays, isLowMode } = ctx
  const lines: string[] = []

  lines.push(`${bracketLabel} bracket at ${gpv.toFixed(0)} GPV${gpvToNext > 0 ? ` — ${gpvToNext.toFixed(0)} to the next bracket.` : '.'}`)

  if (weekMg1 === 0) lines.push(`No MG1s yet this week — that's the priority today.`)
  else lines.push(`${weekMg1} MG1${weekMg1 === 1 ? '' : 's'} and ${weekConvo} convos this week.`)

  if (habitStreak >= 5) lines.push(`${habitStreak}-day logging streak — keep it going.`)
  else if (habitStreak === 0) lines.push(`Streak reset — log today to start rebuilding it.`)

  if (overdueContacts > 0) lines.push(`${overdueContacts} overdue contact${overdueContacts === 1 ? '' : 's'} waiting on a follow-up.`)
  if (staleLeads > 0) lines.push(`${staleLeads} lead${staleLeads === 1 ? '' : 's'} stale (7+ days no update).`)
  if (activeCandidates > 0) lines.push(`${activeCandidates} active candidate${activeCandidates === 1 ? '' : 's'} in the pipeline.`)

  if (inactionDays > 7) lines.push(`${inactionDays} days since your last MG1 — that's the real cost driver right now.`)
  if (consistencyScore < 40) lines.push(`Output has been inconsistent lately — aim for steady daily activity over binge sessions.`)
  if (isLowMode) lines.push(`Low mode is on — smaller daily targets apply, don't punish yourself for it.`)
  else if (healthScore >= 80) lines.push(`Health score is strong (${healthScore}) — good position to push harder today.`)

  return lines.join(' ')
}
