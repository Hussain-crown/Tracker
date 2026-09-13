import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isRateLimited, getClientIp } from '@/lib/ratelimit'

export const dynamic = 'force-dynamic'

function getSb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Admin's own IBO/partner data lives in Operations (the real source of truth for
// partner org structure) — Tracker no longer keeps its own copy of `partners`/`meta`
// for this check. We proxy to Operations' existing public, rate-limited endpoint
// instead of duplicating the lookup logic here.
async function verifyAgainstOperations(ibo: string): Promise<{ valid: boolean; partner?: any; error?: string }> {
  const base = process.env.OPERATIONS_API_URL
  if (!base) return { valid: false, error: 'Not configured' }
  try {
    const res = await fetch(`${base}/api/book/verify-ibo?ibo=${encodeURIComponent(ibo)}`, {
      headers: { 'Accept': 'application/json' },
      cache: 'no-store',
    })
    if (!res.ok) return { valid: false, error: 'Lookup failed' }
    return await res.json()
  } catch {
    return { valid: false, error: 'Lookup failed' }
  }
}

export async function GET(req: Request) {
  if (await isRateLimited(getClientIp(req), 20, 60_000))
    return NextResponse.json({ valid: false, error: 'Too many requests' }, { status: 429 })

  const { searchParams } = new URL(req.url)
  const ibo = (searchParams.get('ibo') || '').trim()
  if (!ibo) return NextResponse.json({ valid: false, error: 'No IBO provided' })
  if (!/^\d{4,12}$/.test(ibo)) return NextResponse.json({ valid: false, error: 'Invalid IBO format' })

  try {
    // ── CHECK 1 + 2 (admin's own IBO, partners table) — bridged live from Operations ──
    const opsResult = await verifyAgainstOperations(ibo)
    if (opsResult.valid) return NextResponse.json(opsResult)

    // ── CHECK 3: Tracker's own team_members table (people already registered here) ──
    const { data: members } = await getSb()
      .from('team_members')
      .select('id, name, ibo_number')
      .eq('ibo_number', ibo)
      .eq('status', 'active')
      .limit(1)
    if (members?.length) {
      const m = members[0]
      return NextResponse.json({
        valid: true,
        partner: { id: m.id, name: m.name, ibo_number: m.ibo_number }
      })
    }

    return NextResponse.json({ valid: false, error: 'IBO number not recognised. Contact your upline.' })
  } catch (e: any) {
    console.error('verify-ibo error:', e)
    return NextResponse.json({ valid: false, error: 'internal_error' }, { status: 500 })
  }
}
