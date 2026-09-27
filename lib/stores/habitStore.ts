import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { supabase as sb } from '@/lib/supabase/client'
import type { HabitEntry, Win, MoodEntry } from './types'

interface HabitStore {
  habits: Record<string, HabitEntry>
  wins: Win[]
  moodEntries: MoodEntry[]
  // Same reasoning as pipelineStore's contactLogsTruncated -- loadMoodEntries
  // caps at 90 rows with no indication when that cap is actually hit.
  moodEntriesTruncated: boolean
  loadHabits: () => Promise<void>
  saveHabit: (e: HabitEntry) => Promise<void>
  // Writes straight into the store with no network call -- used to re-apply
  // a value after saveHabit's own rollback, when the failure was actually a
  // queued-for-later offline write rather than a genuine rejection. Without
  // this, opening the app offline (or losing connection mid-edit) reverts
  // the just-typed value on screen even though it's safely queued underneath.
  setHabitLocal: (date: string, e: HabitEntry) => void
  loadWins: () => Promise<void>
  upsertWin: (w: Win) => Promise<void>
  deleteWin: (id: string) => Promise<void>
  loadMoodEntries: () => Promise<void>
  addMoodEntry: (m: MoodEntry) => Promise<void>
  // NOTE: Supabase Realtime must be enabled on the project for live updates to work.
  subscribeRealtime: (userId: string) => () => void
}

export const useHabitStore = create<HabitStore>()(persist((set, get) => ({
  habits: {},
  wins: [],
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

  setHabitLocal: (date, e) => set(s => ({ habits: { ...s.habits, [date]: e } })),

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
}), {
  name: 'tracker-habit-store',
  storage: createJSONStorage(() => localStorage),
  // Only the actual data needs to survive a reload -- loading flags and
  // functions don't serialize and shouldn't anyway.
  partialize: (s) => ({ habits: s.habits, wins: s.wins, moodEntries: s.moodEntries, moodEntriesTruncated: s.moodEntriesTruncated }),
}))
