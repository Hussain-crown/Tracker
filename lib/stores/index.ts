// ── GROWTH TRACKER — STORE INDEX ───────────────────────────
// Standalone subset of Hussain OS's stores — only what Track needs.

export * from './types'
export { useHabitStore }        from './habitStore'
export { useUIStore }           from './uiStore'
export { usePipelineStore }     from './pipelineStore'

import { useHabitStore }        from './habitStore'
import { useUIStore }           from './uiStore'
import { usePipelineStore }     from './pipelineStore'

export function useStore() {
  const habit        = useHabitStore()
  const ui           = useUIStore()
  const pipeline     = usePipelineStore()

  return {
    // UI / Auth
    userId: ui.userId, userEmail: ui.userEmail,
    setUser: ui.setUser, setUserId: ui.setUserId,
    getMeta: ui.getMeta, setMeta: ui.setMeta,

    // Pipeline (Habits creates leads from logged contacts)
    leads: pipeline.leads, loadLeads: pipeline.loadLeads,
    upsertLead: pipeline.upsertLead, deleteLead: pipeline.deleteLead,
    contactLogs: pipeline.contactLogs,
    contactLogsTruncated: pipeline.contactLogsTruncated,
    addContactLog: pipeline.addContactLog,
    loadContactLogs: pipeline.loadContactLogs,

    // Habits
    habits: habit.habits, loadHabits: habit.loadHabits, saveHabit: habit.saveHabit,
    setHabitLocal: habit.setHabitLocal,
    wins: habit.wins, loadWins: habit.loadWins,
    upsertWin: habit.upsertWin, deleteWin: habit.deleteWin,
    moodEntries: habit.moodEntries, moodEntriesTruncated: habit.moodEntriesTruncated, loadMoodEntries: habit.loadMoodEntries,
    addMoodEntry: habit.addMoodEntry,

    loadAll: async () => {
      const sw = (p: Promise<void>, name: string) => p.catch(e => console.error(`${name} failed:`, e))
      await Promise.all([
        sw(habit.loadHabits(), 'loadHabits'),
        sw(pipeline.loadLeads(), 'loadLeads'),
        sw(pipeline.loadContactLogs(), 'loadContactLogs'),
      ])
    },
  }
}
