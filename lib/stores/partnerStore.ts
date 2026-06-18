import { create } from 'zustand'
import { supabase as sb } from '@/lib/supabase/client'
import type { Partner, PartnerNote } from './types'

interface PartnerStore {
  partners: Partner[]
  partnerNotes: Record<string, PartnerNote[]>
  loadPartners: () => Promise<void>
  upsertPartner: (p: Partner) => Promise<void>
  deletePartner: (id: string) => Promise<void>
  loadPartnerNotes: (partnerId: string) => Promise<void>
  addPartnerNote: (n: PartnerNote) => Promise<void>
  deletePartnerNote: (id: string, partnerId: string) => Promise<void>
}

export const usePartnerStore = create<PartnerStore>((set, get) => ({
  partners: [],
  partnerNotes: {},

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
    const { error } = await sb.from('partners').upsert(p as unknown as Record<string, unknown>, { onConflict: 'id' })
    if (error) throw error
  },

  deletePartner: async (id) => {
    set(s => ({ partners: s.partners.filter(p => p.id !== id) }))
    const { error } = await sb.from('partners').delete().eq('id', id)
    if (error) throw error
  },

  loadPartnerNotes: async (partnerId) => {
    try {
      const { data } = await sb.from('partner_notes').select('*').eq('partner_id', partnerId).order('created_at', { ascending: false })
      if (data) set(s => ({ partnerNotes: { ...s.partnerNotes, [partnerId]: data as PartnerNote[] } }))
    } catch {}
  },

  addPartnerNote: async (n) => {
    set(s => ({ partnerNotes: { ...s.partnerNotes, [n.partner_id]: [n, ...(s.partnerNotes[n.partner_id] ?? [])] } }))
    const { error } = await sb.from('partner_notes').insert(n as unknown as Record<string, unknown>)
    if (error) throw error
  },

  deletePartnerNote: async (id, partnerId) => {
    set(s => ({ partnerNotes: { ...s.partnerNotes, [partnerId]: (s.partnerNotes[partnerId] ?? []).filter(n => n.id !== id) } }))
    const { error } = await sb.from('partner_notes').delete().eq('id', id)
    if (error) throw error
  },
}))
