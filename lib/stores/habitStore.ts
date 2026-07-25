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
}

export const useHabitStore = create<HabitStore>((set) => ({
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
    } catch {}
  },

  saveHabit: async (e) => {
    set(s => ({ habits: { ...s.habits, [e.date]: e } }))
    const { error } = await sb.from('habits').upsert(e as unknown as Record<string, unknown>, { onConflict: 'id' })
    if (error) throw error
  },

  loadWins: async () => {
    const { data: { user } } = await sb.auth.getUser()
    const userId = user?.id ?? ''
    if (!userId) return
    try {
      const { data } = await sb.from('wins').select('*').eq('user_id', userId).order('created_at', { ascending: false })
      set({ wins: (data ?? []) as Win[] })
    } catch {}
  },

  upsertWin: async (w) => {
    set(s => {
      const idx = s.wins.findIndex(x => x.id === w.id)
      return { wins: idx >= 0 ? s.wins.map(x => x.id === w.id ? w : x) : [w, ...s.wins] }
    })
    try { await sb.from('wins').upsert(w as unknown as Record<string, unknown>, { onConflict: 'id' }) } catch {}
  },

  deleteWin: async (id) => {
    set(s => ({ wins: s.wins.filter(w => w.id !== id) }))
    try { await sb.from('wins').delete().eq('id', id) } catch {}
  },

  loadWeeklyReviews: async () => {
    const { data: { user } } = await sb.auth.getUser()
    const userId = user?.id ?? ''
    if (!userId) return
    try {
      const { data } = await sb.from('weekly_reviews').select('*').eq('user_id', userId).order('created_at', { ascending: false })
      set({ weeklyReviews: (data ?? []) as WeeklyReview[] })
    } catch {}
  },

  upsertWeeklyReview: async (r) => {
    set(s => {
      const idx = s.weeklyReviews.findIndex(x => x.id === r.id)
      return { weeklyReviews: idx >= 0 ? s.weeklyReviews.map(x => x.id === r.id ? r : x) : [r, ...s.weeklyReviews] }
    })
    try { await sb.from('weekly_reviews').upsert(r as unknown as Record<string, unknown>, { onConflict: 'id' }) } catch {}
  },

  loadMoodEntries: async () => {
    const { data: { user } } = await sb.auth.getUser()
    const userId = user?.id ?? ''
    if (!userId) return
    try {
      const { data } = await sb.from('mood_entries').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(90)
      set({ moodEntries: (data ?? []) as MoodEntry[] })
    } catch {}
  },

  addMoodEntry: async (m) => {
    set(s => ({ moodEntries: [m, ...s.moodEntries] }))
    try { await sb.from('mood_entries').insert(m as unknown as Record<string, unknown>) } catch {}
  },
}))
