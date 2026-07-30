import { NextResponse } from 'next/server'
import { sbAdmin as sb, verifyUser } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

async function resolveAdminId(): Promise<string> {
  let adminId = process.env.ADMIN_USER_ID || ''
  if (adminId) return adminId
  const adminEmail = (process.env.ADMIN_EMAIL || process.env.NEXT_PUBLIC_ADMIN_EMAIL || '').toLowerCase().trim()
  if (!adminEmail) return ''
  let page = 1
  while (page <= 200) {
    const { data } = await sb.auth.admin.listUsers({ page, perPage: 50 })
    const found = (data?.users || []).find((u: any) => (u.email || '').toLowerCase() === adminEmail)
    if (found) return found.id
    if ((data?.users || []).length < 50) break
    page++
  }
  return ''
}

// GET — public read for team tracker (no auth needed)
export async function GET() {
  try {
    const adminId = await resolveAdminId()
    if (!adminId) return NextResponse.json({ resources: [] })
    const { data, error } = await sb.from('team_resources').select('*').eq('admin_id', adminId).order('created_at', { ascending: false })
    if (error) return NextResponse.json({ resources: [], error: error.message })
    return NextResponse.json({ resources: data || [] })
  } catch (e: any) { console.error('track/team/resources error:', e); return NextResponse.json({ resources: [], error: 'internal_error' }) }
}

// POST — admin only: upsert a resource
export async function POST(req: Request) {
  try {
    const requester = await verifyUser(req)
    const adminEmail = (process.env.NEXT_PUBLIC_ADMIN_EMAIL || '').toLowerCase().trim()
    if (!requester || !adminEmail || requester.email !== adminEmail)
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    let body: any
    try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
    if (!body?.resource || typeof body.resource !== 'object') return NextResponse.json({ error: 'resource object required' }, { status: 400 })
    const adminId = await resolveAdminId()
    if (!adminId) return NextResponse.json({ error: 'admin not found' }, { status: 404 })
    const resource = {
      ...(body.resource.id ? { id: body.resource.id } : {}),
      title: String(body.resource.title ?? '').slice(0, 120),
      url: String(body.resource.url ?? '').slice(0, 500),
      description: String(body.resource.description ?? '').slice(0, 500),
      category: String(body.resource.category ?? '').slice(0, 60),
      icon: String(body.resource.icon ?? '').slice(0, 10),
      admin_id: adminId,
    }
    const { error } = await sb.from('team_resources').upsert(resource, { onConflict: 'id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: any) { console.error('track/team/resources error:', e); return NextResponse.json({ error: 'internal_error' }, { status: 500 }) }
}

// DELETE — admin only
export async function DELETE(req: Request) {
  try {
    const requester = await verifyUser(req)
    const adminEmail = (process.env.NEXT_PUBLIC_ADMIN_EMAIL || '').toLowerCase().trim()
    if (!requester || !adminEmail || requester.email !== adminEmail)
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    let body: any
    try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
    if (!body.id || typeof body.id !== 'string') return NextResponse.json({ error: 'id required' }, { status: 400 })
    const adminId = await resolveAdminId()
    const { error } = await sb.from('team_resources').delete().eq('id', body.id).eq('admin_id', adminId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: any) { console.error('track/team/resources error:', e); return NextResponse.json({ error: 'internal_error' }, { status: 500 }) }
}
