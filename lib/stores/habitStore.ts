import { create } from 'zustand'
import { supabase as sb } from '@/lib/supabase/client'
import type { HabitEntry, Win, WeeklyReview, MoodEntry } from './types'

interface HabitStore {
  habits: Record<string, HabitEntry>
  wins: Win[]
  weeklyReviews: WeeklyReview[]
  moodEntries: MoodEntry[]
  // Same reasoning as pipelineStore's contactLogsTruncated -- loadMoodEntries
  // caps at 90 rows with no indication when that cap is actually hit.
  moodEntriesTruncated: boolean
  loadHabits: () => Promise<void>
  saveHabit: (e: HabitEntry) => Promise<void>
  loadWins: () => Promise<void>
  upsertWin: (w: Win) => Promise<void>
  deleteWin: (id: string) => Promise<void>
  loadWeeklyReviews: () => Promise<void>
  upsertWeeklyReview: (r: WeeklyReview) => Promise<void>
  loadMoodEntries: () => Promise<void>
  addMoodEntry: (m: MoodEntry) => Promise<void>
  // NOTE: Supabase Realtime must be enabled on the project for live updates to work.
  subscribeRealtime: (userId: string) => () => void
}

export const useHabitStore = create<HabitStore>((set, get) => ({
  habits: {},
  wins: [],
  weeklyReviews: [],
  moodEntries: [],
  moodEntriesTruncated: false,

  loadHabits: async () => {
    const { data: { user } } = await sb.auth.getUser()
    const userId = user?.id ?? ''
    if (!userId) return
    try {
      const { data } = await sb.from('habits').select('*').eq('user_id', userId)
      const map: Record<string, HabitEntry> = {}
      for (const e of (data ?? [])) map[(e as HabitEntry).date] = e as HabitEntry
      set({ habits: map })
    } catch (e) { console.error(e) }
  },

  saveHabit: async (e) => {
    const prevEntry = get().habits[e.date]
    set(s => ({ habits: { ...s.habits, [e.date]: e } }))
    const { data: rows, error } = await sb.from('habits').upsert(e as unknown as Record<string, unknown>, { onConflict: 'user_id,date' }).select('id')
    const rollback = () => set(s => { const h = { ...s.habits }; if (prevEntry === undefined) { delete h[e.date] } else { h[e.date] = prevEntry }; return { habits: h } })
    if (error) { rollback(); throw error }
    // RLS or an expired session can let the write resolve with 0 rows affected — catch that silent failure.
    if (!rows?.length) { rollback(); throw new Error('Habit save was silently blocked. Session may have expired — please refresh.') }
  },

  loadWins: async () => {
    const { data: { user } } = await sb.auth.getUser()
    const userId = user?.id ?? ''
    if (!userId) return
    try {
      const { data } = await sb.from('wins').select('*').eq('user_id', userId).order('created_at', { ascending: false })
      set({ wins: (data ?? []) as Win[] })
    } catch (e) { console.error(e) }
  },

  upsertWin: async (w) => {
    let prev: Win[] = []
    set(s => { prev = s.wins; const idx = s.wins.findIndex(x => x.id === w.id); return { wins: idx >= 0 ? s.wins.map(x => x.id === w.id ? w : x) : [w, ...s.wins] } })
    const { data: rows, error } = await sb.from('wins').upsert(w as unknown as Record<string, unknown>, { onConflict: 'id' }).select('id')
    if (error) { set({ wins: prev }); throw error }
    // RLS or an expired session can let the write resolve with 0 rows affected — catch that silent failure.
    if (!rows?.length) { set({ wins: prev }); throw new Error('Win save was silently blocked. Session may have expired — please refresh.') }
  },

  deleteWin: async (id) => {
    let prev: Win[] = []
    set(s => { prev = s.wins; return { wins: s.wins.filter(w => w.id !== id) } })
    const { data: { user } } = await sb.auth.getUser()
    if (!user?.id) { set({ wins: prev }); throw new Error('not_authenticated') }
    const { error } = await sb.from('wins').delete().eq('id', id).eq('user_id', user.id)
    if (error) { set({ wins: prev }); throw error }
  },

  loadWeeklyReviews: async () => {
    const { data: { user } } = await sb.auth.getUser()
    const userId = user?.id ?? ''
    if (!userId) return
    try {
      const { data } = await sb.from('weekly_reviews').select('*').eq('user_id', userId).order('created_at', { ascending: false })
      set({ weeklyReviews: (data ?? []) as WeeklyReview[] })
    } catch (e) { console.error(e) }
  },

  upsertWeeklyReview: async (r) => {
    let prev: WeeklyReview[] = []
    set(s => { prev = s.weeklyReviews; const idx = s.weeklyReviews.findIndex(x => x.id === r.id); return { weeklyReviews: idx >= 0 ? s.weeklyReviews.map(x => x.id === r.id ? r : x) : [r, ...s.weeklyReviews] } })
    const { data: rows, error } = await sb.from('weekly_reviews').upsert(r as unknown as Record<string, unknown>, { onConflict: 'id' }).select('id')
    if (error) { set({ weeklyReviews: prev }); throw error }
    // RLS or an expired session can let the write resolve with 0 rows affected — catch that silent failure.
    if (!rows?.length) { set({ weeklyReviews: prev }); throw new Error('Weekly review save was silently blocked. Session may have expired — please refresh.') }
  },

  loadMoodEntries: async () => {
    const { data: { user } } = await sb.auth.getUser()
    const userId = user?.id ?? ''
    if (!userId) return
    try {
      const { data } = await sb.from('mood_entries').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(90)
      set({ moodEntries: (data ?? []) as MoodEntry[], moodEntriesTruncated: (data ?? []).length >= 90 })
    } catch (e) { console.error(e) }
  },

  addMoodEntry: async (m) => {
    let prev: MoodEntry[] = []
    set(s => { prev = s.moodEntries; return { moodEntries: [m, ...s.moodEntries] } })
    const { data: rows, error } = await sb.from('mood_entries').insert(m as unknown as Record<string, unknown>).select('id')
    if (error) { set({ moodEntries: prev }); throw error }
    // RLS or an expired session can let the write resolve with 0 rows affected — catch that silent failure.
    if (!rows?.length) { set({ moodEntries: prev }); throw new Error('Mood entry save was silently blocked. Session may have expired — please refresh.') }
  },

  subscribeRealtime: (userId) => {
    const channel = sb.channel(`habits:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'habits', filter: `user_id=eq.${userId}` }, (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const entry = payload.new as HabitEntry
          set(s => ({ habits: { ...s.habits, [entry.date]: entry } }))
        } else if (payload.eventType === 'DELETE') {
          // Supabase Realtime's payload.old on a DELETE only ever contains
          // the table's replica identity columns -- by default just the
          // primary key (habits.id), not every column. `entry.date` was
          // always undefined here, so this deleted habits['undefined'] (a
          // no-op) instead of the row that was actually removed, which then
          // lingered in the store until the next full reload. Look the
          // entry up by id instead, since that's the only column payload.old
          // is guaranteed to actually have.
          const deletedId = (payload.old as { id?: string })?.id
          if (!deletedId) return
          set(s => {
            const dateKey = Object.keys(s.habits).find(d => (s.habits[d] as any)?.id === deletedId)
            if (!dateKey) return s
            const h = { ...s.habits }; delete h[dateKey]; return { habits: h }
          })
        }
      })
      .subscribe()
    return () => { sb.removeChannel(channel) }
  },
}))
