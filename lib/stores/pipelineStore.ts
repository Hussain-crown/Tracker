import { create } from 'zustand'
import { supabase as sb } from '@/lib/supabase/client'
import type { Lead, ContactLog } from './types'

interface PipelineStore {
  leads: Lead[]
  contactLogs: ContactLog[]
  loadLeads: () => Promise<void>
  upsertLead: (l: Lead) => Promise<void>
  deleteLead: (id: string) => Promise<void>
  addContactLog: (log: ContactLog) => Promise<void>
  loadContactLogs: (entityId?: string) => Promise<void>
}

export const usePipelineStore = create<PipelineStore>((set, get) => ({
  leads: [],
  contactLogs: [],

  loadLeads: async () => {
    const { data: { user } } = await sb.auth.getUser()
    const userId = user?.id ?? ''
    if (!userId) return
    try {
      const { data } = await sb.from('leads').select('*').eq('user_id', userId).order('created_at', { ascending: false })
      set({ leads: (data ?? []) as Lead[] })
    } catch {}
  },

  upsertLead: async (l) => {
    let prev: Lead[] = []
    set(s => { prev = s.leads; const idx = s.leads.findIndex(x => x.id === l.id); return { leads: idx >= 0 ? s.leads.map(x => x.id === l.id ? l : x) : [l, ...s.leads] } })
    const { error } = await sb.from('leads').upsert(l as unknown as Record<string, unknown>, { onConflict: 'id' })
    if (error) { set({ leads: prev }); throw error }
  },

  deleteLead: async (id) => {
    // DB delete first — if it fails the item stays in both DB and UI (consistent);
    // optimistic-first would remove from UI but leave it in DB (inconsistent on reload).
    const { error: logsErr } = await sb.from('contact_logs').delete().eq('entity_id', id)
    if (logsErr) throw logsErr
    const { error: leadErr } = await sb.from('leads').delete().eq('id', id)
    if (leadErr) throw leadErr
    set(s => ({
      leads: s.leads.filter(l => l.id !== id),
      contactLogs: s.contactLogs.filter(l => l.entity_id !== id),
    }))
  },

  addContactLog: async (log) => {
    let prev: ContactLog[] = []
    set(s => { prev = s.contactLogs; return { contactLogs: [log, ...s.contactLogs] } })
    const { error } = await sb.from('contact_logs').insert(log as unknown as Record<string, unknown>)
    if (error) { set({ contactLogs: prev }); throw error }
  },

  loadContactLogs: async (entityId?) => {
    const { data: { user } } = await sb.auth.getUser()
    const userId = user?.id ?? ''
    if (!userId) return
    try {
      let q = sb.from('contact_logs').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(1000)
      if (entityId) q = (q as any).eq('entity_id', entityId)
      const { data } = await q
      if (data) set({ contactLogs: data as ContactLog[] })
    } catch {}
  },
}))
