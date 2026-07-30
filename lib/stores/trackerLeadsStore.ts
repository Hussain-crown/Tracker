import { create } from 'zustand'
import { supabase as sb } from '@/lib/supabase/client'
import type { Lead } from './types'

interface TrackerLeadsStore {
  trackerLeads: Lead[]
  loadTrackerLeads: () => Promise<void>
  upsertTrackerLead: (l: Lead) => Promise<void>
  deleteTrackerLead: (id: string) => Promise<void>
}

export const useTrackerLeadsStore = create<TrackerLeadsStore>((set) => ({
  trackerLeads: [],

  loadTrackerLeads: async () => {
    const { data: { user } } = await sb.auth.getUser()
    const userId = user?.id ?? ''
    if (!userId) return
    try {
      const { data } = await sb.from('tracker_leads').select('*').eq('user_id', userId).order('created_at', { ascending: false })
      set({ trackerLeads: (data ?? []) as Lead[] })
    } catch (e) { console.error(e) }
  },

  upsertTrackerLead: async (l) => {
    let prev: Lead[] = []
    set(s => {
      prev = s.trackerLeads
      const idx = s.trackerLeads.findIndex(x => x.id === l.id)
      return { trackerLeads: idx >= 0 ? s.trackerLeads.map(x => x.id === l.id ? l : x) : [l, ...s.trackerLeads] }
    })
    const { error } = await sb.from('tracker_leads').upsert(l as unknown as Record<string, unknown>, { onConflict: 'id' })
    if (error) { set({ trackerLeads: prev }); throw error }
  },

  deleteTrackerLead: async (id) => {
    let prev: Lead[] = []
    set(s => { prev = s.trackerLeads; return { trackerLeads: s.trackerLeads.filter(l => l.id !== id) } })
    const { data: { user } } = await sb.auth.getUser()
    if (!user?.id) { set({ trackerLeads: prev }); throw new Error('not_authenticated') }
    const { error } = await sb.from('tracker_leads').delete().eq('id', id).eq('user_id', user.id)
    if (error) { set({ trackerLeads: prev }); throw error }
  },
}))
