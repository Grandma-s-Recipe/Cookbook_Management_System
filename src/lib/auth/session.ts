// Login sessions (REQ-9.1, 9.3, 9.4, NFR-15).
//
// The browser holds a random token in an httpOnly cookie. The database holds only
// its HMAC (see tokens.ts). A session ends after 30 minutes without activity,
// and in any case 12 hours after login.

import { cache } from 'react'
import { cookies } from 'next/headers'
import { appDb } from '@/lib/db'
import { generateToken, hashToken } from '@/lib/auth/tokens'

export const IDLE_MINUTES = 30 // NFR-15
const MAX_HOURS = 12
const COOKIE = 'forkful_session'

export type CurrentUser = {
  userId: string
  username: string
  email: string
  role: 'home_cook' | 'admin'
}

/** Call only from a server action or route handler (those can set cookies). */
export async function startSession(userId: string): Promise<void> {
  const token = generateToken()
  await appDb()`
    insert into app.session (user_id, token_hash, expires_at)
    values (${userId}, ${hashToken(token)}, now() + make_interval(hours => ${MAX_HOURS}))`

  const jar = await cookies()
  jar.set(COOKIE, token, {
    httpOnly: true, // not readable from JavaScript
    secure: process.env.NODE_ENV === 'production', // HTTPS only on the live site
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_HOURS * 60 * 60,
  })
}

/**
 * The logged-in user, or null. Each call also counts as activity, which keeps the
 * 30-minute idle timer going. A session idle longer than that no longer matches.
 * Wrapped in cache() so it runs once per request even if several components ask.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(COOKIE)?.value
  if (!token) return null

  const [row] = await appDb()`
    with s as (
      update app.session set last_seen_at = now()
      where token_hash = ${hashToken(token)}
        and last_seen_at > now() - make_interval(mins => ${IDLE_MINUTES})
        and expires_at > now()
      returning user_id
    )
    select u.user_id, u.username, u.email, u.role
    from s join app.users u using (user_id)
    where not u.is_disabled`

  return row ? { userId: row.user_id, username: row.username, email: row.email, role: row.role } : null
})

/** Log out (REQ-9.3). Call only from a server action or route handler. */
export async function endSession(): Promise<void> {
  const jar = await cookies()
  const token = jar.get(COOKIE)?.value
  if (token) await appDb()`delete from app.session where token_hash = ${hashToken(token)}`
  jar.delete(COOKIE)
}
