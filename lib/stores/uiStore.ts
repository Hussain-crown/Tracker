import { create } from 'zustand'
import { supabase as sb } from '@/lib/supabase/client'
import type { Resource, Audio, Task } from './types'

interface UIStore {
  page: string
  online: boolean
  syncing: boolean
  pending: number
  userId: string
  userEmail: string
  resources: Resource[]
  audios: Audio[]
  tasks: Task[]
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
  loadAudios: () => Promise<void>
  upsertAudio: (a: Audio) => Promise<void>
  deleteAudio: (id: string) => Promise<void>
  loadTasks: () => Promise<void>
  upsertTask: (t: Task) => Promise<void>
  deleteTask: (id: string) => Promise<void>
}

export const useUIStore = create<UIStore>((set) => ({
  page: 'dashboard',
  online: true,
  syncing: false,
  pending: 0,
  userId: '',
  userEmail: '',
  resources: [],
  audios: [],
  tasks: [],

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
    const { error: uErr } = await sb.from('meta').upsert(
      { user_id: userId, key, value, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,key' }
    )
    if (uErr) {
      // Fallback: read old value, delete, insert — restore on insert failure
      const { data: existing } = await sb.from('meta').select('value').eq('user_id', userId).eq('key', key).limit(1)
      const oldValue = existing?.[0]?.value
      await sb.from('meta').delete().eq('user_id', userId).eq('key', key)
      const now = new Date().toISOString()
      const { error: iErr } = await sb.from('meta').insert({ key, user_id: userId, value, updated_at: now })
      if (iErr) {
        if (oldValue !== undefined) try { await sb.from('meta').insert({ key, user_id: userId, value: oldValue, updated_at: now }) } catch (e) { console.error(e) }
        throw iErr
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
    const { error } = await sb.from('resources').upsert(r as unknown as Record<string, unknown>, { onConflict: 'id' })
    if (error) { set({ resources: prev }); throw error }
  },

  deleteResource: async (id) => {
    let prev: Resource[] = []
    set(s => { prev = s.resources; return { resources: s.resources.filter(r => r.id !== id) } })
    const { data: { user } } = await sb.auth.getUser()
    if (!user?.id) { set({ resources: prev }); throw new Error('not_authenticated') }
    const { error } = await sb.from('resources').delete().eq('id', id).eq('user_id', user.id)
    if (error) { set({ resources: prev }); throw error }
  },

  loadAudios: async () => {
    const { data: { user } } = await sb.auth.getUser()
    const userId = user?.id ?? ''
    if (!userId) return
    try {
      const { data } = await sb.from('audios').select('*').eq('user_id', userId).order('created_at', { ascending: false })
      set({ audios: (data ?? []) as Audio[] })
    } catch (e) { console.error(e) }
  },

  upsertAudio: async (a) => {
    let prev: Audio[] = []
    set(s => { prev = s.audios; const idx = s.audios.findIndex(x => x.id === a.id); return { audios: idx >= 0 ? s.audios.map(x => x.id === a.id ? a : x) : [a, ...s.audios] } })
    const { error } = await sb.from('audios').upsert(a as unknown as Record<string, unknown>, { onConflict: 'id' })
    if (error) { set({ audios: prev }); throw error }
  },

  deleteAudio: async (id) => {
    let prev: Audio[] = []
    set(s => { prev = s.audios; return { audios: s.audios.filter(a => a.id !== id) } })
    const { data: { user } } = await sb.auth.getUser()
    if (!user?.id) { set({ audios: prev }); throw new Error('not_authenticated') }
    const { error } = await sb.from('audios').delete().eq('id', id).eq('user_id', user.id)
    if (error) { set({ audios: prev }); throw error }
  },

  loadTasks: async () => {
    const { data: { user } } = await sb.auth.getUser()
    const userId = user?.id ?? ''
    if (!userId) return
    try {
      const { data } = await sb.from('tasks').select('*').eq('user_id', userId).order('created_at', { ascending: false })
      set({ tasks: (data ?? []) as Task[] })
    } catch (e) { console.error(e) }
  },

  upsertTask: async (t) => {
    let prev: Task[] = []
    set(s => { prev = s.tasks; const idx = s.tasks.findIndex(x => x.id === t.id); return { tasks: idx >= 0 ? s.tasks.map(x => x.id === t.id ? t : x) : [t, ...s.tasks] } })
    const { error } = await sb.from('tasks').upsert(t as unknown as Record<string, unknown>, { onConflict: 'id' })
    if (error) { set({ tasks: prev }); throw error }
  },

  deleteTask: async (id) => {
    let prev: Task[] = []
    set(s => { prev = s.tasks; return { tasks: s.tasks.filter(t => t.id !== id) } })
    const { data: { user } } = await sb.auth.getUser()
    if (!user?.id) { set({ tasks: prev }); throw new Error('not_authenticated') }
    const { error } = await sb.from('tasks').delete().eq('id', id).eq('user_id', user.id)
    if (error) { set({ tasks: prev }); throw error }
  },
}))
