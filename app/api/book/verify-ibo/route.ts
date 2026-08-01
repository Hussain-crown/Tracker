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

async function getAdminId(): Promise<string|null> {
  if(process.env.ADMIN_USER_ID) return process.env.ADMIN_USER_ID
  const { data } = await getSb().from('meta').select('user_id').in('key',[
    'booking_availability','booking_rules','booking_zoom_link',
    'booking_display_name','booking_admin_email','booking_custom_type'
  ]).order('updated_at',{ascending:false}).limit(1)
  if(data?.[0]?.user_id) return data[0].user_id
  const { data: t } = await getSb().from('google_tokens').select('user_id').limit(1)
  return t?.[0]?.user_id ?? null
}

export async function GET(req: Request) {
  if (isRateLimited(getClientIp(req), 20, 60_000))
    return NextResponse.json({ valid: false, error: 'Too many requests' }, { status: 429 })

  const { searchParams } = new URL(req.url)
  const ibo = (searchParams.get('ibo') || '').trim()
  if (!ibo) return NextResponse.json({ valid: false, error: 'No IBO provided' })
  if (!/^\d{4,12}$/.test(ibo)) return NextResponse.json({ valid: false, error: 'Invalid IBO format' })

  try {
    const adminId = await getAdminId()
    if (!adminId) return NextResponse.json({ valid: false, error: 'Not configured' })

    // ── CHECK 1: Admin's own IBO — always grant access ──
    const adminIbo = (process.env.ADMIN_IBO || '').trim()
    if (ibo === adminIbo) {
      // Get admin's display name
      const { data: nameMeta } = await getSb().from('meta')
        .select('value, updated_at').eq('user_id', adminId).eq('key', 'booking_display_name')
        .order('updated_at', { ascending: false }).limit(1)
      return NextResponse.json({
        valid: true,
        partner: {
          id: 'admin',
          name: nameMeta?.[0]?.value || 'Hussain',
          ibo_number: ibo,
        }
      })
    }

    // ── CHECK 2: Partners table ──
    const { data: partners } = await getSb()
      .from('partners')
      .select('id, name, ibo_number')
      .eq('user_id', adminId)
      .eq('ibo_number', ibo)
      .not('archived', 'is', true)
      .limit(1)

    if (!partners?.length) {
      return NextResponse.json({ valid: false, error: 'IBO number not recognised. Contact your upline.' })
    }

    const p = partners[0]
    // Return only name — email/phone are resolved server-side in submit/route.ts to prevent PII enumeration
    return NextResponse.json({
      valid: true,
      partner: {
        id: p.id,
        name: p.name,
        ibo_number: p.ibo_number,
      }
    })
  } catch (e: any) {
    console.error('verify-ibo error:', e); return NextResponse.json({ valid: false, error: 'internal_error' }, { status: 500 })
  }
}
