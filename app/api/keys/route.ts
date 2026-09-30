import { NextResponse } from 'next/server'
import { getSbAdmin, verifyUser } from '@/lib/supabase/admin'
import { randomBytes } from 'crypto'
import { hashApiKey } from '@/lib/apiKeyHash'
import { isRateLimited, getClientIp } from '@/lib/ratelimit'

export const dynamic = 'force-dynamic'

// Keys are hashed at rest — the plaintext is only ever returned once, in the
// POST response right after generation. GET reports whether an active key
// exists (for UI state) but can never recover the plaintext of an existing key.
export async function GET(req: Request) {
  try {
    const user = await verifyUser(req)
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    const sbAdmin = getSbAdmin()
    const { data } = await sbAdmin
      .from('api_keys')
      .select('created_at')
      .eq('user_id', user.id)
      .eq('active', true)
      .order('created_at', { ascending: false })
      .limit(1)
    const row = (data as any)?.[0] ?? null
    return NextResponse.json({ hasKey: !!row, created_at: row?.created_at ?? null })
  } catch {
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  if (await isRateLimited(`keys:post:${getClientIp(req)}`, 10, 60_000))
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  try {
    const user = await verifyUser(req)
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    const sbAdmin = getSbAdmin()
    const key = `ios_${randomBytes(24).toString('hex')}`
    const keyHash = hashApiKey(key)
    // Insert the replacement before deactivating the old one — if this insert
    // fails, the account keeps its existing active key instead of being left
    // with none.
    const { data: inserted, error } = await sbAdmin.from('api_keys')
      .insert({ key: `hashed:${keyHash}`, key_hash: keyHash, user_id: user.id, active: true })
      .select('id').single()
    if (error) throw error
    const { error: deactivateErr } = await sbAdmin.from('api_keys').update({ active: false })
      .eq('user_id', user.id).neq('id', (inserted as any).id)
    if (deactivateErr) console.error('api_keys: failed to deactivate old key(s):', deactivateErr.message)
    return NextResponse.json({ key })
  } catch {
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  if (await isRateLimited(`keys:delete:${getClientIp(req)}`, 10, 60_000))
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  try {
    const user = await verifyUser(req)
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    const sbAdmin = getSbAdmin()
    const { error } = await sbAdmin.from('api_keys').update({ active: false }).eq('user_id', user.id)
    if (error) return NextResponse.json({ error: 'internal_error' }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'internal_error' }, { status: 500 })
  }
}
