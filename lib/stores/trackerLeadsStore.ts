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
    } catch {}
  },

  upsertTrackerLead: async (l) => {
    set(s => {
      const idx = s.trackerLeads.findIndex(x => x.id === l.id)
      const trackerLeads = idx >= 0
        ? s.trackerLeads.map(x => x.id === l.id ? l : x)
        : [l, ...s.trackerLeads]
      return { trackerLeads }
    })
    try {
      await sb.from('tracker_leads').upsert(l as unknown as Record<string, unknown>, { onConflict: 'id' })
    } catch {}
  },

  deleteTrackerLead: async (id) => {
    set(s => ({ trackerLeads: s.trackerLeads.filter(l => l.id !== id) }))
    try { await sb.from('tracker_leads').delete().eq('id', id) } catch {}
  },
}))
