import { NextResponse } from 'next/server'
import { z } from 'zod'
import { sbAdmin, verifyUser, resolveAdminId } from '@/lib/supabase/admin'
import { parseBody } from '@/lib/validate'

export const dynamic = 'force-dynamic'

const postBodySchema = z.object({
  resource: z.object({}).passthrough().optional(),
})
const deleteBodySchema = z.object({
  id: z.string(),
})

async function getMemberLevel(userId: string): Promise<number> {
  const { data } = await sbAdmin.from('team_members').select('level').eq('user_id', userId).maybeSingle()
  return data?.level ?? 0
}

// GET — no auth needed; all team members see the shared pool
export async function GET() {
  try {
    const adminId = await resolveAdminId()
    if (!adminId) return NextResponse.json({ resources: [] })
    const { data, error } = await sbAdmin.from('team_resources').select('*').eq('admin_id', adminId).order('created_at', { ascending: false })
    if (error) return NextResponse.json({ resources: [], error: error.message })
    return NextResponse.json({ resources: data || [] })
  } catch (e: any) { console.error('shared-resources error:', e); return NextResponse.json({ resources: [], error: 'internal_error' }) }
}

// POST — level 2+ members can add to the shared pool
export async function POST(req: Request) {
  try {
    const requester = await verifyUser(req)
    if (!requester) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    const level = await getMemberLevel(requester.id)
    if (level < 2) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    const adminId = await resolveAdminId()
    if (!adminId) return NextResponse.json({ error: 'admin not found' }, { status: 404 })
    const parsed = await parseBody(req, postBodySchema)
    if (parsed.res) return parsed.res
    const r = (parsed.data.resource || {}) as any
    const resource = {
      ...(r.id ? { id: r.id } : {}),
      title: String(r.title || '').slice(0, 200),
      type: String(r.type || '').slice(0, 100),
      category: String(r.category || '').slice(0, 100),
      author: String(r.author || '').slice(0, 200),
      url: String(r.url || '').slice(0, 500),
      description: String(r.description || '').slice(0, 1000),
      admin_id: adminId,
    }
    // If updating an existing resource, verify it belongs to this admin before touching it
    if (resource.id) {
      const { data: existing } = await sbAdmin.from('team_resources').select('admin_id').eq('id', resource.id).maybeSingle()
      if (existing && existing.admin_id !== adminId) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    const { error } = await sbAdmin.from('team_resources').upsert(resource, { onConflict: 'id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: any) { console.error('shared-resources error:', e); return NextResponse.json({ error: 'internal_error' }, { status: 500 }) }
}

// DELETE — level 2+ members can delete from the shared pool
export async function DELETE(req: Request) {
  try {
    const requester = await verifyUser(req)
    if (!requester) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    const level = await getMemberLevel(requester.id)
    if (level < 2) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    const parsed = await parseBody(req, deleteBodySchema)
    if (parsed.res) return parsed.res
    const adminId = await resolveAdminId()
    if (!adminId) return NextResponse.json({ error: 'admin not found' }, { status: 404 })
    const { error } = await sbAdmin.from('team_resources').delete().eq('id', parsed.data.id).eq('admin_id', adminId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: any) { console.error('shared-resources error:', e); return NextResponse.json({ error: 'internal_error' }, { status: 500 }) }
}
