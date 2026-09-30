import { createHash } from 'crypto'

// Server-only — API keys are random 192-bit tokens (not user passwords), so a
// fast deterministic hash is fine; no need for bcrypt/scrypt salting here.
export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}
