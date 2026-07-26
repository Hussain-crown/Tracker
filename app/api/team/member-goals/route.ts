// Public endpoint — returns the admin's Core Run goals for display in member tracker
// Goals are not sensitive data — they're just daily targets shown to team members
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function GET() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  try {
    // Find admin by ADMIN_USER_ID env var or by email
    let adminId = process.env.ADMIN_USER_ID || ''
    if (!adminId) {
      const adminEmail = (process.env.ADMIN_EMAIL || process.env.NEXT_PUBLIC_ADMIN_EMAIL || '').toLowerCase()
      if (adminEmail) {
        let page = 1
        while (page <= 200) {
          const { data } = await sb.auth.admin.listUsers({ page, perPage: 50 })
          const found = (data?.users || []).find((u: any) => (u.email || '').toLowerCase() === adminEmail)
          if (found) { adminId = found.id; break }
          if ((data?.users || []).length < 50) break
          page++
        }
      }
    }
    if (!adminId) return NextResponse.json({ goals: null })

    // Read core_goals_v4 from admin's meta
    const { data } = await sb.from('meta')
      .select('value')
      .eq('user_id', adminId)
      .eq('key', 'core_goals_v4')
      .maybeSingle()

    if (!data?.value) return NextResponse.json({ goals: null })
    const goals = JSON.parse(data.value)
    return NextResponse.json({ goals })
  } catch (e: any) {
    console.error('track/member-goals error:', e); return NextResponse.json({ goals: null, error: 'internal_error' })
  }
}
