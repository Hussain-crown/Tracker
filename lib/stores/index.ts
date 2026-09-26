// ── GROWTH TRACKER — STORE INDEX ───────────────────────────
// Standalone subset of Hussain OS's stores — only what Track needs.

export * from './types'
export { useHabitStore }        from './habitStore'
export { useUIStore }           from './uiStore'
export { usePipelineStore }     from './pipelineStore'
export { useCandidateStore }    from './candidateStore'

import { useHabitStore }        from './habitStore'
import { useUIStore }           from './uiStore'
import { usePipelineStore }     from './pipelineStore'
import { useCandidateStore }    from './candidateStore'

export function useStore() {
  const habit        = useHabitStore()
  const ui           = useUIStore()
  const pipeline     = usePipelineStore()
  const candidate    = useCandidateStore()

  return {
    // UI / Auth
    userId: ui.userId, userEmail: ui.userEmail,
    setUser: ui.setUser, setUserId: ui.setUserId,
    getMeta: ui.getMeta, setMeta: ui.setMeta,
    resources: ui.resources, loadResources: ui.loadResources,
    upsertResource: ui.upsertResource, deleteResource: ui.deleteResource,

    // Pipeline (Habits creates leads from logged contacts)
    leads: pipeline.leads, loadLeads: pipeline.loadLeads,
    upsertLead: pipeline.upsertLead, deleteLead: pipeline.deleteLead,
    contactLogs: pipeline.contactLogs,
    contactLogsTruncated: pipeline.contactLogsTruncated,
    addContactLog: pipeline.addContactLog,
    loadContactLogs: pipeline.loadContactLogs,
    migrateLogsToCandidate: pipeline.migrateLogsToCandidate,

    // Candidates
    candidates: candidate.candidates, loadCandidates: candidate.loadCandidates,
    upsertCandidate: candidate.upsertCandidate, deleteCandidate: candidate.deleteCandidate,

    // Habits
    habits: habit.habits, loadHabits: habit.loadHabits, saveHabit: habit.saveHabit,
    wins: habit.wins, loadWins: habit.loadWins,
    upsertWin: habit.upsertWin, deleteWin: habit.deleteWin,
    weeklyReviews: habit.weeklyReviews, loadWeeklyReviews: habit.loadWeeklyReviews,
    upsertWeeklyReview: habit.upsertWeeklyReview,
    moodEntries: habit.moodEntries, moodEntriesTruncated: habit.moodEntriesTruncated, loadMoodEntries: habit.loadMoodEntries,
    addMoodEntry: habit.addMoodEntry,

    loadAll: async () => {
      const sw = (p: Promise<void>, name: string) => p.catch(e => console.error(`${name} failed:`, e))
      await Promise.all([
        sw(habit.loadHabits(), 'loadHabits'),
        sw(ui.loadResources(), 'loadResources'), sw(pipeline.loadLeads(), 'loadLeads'),
        sw(pipeline.loadContactLogs(), 'loadContactLogs'),
        sw(candidate.loadCandidates(), 'loadCandidates'),
      ])
    },
  }
}
