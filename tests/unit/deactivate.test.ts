import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Regression coverage for the deactivate/reactivate endpoint that Operations
// calls when a partner is marked dropped out (or restored). This is the
// business-critical half of the access-control bridge — a bug here means a
// dropped-out partner keeps live Tracker access, or a restored one stays
// locked out.

const eqMock = vi.fn()
const selectMock = vi.fn(() => ({ eq: eqMock }))
const fromMock = vi.fn((): any => ({ select: selectMock }))
vi.mock('@/lib/supabase/admin', () => ({
  getSbAdmin: () => ({ from: fromMock }),
}))
vi.mock('@/lib/ratelimit', () => ({
  isRateLimited: () => Promise.resolve(false),
  getClientIp: () => '127.0.0.1',
}))

const { POST } = await import('../../app/api/team/deactivate/route')

function makeReq(body: any, secret = 'test-secret'): Request {
  return new Request('http://localhost/api/team/deactivate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-secret': secret },
    body: JSON.stringify(body),
  })
}

function mockExisting(status: string | null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: status === null ? null : { status }, error: null })
  eqMock.mockReturnValueOnce({ maybeSingle })
  // Queues the return value for THIS specific fromMock() call — order
  // matters, since the route makes two separate from() calls (lookup, then
  // update) and mockReturnValueOnce values are consumed strictly in order.
  fromMock.mockReturnValueOnce({ select: selectMock })
}

function mockUpdateChain(result: { data: any; error: any }) {
  const maybeSingle = vi.fn().mockResolvedValue(result)
  const select = vi.fn(() => ({ maybeSingle }))
  const eq = vi.fn(() => ({ select }))
  const update = vi.fn(() => ({ eq }))
  fromMock.mockReturnValueOnce({ update })
}

describe('POST /api/team/deactivate', () => {
  beforeEach(() => {
    fromMock.mockReset()
    eqMock.mockReset()
    process.env.INTERNAL_BRIDGE_SECRET = 'test-secret'
  })
  afterEach(() => { delete process.env.INTERNAL_BRIDGE_SECRET })

  it('rejects a missing/wrong secret', async () => {
    const res = await POST(makeReq({ ibo: '12345' }, 'wrong'))
    expect(res.status).toBe(401)
  })

  it('rejects when the bridge secret is not configured server-side', async () => {
    delete process.env.INTERNAL_BRIDGE_SECRET
    const res = await POST(makeReq({ ibo: '12345' }))
    expect(res.status).toBe(401)
  })

  it('rejects an invalid IBO', async () => {
    const res = await POST(makeReq({ ibo: 'abc' }))
    expect(res.status).toBe(400)
  })

  it('sets status to inactive on deactivate', async () => {
    mockExisting('active')
    mockUpdateChain({ data: { user_id: 'u1', name: 'Test' }, error: null })
    const res = await POST(makeReq({ ibo: '12345', action: 'deactivate' }))
    const json = await res.json()
    expect(json).toEqual({ ok: true, updated: true, member: { user_id: 'u1', name: 'Test' } })
    // update() was called with the inactive status
    const updateCall = (fromMock.mock.results[1].value as any).update.mock.calls[0][0]
    expect(updateCall.status).toBe('inactive')
  })

  it('restores an inactive member to active on reactivate', async () => {
    mockExisting('inactive')
    mockUpdateChain({ data: { user_id: 'u1', name: 'Test' }, error: null })
    const res = await POST(makeReq({ ibo: '12345', action: 'reactivate' }))
    const json = await res.json()
    expect(json.updated).toBe(true)
    const updateCall = (fromMock.mock.results[1].value as any).update.mock.calls[0][0]
    expect(updateCall.status).toBe('active')
  })

  it('is a no-op reactivating a member who was never deactivated (pending)', async () => {
    mockExisting('pending')
    const res = await POST(makeReq({ ibo: '12345', action: 'reactivate' }))
    const json = await res.json()
    expect(json).toEqual({ ok: true, updated: false })
  })

  it('is a no-op when no member exists for that IBO', async () => {
    mockExisting(null)
    const res = await POST(makeReq({ ibo: '12345' }))
    const json = await res.json()
    expect(json).toEqual({ ok: true, updated: false })
  })
})
