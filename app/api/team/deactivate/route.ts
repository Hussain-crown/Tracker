import { NextResponse } from 'next/server'
import { getSbAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// Server-to-server only: called by Operations when a partner is marked
// "dropped out" there, so their Tracker access is revoked in the same
// action instead of relying on someone remembering to do it separately.
// Auth is a shared secret header, not a user session — there is no
// logged-in Tracker user on the Operations side of this call.
export async function POST(req: Request) {
  const secret = req.headers.get('x-internal-secret') || ''
  if (!process.env.INTERNAL_BRIDGE_SECRET || secret !== process.env.INTERNAL_BRIDGE_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  const ibo = String(body?.ibo || '').trim()
  if (!/^\d{4,12}$/.test(ibo)) return NextResponse.json({ error: 'invalid_ibo' }, { status: 400 })

  try {
    const sb = getSbAdmin()
    const { data: updated, error } = await sb
      .from('team_members')
      .update({ status: 'inactive', updated_at: new Date().toISOString() })
      .eq('ibo_number', ibo)
      .select('user_id, name')
      .maybeSingle()
    if (error) {
      console.error('team/deactivate update failed:', error.message)
      return NextResponse.json({ error: 'db_error' }, { status: 500 })
    }
    return NextResponse.json({ ok: true, deactivated: !!updated, member: updated || null })
  } catch (e: any) {
    console.error('team/deactivate error:', e)
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
