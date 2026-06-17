// ── GROWTH TRACKER — STORE INDEX ───────────────────────────
// Standalone subset of Hussain OS's stores — only what Track needs.

export * from './types'
export { useHabitStore }    from './habitStore'
export { useUIStore }       from './uiStore'
export { usePipelineStore } from './pipelineStore'

import { useHabitStore }    from './habitStore'
import { useUIStore }       from './uiStore'
import { usePipelineStore } from './pipelineStore'

export function useStore() {
  const habit    = useHabitStore()
  const ui       = useUIStore()
  const pipeline = usePipelineStore()

  return {
    // UI / Auth
    userId: ui.userId, userEmail: ui.userEmail,
    setUser: ui.setUser, setUserId: ui.setUserId,
    getMeta: ui.getMeta, setMeta: ui.setMeta,
    resources: ui.resources, loadResources: ui.loadResources,

    // Pipeline (Habits creates leads from logged contacts)
    leads: pipeline.leads, loadLeads: pipeline.loadLeads,
    upsertLead: pipeline.upsertLead, deleteLead: pipeline.deleteLead,

    // Habits
    habits: habit.habits, loadHabits: habit.loadHabits, saveHabit: habit.saveHabit,
    wins: habit.wins, loadWins: habit.loadWins,
    upsertWin: habit.upsertWin, deleteWin: habit.deleteWin,
    weeklyReviews: habit.weeklyReviews, loadWeeklyReviews: habit.loadWeeklyReviews,
    upsertWeeklyReview: habit.upsertWeeklyReview,
    moodEntries: habit.moodEntries, loadMoodEntries: habit.loadMoodEntries,
    addMoodEntry: habit.addMoodEntry,

    loadAll: async () => {
      await Promise.all([
        habit.loadHabits(), habit.loadWins(), habit.loadWeeklyReviews(), habit.loadMoodEntries(),
        ui.loadResources(), pipeline.loadLeads(),
      ])
    },
  }
}
