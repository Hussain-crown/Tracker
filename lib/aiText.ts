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
