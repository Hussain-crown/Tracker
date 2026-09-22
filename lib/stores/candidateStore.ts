import { create } from 'zustand'
import { supabase as sb } from '@/lib/supabase/client'
import { authFetch } from '@/lib/authFetch'
import type { Candidate, ContactLog } from './types'

interface CandidateStore {
  candidates: Candidate[]
  isError: boolean
  errorMessage: string | null
  loadCandidates: () => Promise<void>
  upsertCandidate: (c: Candidate, opts?: { create?: boolean }) => Promise<void>
  deleteCandidate: (id: string) => Promise<void>
  addContactLog: (log: ContactLog) => Promise<void>
}

export const useCandidateStore = create<CandidateStore>((set) => ({
  candidates: [],
  isError: false,
  errorMessage: null,

  loadCandidates: async () => {
    try {
      const res = await authFetch('/api/team/my-candidates')
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error || res.statusText)
      }
      const d = await res.json()
      set({ candidates: (d.candidates ?? []) as Candidate[], isError: false, errorMessage: null })
    } catch (e) {
      console.error(e)
      set({ isError: true, errorMessage: e instanceof Error ? e.message : String(e) })
      throw e
    }
  },

  upsertCandidate: async (c, opts) => {
    let prev: Candidate[] = []
    set(s => {
      prev = s.candidates
      const idx = s.candidates.findIndex(x => x.id === c.id)
      return { candidates: idx >= 0 ? s.candidates.map(x => x.id === c.id ? c : x) : [c, ...s.candidates] }
    })
    const res = await authFetch('/api/team/candidates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(opts?.create ? { ...c, create: true } : c) })
    if (!res.ok) { set({ candidates: prev }); throw new Error(await res.text()) }
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
