import { NextResponse } from 'next/server'
import { sbAdmin, verifyUser } from '@/lib/supabase/admin'

async function resolveAdminId(): Promise<string> {
  const adminEmail = (process.env.NEXT_PUBLIC_ADMIN_EMAIL || '').toLowerCase().trim()
  if (!adminEmail) return ''
  let page = 1
  while (true) {
    const { data } = await sbAdmin.auth.admin.listUsers({ page, perPage: 50 })
    const found = (data?.users || []).find((u: any) => (u.email || '').toLowerCase() === adminEmail)
    if (found) return found.id
    if ((data?.users || []).length < 50) break
    page++
  }
  return ''
}

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
    const body = await req.json()
    const resource = { ...body.resource, admin_id: adminId }
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
    const body = await req.json()
    const adminId = await resolveAdminId()
    if (!adminId) return NextResponse.json({ error: 'admin not found' }, { status: 404 })
    const { error } = await sbAdmin.from('team_resources').delete().eq('id', body.id).eq('admin_id', adminId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: any) { console.error('shared-resources error:', e); return NextResponse.json({ error: 'internal_error' }, { status: 500 }) }
}
