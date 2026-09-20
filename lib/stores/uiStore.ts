import { create } from 'zustand'
import { supabase as sb } from '@/lib/supabase/client'
import type { Resource } from './types'

interface UIStore {
  page: string
  online: boolean
  syncing: boolean
  pending: number
  userId: string
  userEmail: string
  resources: Resource[]
  setPage: (p: string) => void
  setOnline: (v: boolean) => void
  syncNow: () => void
  reloadTable: (t: string) => void
  refreshPending: () => void
  setUser: (id: string, email: string) => void
  setUserId: (id: string, email: string) => void
  getMeta: (key: string) => Promise<string | null>
  setMeta: (key: string, value: string) => Promise<void>
  loadResources: () => Promise<void>
  upsertResource: (r: Resource) => Promise<void>
  deleteResource: (id: string) => Promise<void>
}

export const useUIStore = create<UIStore>((set) => ({
  page: 'dashboard',
  online: true,
  syncing: false,
  pending: 0,
  userId: '',
  userEmail: '',
  resources: [],

  setPage: (p) => set({ page: p }),
  setOnline: (v) => set({ online: v }),
  syncNow: () => {},
  reloadTable: () => {},
  refreshPending: () => {},
  setUser: (id, email) => set({ userId: id, userEmail: email }),
  setUserId: (id, email) => set({ userId: id, userEmail: email }),

  getMeta: async (key) => {
    try {
      const { data: { user } } = await sb.auth.getUser()
      const userId = user?.id ?? ''
      if (!userId) return null
      const { data } = await sb.from('meta').select('value').eq('user_id', userId).eq('key', key)
      return data?.[0]?.value ?? null
    } catch { return null }
  },

  setMeta: async (key, value) => {
    const { data: { user } } = await sb.auth.getUser()
    const userId = user?.id ?? ''
    if (!userId) return
    const { data: uRows, error: uErr } = await sb.from('meta').upsert(
      { user_id: userId, key, value, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,key' }
    ).select('id')
    // RLS or an expired session can let the write resolve with 0 rows affected — treat that like an error so the fallback path below runs.
    const uBlocked = !uErr && !uRows?.length
    if (uErr || uBlocked) {
      // Fallback: read old value, delete, insert — restore on insert failure
      const { data: existing } = await sb.from('meta').select('value').eq('user_id', userId).eq('key', key).limit(1)
      const oldValue = existing?.[0]?.value
      await sb.from('meta').delete().eq('user_id', userId).eq('key', key)
      const now = new Date().toISOString()
      const { data: iRows, error: iErr } = await sb.from('meta').insert({ key, user_id: userId, value, updated_at: now }).select('id')
      if (iErr || !iRows?.length) {
        if (oldValue !== undefined) try { await sb.from('meta').insert({ key, user_id: userId, value: oldValue, updated_at: now }) } catch (e) { console.error(e) }
        throw iErr ?? new Error('Setting save was silently blocked. Session may have expired — please refresh.')
      }
    }
  },

  loadResources: async () => {
    const { data: { user } } = await sb.auth.getUser()
    const userId = user?.id ?? ''
    if (!userId) return
    try {
      const { data } = await sb.from('resources').select('*').eq('user_id', userId).order('created_at', { ascending: false })
      set({ resources: (data ?? []) as Resource[] })
    } catch (e) { console.error(e) }
  },

  upsertResource: async (r) => {
    let prev: Resource[] = []
    set(s => { prev = s.resources; const idx = s.resources.findIndex(x => x.id === r.id); return { resources: idx >= 0 ? s.resources.map(x => x.id === r.id ? r : x) : [r, ...s.resources] } })
    const { data: rows, error } = await sb.from('resources').upsert(r as unknown as Record<string, unknown>, { onConflict: 'id' }).select('id')
    if (error) { set({ resources: prev }); throw error }
    // RLS or an expired session can let the write resolve with 0 rows affected — catch that silent failure.
    if (!rows?.length) { set({ resources: prev }); throw new Error('Resource save was silently blocked. Session may have expired — please refresh.') }
  },

  deleteResource: async (id) => {
    let prev: Resource[] = []
    set(s => { prev = s.resources; return { resources: s.resources.filter(r => r.id !== id) } })
    const { data: { user } } = await sb.auth.getUser()
    if (!user?.id) { set({ resources: prev }); throw new Error('not_authenticated') }
    const { error } = await sb.from('resources').delete().eq('id', id).eq('user_id', user.id)
    if (error) { set({ resources: prev }); throw error }
  },
}))
