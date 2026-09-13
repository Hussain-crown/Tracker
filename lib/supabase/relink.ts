// Every table here (besides team_members, which the caller updates itself)
// carries per-member data keyed by user_id. When Operations' Growth Tracker
// data was split into this project, every member's history stayed under
// their OLD Operations auth id — a brand-new Supabase Auth project hands out
// a fresh random id on first login, so without this, a member's entire
// history (leads, habits, contact logs, goals, ...) goes invisible under RLS
// the moment they sign in, exactly like the bug once found for the admin.
// Matching is always on an exact old user_id, so this only ever touches rows
// that already belonged to that specific person — safe even for tables
// (partners, partner_monthly, partner_notes) that in practice only the
// admin has ever written to.
const RELINK_TABLES = [
  'habits', 'wins', 'weekly_reviews', 'mood_entries', 'ai_insights',
  'statements', 'roi_costs', 'gpv_history', 'tasks', 'resources', 'audios',
  'partner_monthly', 'partner_notes', 'error_logs', 'push_subscriptions',
  'meta', 'leads', 'candidates', 'partners', 'contact_logs', 'tracker_leads',
] as const

export interface RelinkResult {
  table: string
  moved: number
  error?: string
}

// Best-effort, one table at a time so one bad table (e.g. a schema drift)
// never blocks the rest from moving over. Never throws — a partial relink is
// far better than none, and the caller must not fail the login over this.
export async function relinkUserData(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  oldUserId: string,
  newUserId: string
): Promise<RelinkResult[]> {
  if (!oldUserId || !newUserId || oldUserId === newUserId) return []

  const results: RelinkResult[] = []
  for (const table of RELINK_TABLES) {
    try {
      const { data, error } = await sb
        .from(table)
        .update({ user_id: newUserId })
        .eq('user_id', oldUserId)
        .select('user_id')
      if (error) { results.push({ table, moved: 0, error: error.message }); continue }
      results.push({ table, moved: data?.length || 0 })
    } catch (e: any) {
      results.push({ table, moved: 0, error: e?.message || String(e) })
    }
  }
  return results
}
