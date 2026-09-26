// Public endpoint — returns the admin's Core Run goals for display in member tracker
// Goals are not sensitive data — they're just daily targets shown to team members
import { NextResponse } from 'next/server'
import { sbAdmin as sb, resolveAdminId } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // Was its own duplicate, uncached copy of the admin-lookup fallback
    // chain (env var -> paginate listUsers up to 200 pages) -- consolidated
    // onto the shared, cached resolveAdminId() (see lib/supabase/admin.ts),
    // which also gets the meta-table lookup for free instead of jumping
    // straight to an unbounded Supabase admin-API pagination loop on every
    // call to this PUBLIC, unauthenticated route.
    const adminId = await resolveAdminId()
    if (!adminId) return NextResponse.json({ goals: null })

    // Read core_goals_v4 from admin's meta — order+limit(1) tolerates duplicate rows
    const { data: rows } = await sb.from('meta')
      .select('value')
      .eq('user_id', adminId)
      .eq('key', 'core_goals_v4')
      .order('updated_at', { ascending: false })
      .limit(1)
    const data = rows?.[0] ?? null

    if (!data?.value) return NextResponse.json({ goals: null })
    let goals: unknown
    try { goals = JSON.parse(data.value) } catch {
      console.error('track/member-goals JSON.parse error: corrupted meta value')
      return NextResponse.json({ goals: null, error: 'internal_error' }, { status: 500 })
    }
    return NextResponse.json({ goals })
  } catch (e: any) {
    console.error('track/member-goals error:', e); return NextResponse.json({ goals: null, error: 'internal_error' }, { status: 500 })
  }
}
