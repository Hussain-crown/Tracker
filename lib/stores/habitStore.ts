import { create } from 'zustand'
import { supabase as sb } from '@/lib/supabase/client'
import type { HabitEntry, Win, WeeklyReview, MoodEntry } from './types'

interface HabitStore {
  habits: Record<string, HabitEntry>
  wins: Win[]
  weeklyReviews: WeeklyReview[]
  moodEntries: MoodEntry[]
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
    const { error } = await sb.from('habits').upsert(e as unknown as Record<string, unknown>, { onConflict: 'user_id,date' })
    if (error) {
      set(s => { const h = { ...s.habits }; if (prevEntry === undefined) { delete h[e.date] } else { h[e.date] = prevEntry }; return { habits: h } })
      throw error
    }
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
    const { error } = await sb.from('wins').upsert(w as unknown as Record<string, unknown>, { onConflict: 'id' })
    if (error) { set({ wins: prev }); throw error }
  },

  deleteWin: async (id) => {
    let prev: Win[] = []
    set(s => { prev = s.wins; return { wins: s.wins.filter(w => w.id !== id) } })
    const { data: { user } } = await sb.auth.getUser()
    const { error } = await sb.from('wins').delete().eq('id', id).eq('user_id', user?.id ?? '')
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
    const { error } = await sb.from('weekly_reviews').upsert(r as unknown as Record<string, unknown>, { onConflict: 'id' })
    if (error) { set({ weeklyReviews: prev }); throw error }
  },

  loadMoodEntries: async () => {
    const { data: { user } } = await sb.auth.getUser()
    const userId = user?.id ?? ''
    if (!userId) return
    try {
      const { data } = await sb.from('mood_entries').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(90)
      set({ moodEntries: (data ?? []) as MoodEntry[] })
    } catch (e) { console.error(e) }
  },

  addMoodEntry: async (m) => {
    let prev: MoodEntry[] = []
    set(s => { prev = s.moodEntries; return { moodEntries: [m, ...s.moodEntries] } })
    const { error } = await sb.from('mood_entries').insert(m as unknown as Record<string, unknown>)
    if (error) { set({ moodEntries: prev }); throw error }
  },

  subscribeRealtime: (userId) => {
    const channel = sb.channel(`habits:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'habits', filter: `user_id=eq.${userId}` }, (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const entry = payload.new as HabitEntry
          set(s => ({ habits: { ...s.habits, [entry.date]: entry } }))
        } else if (payload.eventType === 'DELETE') {
          const entry = payload.old as HabitEntry
          set(s => { const h = { ...s.habits }; delete h[entry.date]; return { habits: h } })
        }
      })
      .subscribe()
    return () => { sb.removeChannel(channel) }
  },
}))
