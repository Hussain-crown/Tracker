import { describe, it, expect } from 'vitest'
import { secretMatches } from '@/lib/internalAuth'

describe('secretMatches', () => {
  it('matches identical secrets', () => {
    expect(secretMatches('the-shared-secret', 'the-shared-secret')).toBe(true)
  })

  it('rejects a wrong secret', () => {
    expect(secretMatches('wrong-secret', 'the-shared-secret')).toBe(false)
  })

  it('rejects secrets of different lengths without throwing', () => {
    // The bug this consolidation fixed: 7 duplicated copies compared raw
    // Buffer lengths and early-returned false on a mismatch -- one copy's
    // own comment claimed it "pads instead" to avoid a length-based timing
    // signal, but no copy actually did. Hashing both sides first means
    // there's no length branch at all to time.
    expect(secretMatches('short', 'a-much-longer-secret-value')).toBe(false)
    expect(secretMatches('', 'the-shared-secret')).toBe(false)
  })

  it('is case-sensitive', () => {
    expect(secretMatches('Secret', 'secret')).toBe(false)
  })
})
