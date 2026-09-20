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
  migrateLogsToCandidate: (leadId: string, candidateId: string) => Promise<void>
}

export const usePipelineStore = create<PipelineStore>((set) => ({
  leads: [],
  contactLogs: [],

  loadLeads: async () => {
    const { data: { user } } = await sb.auth.getUser()
    const userId = user?.id ?? ''
    if (!userId) return
    try {
      const { data } = await sb.from('leads').select('*').eq('user_id', userId).order('created_at', { ascending: false })
      set({ leads: (data ?? []) as Lead[] })
    } catch (e) { console.error(e) }
  },

  upsertLead: async (l) => {
    let prev: Lead[] = []
    set(s => { prev = s.leads; const idx = s.leads.findIndex(x => x.id === l.id); return { leads: idx >= 0 ? s.leads.map(x => x.id === l.id ? l : x) : [l, ...s.leads] } })
    const { data: rows, error } = await sb.from('leads').upsert(l as unknown as Record<string, unknown>, { onConflict: 'id' }).select('id')
    if (error) { set({ leads: prev }); throw error }
    // RLS or an expired session can let the write resolve with 0 rows affected — catch that silent failure.
    if (!rows?.length) { set({ leads: prev }); throw new Error('Lead save was silently blocked. Session may have expired — please refresh.') }
  },

  deleteLead: async (id) => {
    // DB delete first — if it fails the item stays in both DB and UI (consistent);
    // optimistic-first would remove from UI but leave it in DB (inconsistent on reload).
    const { data: { user } } = await sb.auth.getUser()
    const userId = user?.id ?? ''
    const { error: logsErr } = await sb.from('contact_logs').delete().eq('entity_id', id).eq('user_id', userId)
    if (logsErr) throw logsErr
    const { error: leadErr } = await sb.from('leads').delete().eq('id', id).eq('user_id', userId)
    if (leadErr) throw leadErr
    set(s => ({
      leads: s.leads.filter(l => l.id !== id),
      contactLogs: s.contactLogs.filter(l => l.entity_id !== id),
    }))
  },

  addContactLog: async (log) => {
    let prev: ContactLog[] = []
    set(s => { prev = s.contactLogs; return { contactLogs: [log, ...s.contactLogs] } })
    const { data: rows, error } = await sb.from('contact_logs').insert(log as unknown as Record<string, unknown>).select('id')
    if (error) { set({ contactLogs: prev }); throw error }
    // RLS or an expired session can let the write resolve with 0 rows affected — catch that silent failure.
    if (!rows?.length) { set({ contactLogs: prev }); throw new Error('Contact log save was silently blocked. Session may have expired — please refresh.') }
  },

  // Re-points a lead's contact history onto a new candidate record instead of
  // losing it — used when converting a lead so its logged notes survive.
  migrateLogsToCandidate: async (leadId, candidateId) => {
    const { error } = await sb.from('contact_logs').update({ entity_type: 'candidate', entity_id: candidateId }).eq('entity_id', leadId)
    if (error) throw error
    set(s => ({
      contactLogs: s.contactLogs.map(l => l.entity_id === leadId ? { ...l, entity_type: 'candidate' as const, entity_id: candidateId } : l),
    }))
  },

  loadContactLogs: async (entityId?) => {
    const { data: { user } } = await sb.auth.getUser()
    const userId = user?.id ?? ''
    if (!userId) return
    try {
      let q = sb.from('contact_logs').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(1000)
      if (entityId) q = (q as any).eq('entity_id', entityId)
      const { data } = await q
      if (data) {
        if (entityId) {
          set(s => ({ contactLogs: [...data as ContactLog[], ...s.contactLogs.filter(l => l.entity_id !== entityId)] }))
        } else {
          set({ contactLogs: data as ContactLog[] })
        }
      }
    } catch (e) { console.error(e) }
  },
}))
