import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET — public read for team tracker (no auth needed)
export async function GET() {
  try {
    const adminEmail = (process.env.NEXT_PUBLIC_ADMIN_EMAIL || '').toLowerCase().trim()
    if (!adminEmail) return NextResponse.json({ resources: [] })
    const { data: users } = await sb.auth.admin.listUsers()
    const admin = (users?.users || []).find((u:any) => (u.email||'').toLowerCase() === adminEmail)
    if (!admin) return NextResponse.json({ resources: [] })
    const { data } = await sb.from('team_resources').select('*').eq('admin_id', admin.id).order('created_at', { ascending: false })
    return NextResponse.json({ resources: data || [] })
  } catch { return NextResponse.json({ resources: [] }) }
}

// POST — admin only: upsert a resource
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const adminEmail = (process.env.NEXT_PUBLIC_ADMIN_EMAIL || '').toLowerCase().trim()
    if (!adminEmail || (body.requesterEmail || '').toLowerCase() !== adminEmail)
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    const { data: users } = await sb.auth.admin.listUsers()
    const admin = (users?.users || []).find((u:any) => (u.email||'').toLowerCase() === adminEmail)
    if (!admin) return NextResponse.json({ error: 'not found' }, { status: 404 })
    const resource = { ...body.resource, admin_id: admin.id }
    await sb.from('team_resources').upsert(resource, { onConflict: 'id' })
    return NextResponse.json({ ok: true })
  } catch (e:any) { return NextResponse.json({ error: e.message }, { status: 500 }) }
}

// DELETE — admin only
export async function DELETE(req: Request) {
  try {
    const body = await req.json()
    const adminEmail = (process.env.NEXT_PUBLIC_ADMIN_EMAIL || '').toLowerCase().trim()
    if (!adminEmail || (body.requesterEmail || '').toLowerCase() !== adminEmail)
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    await sb.from('team_resources').delete().eq('id', body.id)
    return NextResponse.json({ ok: true })
  } catch (e:any) { return NextResponse.json({ error: e.message }, { status: 500 }) }
}
