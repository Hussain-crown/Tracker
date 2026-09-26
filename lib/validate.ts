import { NextResponse } from 'next/server'
import type { z } from 'zod'

// Shared body-validation helper for API routes: parses JSON, validates it
// against a Zod schema, and returns a ready-to-send 400 response on either
// failure so every route handles malformed/invalid input the same way.
//
// Returns `{ data, res }` rather than a discriminated union on a boolean
// flag -- this repo's tsconfig has `strict: false` (no strictNullChecks),
// under which TS does not narrow a `{ok:true;...}|{ok:false;...}` union at
// all (confirmed: the same union narrows correctly with strictNullChecks
// on, and not with it off). Checking `if (parsed.res) return parsed.res`
// only relies on a value being truthy/absent, which narrows fine either way.
export async function parseBody<S extends z.ZodTypeAny>(req: Request, schema: S):
  Promise<{ data: z.infer<S> | null; res: NextResponse | null }> {
  let json: unknown
  try {
    json = await req.json()
  } catch {
    return { data: null, res: NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
  }
  const result = schema.safeParse(json)
  if (!result.success) {
    return {
      data: null,
      res: NextResponse.json({ error: 'invalid_request', details: result.error.flatten() }, { status: 400 }),
    }
  }
  return { data: result.data, res: null }
}
