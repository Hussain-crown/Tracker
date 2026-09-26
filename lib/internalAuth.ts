import { createHash, timingSafeEqual } from 'crypto'

// Was copy-pasted into 7 separate route files, each re-implementing the same
// shared-secret comparison. One of the 7 (deactivate/route.ts) carried a
// comment claiming the code "pads instead of early-returning on a length
// mismatch" -- but the code sat right below it still did exactly that early
// return, in all 7 copies. The described fix was never actually made
// anywhere, and with 7 independent copies it's exactly the kind of thing
// that would drift further apart the next time only one of them got touched.
//
// Hashing both sides first guarantees equal-length inputs to
// timingSafeEqual, so there's no length-based branch (and thus no
// length-dependent timing signal) at all -- this is what the original
// comment described wanting, done for real.
export function secretMatches(provided: string, expected: string): boolean {
  const a = createHash('sha256').update(provided).digest()
  const b = createHash('sha256').update(expected).digest()
  return timingSafeEqual(a, b)
}
