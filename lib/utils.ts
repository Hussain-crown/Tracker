export const uid      = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
export const now      = () => new Date().toISOString()
// Brisbane UTC+10, no daylight saving — always use local date, not UTC
export const today    = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Australia/Brisbane' })

// A day counts toward the streak if any loggable activity (other than
// interruptions, which is a negative signal) was recorded on it — always
// against the full field set, independent of which fields a given
// member's level currently shows in the UI, so the streak can't silently
// diverge between the dashboard widget and the Habits page.
const STREAK_FIELDS = ['convo','mpa','contact','catch_up','dtm','pre_filter','mg1','launch'] as const
export function isHabitDayActive<T extends object>(h: T | undefined): boolean {
  return !!h && STREAK_FIELDS.some(k => (((h as Record<string, unknown>)[k] as number | undefined) ?? 0) > 0)
}

// Single source of truth for the current streak, shared by every place
// that displays it. `daysAgo` maps an offset (0 = today) to a date key
// into `habits`, so callers keep control of timezone/date formatting.
export function calcStreak<T extends object>(habits: Record<string, T>, daysAgo: (n: number) => string, maxDays = 90): number {
  // Start counting from today if it's already active; otherwise start from
  // yesterday so the streak doesn't drop to 0 the instant a new day begins,
  // before anything's been logged yet — it should only break once a full
  // day passes with no activity.
  const start = isHabitDayActive(habits[daysAgo(0)]) ? 0 : 1
  let s = 0
  for (let i = start; i < maxDays; i++) {
    if (isHabitDayActive(habits[daysAgo(i)])) s++
    else break
  }
  return s
}
