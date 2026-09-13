import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Regression coverage for the read-only status-lookup endpoint Operations'
// reconciliation cron uses to verify the deactivate/reactivate bridge
// actually landed in Tracker's database.

const inMock = vi.fn()
const selectMock = vi.fn(() => ({ in: inMock }))
const fromMock = vi.fn(() => ({ select: selectMock }))
vi.mock('@/lib/supabase/admin', () => ({
  getSbAdmin: () => ({ from: fromMock }),
}))
vi.mock('@/lib/ratelimit', () => ({
  isRateLimited: () => Promise.resolve(false),
  getClientIp: () => '127.0.0.1',
}))

const { POST } = await import('../../app/api/team/status/route')

function makeReq(body: any, secret = 'test-secret'): Request {
  return new Request('http://localhost/api/team/status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-secret': secret },
    body: JSON.stringify(body),
  })
}

describe('POST /api/team/status', () => {
  beforeEach(() => {
    fromMock.mockReset()
    inMock.mockReset()
    process.env.INTERNAL_BRIDGE_SECRET = 'test-secret'
  })
  afterEach(() => { delete process.env.INTERNAL_BRIDGE_SECRET })

  it('rejects a missing/wrong secret', async () => {
    const res = await POST(makeReq({ ibos: ['12345'] }, 'wrong'))
    expect(res.status).toBe(401)
  })

  it('rejects an empty ibos list', async () => {
    const res = await POST(makeReq({ ibos: [] }))
    expect(res.status).toBe(400)
  })

  it('rejects more than 200 ibos', async () => {
    const many = Array.from({ length: 201 }, (_, i) => String(10000 + i))
    const res = await POST(makeReq({ ibos: many }))
    expect(res.status).toBe(400)
  })

  it('filters out malformed ibos before querying', async () => {
    inMock.mockResolvedValue({ data: [{ ibo_number: '12345', status: 'active' }], error: null })
    const res = await POST(makeReq({ ibos: ['12345', 'not-a-number', ''] }))
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(inMock).toHaveBeenCalledWith('ibo_number', ['12345'])
  })

  it('returns member statuses on success', async () => {
    inMock.mockResolvedValue({ data: [{ ibo_number: '12345', status: 'inactive' }], error: null })
    const res = await POST(makeReq({ ibos: ['12345'] }))
    const json = await res.json()
    expect(json).toEqual({ ok: true, members: [{ ibo_number: '12345', status: 'inactive' }] })
  })
})
