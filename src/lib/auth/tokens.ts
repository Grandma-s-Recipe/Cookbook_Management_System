// Random tokens for session cookies and email links.
//
// The raw token only ever lives in the cookie or the emailed link. The database
// stores an HMAC of it, keyed with SESSION_SECRET, so a copy of the database alone
// can't be used to log in or to reset a password (§6.2: "only a hash is stored").

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export function generateToken(): string {
  return randomBytes(32).toString('base64url') // 256 bits
}

export function hashToken(token: string): string {
  const secret = process.env.SESSION_SECRET
  if (!secret || secret.length < 32) {
    throw new Error(
      'SESSION_SECRET is missing or too short. Add a long random value to .env.local and to Vercel’s Environment Variables.',
    )
  }
  return createHmac('sha256', secret).update(token).digest('hex')
}

/** Constant-time comparison, for when two hashes are compared in code. */
export function sameHash(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}
