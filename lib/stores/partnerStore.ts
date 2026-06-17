import { create } from 'zustand'
import { supabase as sb } from '@/lib/supabase/client'
import type { Partner, PartnerNote, ContactLog } from './types'

interface PartnerStore {
  partners: Partner[]
  partnerNotes: Record<string, PartnerNote[]>
  contactLogs: ContactLog[]
  loadPartners: () => Promise<void>
  upsertPartner: (p: Partner) => Promise<void>
  deletePartner: (id: string) => Promise<void>
  loadPartnerNotes: (partnerId: string) => Promise<void>
  addPartnerNote: (n: PartnerNote) => Promise<void>
  deletePartnerNote: (id: string, partnerId: string) => Promise<void>
  addContactLog: (log: ContactLog) => Promise<void>
  loadContactLogs: (entityId?: string) => Promise<void>
}

export const usePartnerStore = create<PartnerStore>((set, get) => ({
  partners: [],
  partnerNotes: {},
  contactLogs: [],

  loadPartners: async () => {
    const { data: { user } } = await sb.auth.getUser()
    const userId = user?.id ?? ''
    if (!userId) return
    try {
      const { data } = await sb.from('partners').select('*').eq('user_id', userId).order('created_at', { ascending: true })
      set({ partners: (data ?? []) as Partner[] })
    } catch {}
  },

  upsertPartner: async (p) => {
    set(s => {
      const idx = s.partners.findIndex(x => x.id === p.id)
      const partners = idx >= 0 ? s.partners.map(x => x.id === p.id ? p : x) : [...s.partners, p]
      return { partners }
    })
    try { await sb.from('partners').upsert(p as unknown as Record<string, unknown>, { onConflict: 'id' }) } catch {}
  },

  deletePartner: async (id) => {
    set(s => ({ partners: s.partners.filter(p => p.id !== id) }))
    try { await sb.from('partners').delete().eq('id', id) } catch {}
  },

  loadPartnerNotes: async (partnerId) => {
    try {
      const { data } = await sb.from('partner_notes').select('*').eq('partner_id', partnerId).order('created_at', { ascending: false })
      if (data) set(s => ({ partnerNotes: { ...s.partnerNotes, [partnerId]: data as PartnerNote[] } }))
    } catch {}
  },

  addPartnerNote: async (n) => {
    set(s => ({ partnerNotes: { ...s.partnerNotes, [n.partner_id]: [n, ...(s.partnerNotes[n.partner_id] ?? [])] } }))
    try { await sb.from('partner_notes').insert(n as unknown as Record<string, unknown>) } catch {}
  },

  deletePartnerNote: async (id, partnerId) => {
    set(s => ({ partnerNotes: { ...s.partnerNotes, [partnerId]: (s.partnerNotes[partnerId] ?? []).filter(n => n.id !== id) } }))
    try { await sb.from('partner_notes').delete().eq('id', id) } catch {}
  },

  addContactLog: async (log) => {
    set(s => ({ contactLogs: [log, ...s.contactLogs] }))
    try { await sb.from('contact_logs').insert(log as unknown as Record<string, unknown>) } catch {}
  },

  loadContactLogs: async (entityId?) => {
    const { data: { user } } = await sb.auth.getUser()
    const userId = user?.id ?? ''
    if (!userId) return
    try {
      let q = sb.from('contact_logs').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(200)
      if (entityId) q = (q as any).eq('entity_id', entityId)
      const { data } = await q
      if (data) set({ contactLogs: data as ContactLog[] })
    } catch {}
  },
}))
