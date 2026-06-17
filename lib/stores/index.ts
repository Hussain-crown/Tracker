// ── GROWTH TRACKER — STORE INDEX ───────────────────────────
// Standalone subset of Hussain OS's stores — only what Track needs.

export * from './types'
export { useHabitStore }     from './habitStore'
export { useUIStore }        from './uiStore'
export { usePipelineStore }  from './pipelineStore'
export { useCandidateStore } from './candidateStore'
export { usePartnerStore }   from './partnerStore'

import { useHabitStore }     from './habitStore'
import { useUIStore }        from './uiStore'
import { usePipelineStore }  from './pipelineStore'
import { useCandidateStore } from './candidateStore'
import { usePartnerStore }   from './partnerStore'

export function useStore() {
  const habit     = useHabitStore()
  const ui        = useUIStore()
  const pipeline  = usePipelineStore()
  const candidate = useCandidateStore()
  const partner   = usePartnerStore()

  return {
    // UI / Auth
    userId: ui.userId, userEmail: ui.userEmail,
    setUser: ui.setUser, setUserId: ui.setUserId,
    getMeta: ui.getMeta, setMeta: ui.setMeta,
    resources: ui.resources, loadResources: ui.loadResources,

    // Pipeline (Habits creates leads from logged contacts)
    leads: pipeline.leads, loadLeads: pipeline.loadLeads,
    upsertLead: pipeline.upsertLead, deleteLead: pipeline.deleteLead,
    contactLogs: pipeline.contactLogs,
    addContactLog: pipeline.addContactLog,
    loadContactLogs: pipeline.loadContactLogs,

    // Candidates
    candidates: candidate.candidates, loadCandidates: candidate.loadCandidates,
    upsertCandidate: candidate.upsertCandidate, deleteCandidate: candidate.deleteCandidate,

    // Partners
    partners: partner.partners, loadPartners: partner.loadPartners,
    upsertPartner: partner.upsertPartner, deletePartner: partner.deletePartner,
    partnerNotes: partner.partnerNotes,
    loadPartnerNotes: partner.loadPartnerNotes,
    addPartnerNote: partner.addPartnerNote,
    deletePartnerNote: partner.deletePartnerNote,

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
        ui.loadResources(), pipeline.loadLeads(), pipeline.loadContactLogs(),
        candidate.loadCandidates(), partner.loadPartners(),
      ])
    },
  }
}
