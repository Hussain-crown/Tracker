import { create } from 'zustand'
import { supabase as sb } from '@/lib/supabase/client'
import type { Candidate, ContactLog } from './types'

interface CandidateStore {
  candidates: Candidate[]
  loadCandidates: () => Promise<void>
  upsertCandidate: (c: Candidate) => Promise<void>
  deleteCandidate: (id: string) => Promise<void>
  addContactLog: (log: ContactLog) => Promise<void>
}

export const useCandidateStore = create<CandidateStore>((set) => ({
  candidates: [],

  loadCandidates: async () => {
    const { data: { user } } = await sb.auth.getUser()
    const userId = user?.id ?? ''
    if (!userId) return
    try {
      const { data } = await sb.from('candidates').select('*').eq('user_id', userId).order('created_at', { ascending: false })
      set({ candidates: (data ?? []) as Candidate[] })
    } catch (e) { console.error(e) }
  },

  upsertCandidate: async (c) => {
    let prev: Candidate[] = []
    set(s => {
      prev = s.candidates
      const idx = s.candidates.findIndex(x => x.id === c.id)
      return { candidates: idx >= 0 ? s.candidates.map(x => x.id === c.id ? c : x) : [c, ...s.candidates] }
    })
    const { error } = await sb.from('candidates').upsert(c as unknown as Record<string, unknown>, { onConflict: 'id' })
    if (error) { set({ candidates: prev }); throw error }
  },

  deleteCandidate: async (id) => {
    let prev: Candidate[] = []
    set(s => { prev = s.candidates; return { candidates: s.candidates.filter(c => c.id !== id) } })
    const { data: { user } } = await sb.auth.getUser()
    if (!user?.id) { set({ candidates: prev }); throw new Error('not_authenticated') }
    const { error } = await sb.from('candidates').delete().eq('id', id).eq('user_id', user.id)
    if (error) { set({ candidates: prev }); throw error }
  },

  addContactLog: async (log) => {
    const { error } = await sb.from('contact_logs').insert(log as unknown as Record<string, unknown>)
    if (error) throw error
  },
}))
