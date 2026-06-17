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
    const { data: { user } } = await sb.auth.getUser()
    const userId = user?.id ?? ''
    if (!userId) return null
    try {
      const { data } = await sb.from('meta').select('value').eq('user_id', userId).eq('key', key)
      return data?.[data.length-1]?.value ?? null
    } catch { return null }
  },

  setMeta: async (key, value) => {
    const { data: { user } } = await sb.auth.getUser()
    const userId = user?.id ?? ''
    if (!userId) return
    try {
      // delete then insert — avoids unique constraint errors if index is missing
      await sb.from('meta').delete().eq('user_id', userId).eq('key', key)
      await sb.from('meta').insert({ key, user_id: userId, value })
    } catch {}
  },

  loadResources: async () => {
    const { data: { user } } = await sb.auth.getUser()
    const userId = user?.id ?? ''
    if (!userId) return
    try {
      const { data } = await sb.from('resources').select('*').eq('user_id', userId).order('created_at', { ascending: false })
      set({ resources: (data ?? []) as Resource[] })
    } catch {}
  },

  upsertResource: async (r) => {
    set(s => {
      const idx = s.resources.findIndex(x => x.id === r.id)
      return { resources: idx >= 0 ? s.resources.map(x => x.id === r.id ? r : x) : [r, ...s.resources] }
    })
    try { await sb.from('resources').upsert(r as unknown as Record<string, unknown>, { onConflict: 'id' }) } catch {}
  },

  deleteResource: async (id) => {
    set(s => ({ resources: s.resources.filter(r => r.id !== id) }))
    try { await sb.from('resources').delete().eq('id', id) } catch {}
  },

  loadAudios: async () => {
    const { data: { user } } = await sb.auth.getUser()
    const userId = user?.id ?? ''
    if (!userId) return
    try {
      const { data } = await sb.from('audios').select('*').eq('user_id', userId).order('created_at', { ascending: false })
      set({ audios: (data ?? []) as Audio[] })
    } catch {}
  },

  upsertAudio: async (a) => {
    set(s => {
      const idx = s.audios.findIndex(x => x.id === a.id)
      return { audios: idx >= 0 ? s.audios.map(x => x.id === a.id ? a : x) : [a, ...s.audios] }
    })
    try { await sb.from('audios').upsert(a as unknown as Record<string, unknown>, { onConflict: 'id' }) } catch {}
  },

  deleteAudio: async (id) => {
    set(s => ({ audios: s.audios.filter(a => a.id !== id) }))
    try { await sb.from('audios').delete().eq('id', id) } catch {}
  },

  loadTasks: async () => {
    const { data: { user } } = await sb.auth.getUser()
    const userId = user?.id ?? ''
    if (!userId) return
    try {
      const { data } = await sb.from('tasks').select('*').eq('user_id', userId).order('created_at', { ascending: false })
      set({ tasks: (data ?? []) as Task[] })
    } catch {}
  },

  upsertTask: async (t) => {
    set(s => {
      const idx = s.tasks.findIndex(x => x.id === t.id)
      return { tasks: idx >= 0 ? s.tasks.map(x => x.id === t.id ? t : x) : [t, ...s.tasks] }
    })
    try { await sb.from('tasks').upsert(t as unknown as Record<string, unknown>, { onConflict: 'id' }) } catch {}
  },

  deleteTask: async (id) => {
    set(s => ({ tasks: s.tasks.filter(t => t.id !== id) }))
    try { await sb.from('tasks').delete().eq('id', id) } catch {}
  },
}))
