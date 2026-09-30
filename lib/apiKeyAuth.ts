import { getSbAdmin } from '@/lib/supabase/admin'
import { hashApiKey } from '@/lib/apiKeyHash'

export const API_KEY_CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
}

// Shared by the iOS Shortcut endpoints (log-habit, log-prospect,
// stage-candidate). Header/bearer transport only — a query-param key would
// land in access logs, CDN logs, browser history, and any third-party
// resource's Referer header on the page.
export async function authenticateApiKey(req: Request): Promise<{ userId: string } | { error: string; status: number }> {
  const authHeader = req.headers.get('authorization') ?? ''
  const bearerKey = authHeader.startsWith('Bearer ios_') ? authHeader.slice(7) : null
  const apiKey = bearerKey ?? req.headers.get('x-api-key')
  if (!apiKey) return { error: 'Missing API key', status: 401 }

  const sbAdmin = getSbAdmin()
  // Hashed keys match on key_hash; legacy plaintext keys still match on key.
  // Two lookups (not .or() string interpolation) so an arbitrary client-
  // supplied key can never be crafted to alter the filter itself. The
  // legacy path is skipped for anything shaped like our internal
  // "hashed:<hash>" placeholder — otherwise submitting that literal string
  // (if a hash ever leaked) would authenticate exactly like the real key.
  let { data: keyRow, error: keyErr } = await sbAdmin
    .from('api_keys').select('user_id, active').eq('key_hash', hashApiKey(apiKey)).maybeSingle()
  if (!keyErr && !keyRow && !apiKey.startsWith('hashed:')) {
    ({ data: keyRow, error: keyErr } = await sbAdmin
      .from('api_keys').select('user_id, active').eq('key', apiKey).maybeSingle())
  }
  if (keyErr) return { error: 'lookup_failed', status: 500 }
  if (!keyRow || !(keyRow as any).active) return { error: 'Invalid or inactive API key', status: 403 }

  return { userId: (keyRow as any).user_id as string }
}
