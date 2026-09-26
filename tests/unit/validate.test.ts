import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { parseBody } from '@/lib/validate'

const schema = z.object({ userId: z.string(), level: z.number() })

function reqWith(body: unknown): Request {
  return new Request('http://localhost/api/test', { method: 'POST', body: JSON.stringify(body) })
}

function invalidJsonReq(): Request {
  return new Request('http://localhost/api/test', { method: 'POST', body: '{not json' })
}

describe('parseBody', () => {
  it('returns data and no res for a valid body', async () => {
    const parsed = await parseBody(reqWith({ userId: 'u1', level: 2 }), schema)
    expect(parsed.res).toBeNull()
    expect(parsed.data).toEqual({ userId: 'u1', level: 2 })
  })

  it('returns a 400 res for malformed JSON', async () => {
    const parsed = await parseBody(invalidJsonReq(), schema)
    expect(parsed.data).toBeNull()
    expect(parsed.res).not.toBeNull()
    expect(parsed.res!.status).toBe(400)
    const body = await parsed.res!.json()
    expect(body.error).toBe('invalid_json')
  })

  it('returns a 400 res for a body that fails schema validation', async () => {
    const parsed = await parseBody(reqWith({ userId: 'u1', level: 'not-a-number' }), schema)
    expect(parsed.data).toBeNull()
    expect(parsed.res).not.toBeNull()
    expect(parsed.res!.status).toBe(400)
    const body = await parsed.res!.json()
    expect(body.error).toBe('invalid_request')
  })

  it('returns a 400 res for a missing required field', async () => {
    const parsed = await parseBody(reqWith({ userId: 'u1' }), schema)
    expect(parsed.res).not.toBeNull()
    expect(parsed.res!.status).toBe(400)
  })
})
