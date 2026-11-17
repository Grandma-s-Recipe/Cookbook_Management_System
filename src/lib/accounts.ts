// Account logic: sign up, email verification, login checks, password reset, cleanup.
// (SRS §4.8 Account Creation, §4.9 Login and Authentication)
//
// No Next.js APIs in here (no cookies, no redirects); the server actions in
// src/app/(auth)/actions.ts call these functions and handle the web side.

import { appDb } from '@/lib/db'
import { linkEmail, sendEmail } from '@/lib/email'
import { burnPasswordCheck, hashPassword, verifyPassword } from '@/lib/auth/password'
import { generateToken, hashToken } from '@/lib/auth/tokens'
import { normalizeEmail, validateEmail, validatePassword, validateUsername } from '@/lib/auth/validation'

const VERIFY_HOURS = 24 // REQ-8.6
const RESET_HOURS = 1 // REQ-9.5
const UNVERIFIED_DAYS = 7 // REQ-8.8

export type FieldErrors = Partial<Record<'username' | 'email' | 'password' | 'confirm' | 'age', string>>

/** The site's public address, used in email links. */
export function appUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '')
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  return 'http://localhost:3000'
}

// ---------------------------------------------------------------------------
// Sign up (REQ-8.1 to 8.5)
// ---------------------------------------------------------------------------

export async function registerAccount(input: {
  username: string
  email: string
  password: string
  confirm: string
  ageConfirmed: boolean
}): Promise<{ ok: true; email: string; emailSent: boolean } | { ok: false; errors: FieldErrors }> {
  const username = input.username.trim()
  const email = input.email.trim()

  const errors: FieldErrors = {}
  const u = validateUsername(username)
  if (u) errors.username = u
  const e = validateEmail(email)
  if (e) errors.email = e
  const p = validatePassword(input.password)
  if (p) errors.password = p
  else if (input.password !== input.confirm) {
    errors.confirm = 'The passwords don’t match. Both password fields must be the same. Type them again.'
  }
  if (!input.ageConfirmed) {
    errors.age = 'You need to confirm you are 13 or older. Forkful is only for users 13 and up (COPPA). Tick the box to continue.'
  }
  if (Object.keys(errors).length) return { ok: false, errors }

  // REQ-8.2: say which one is taken.
  const taken = await appDb()`
    select lower(username) = lower(${username}) as username_taken,
           lower(email) = ${normalizeEmail(email)} as email_taken
    from app.users
    where lower(username) = lower(${username}) or lower(email) = ${normalizeEmail(email)}`
  if (taken.some((r) => r.username_taken)) {
    errors.username = 'That username is already taken. Each username can belong to only one account. Choose a different one.'
  }
  if (taken.some((r) => r.email_taken)) {
    errors.email = 'An account with that email already exists. Each email can have only one account (BR-5). Log in, or reset your password.'
  }
  if (Object.keys(errors).length) return { ok: false, errors }

  const passwordHash = await hashPassword(input.password)

  let userId: string
  try {
    const [row] = await appDb()`
      insert into app.users (username, email, password_hash, age_confirmed_at)
      values (${username}, ${email}, ${passwordHash}, now())
      returning user_id`
    userId = row.user_id
  } catch (err) {
    // Someone else signed up with the same name in the same instant.
    if (isUniqueViolation(err)) {
      return { ok: false, errors: { username: 'That username or email was just taken. Try a different one.' } }
    }
    throw err
  }

  const emailSent = await sendTokenEmail(userId, email, 'verify')
  return { ok: true, email, emailSent }
}

// ---------------------------------------------------------------------------
// Email links (verify: REQ-8.4, 8.6 / reset: REQ-9.5)
// ---------------------------------------------------------------------------

/** Creates a fresh single-use link, cancels older ones of the same kind, and emails it. */
async function sendTokenEmail(userId: string, email: string, purpose: 'verify' | 'reset'): Promise<boolean> {
  const token = generateToken()
  const hours = purpose === 'verify' ? VERIFY_HOURS : RESET_HOURS

  await appDb().transaction([
    appDb()`update app.auth_token set used_at = now()
            where user_id = ${userId} and purpose = ${purpose} and used_at is null`,
    appDb()`insert into app.auth_token (user_id, purpose, token_hash, expires_at)
            values (${userId}, ${purpose}, ${hashToken(token)}, now() + make_interval(hours => ${hours}))`,
  ])

  const message =
    purpose === 'verify'
      ? linkEmail({
          to: email,
          subject: 'Verify your Forkful email',
          intro: 'Welcome to Forkful! Confirm your email address to finish creating your account.',
          buttonText: 'Verify my email',
          url: `${appUrl()}/verify?token=${token}`,
          outro: `This link works once and expires in ${VERIFY_HOURS} hours. If you didn’t sign up, you can ignore this email.`,
        })
      : linkEmail({
          to: email,
          subject: 'Reset your Forkful password',
          intro: 'Someone asked to reset the password for your Forkful account.',
          buttonText: 'Choose a new password',
          url: `${appUrl()}/reset-password?token=${token}`,
          outro: `This link works once and expires in ${RESET_HOURS} hour. If you didn’t ask for this, ignore this email and your password stays the same.`,
        })

  try {
    await sendEmail(message)
    return true
  } catch (err) {
    console.error(`Could not send ${purpose} email:`, err instanceof Error ? err.message : err)
    return false
  }
}

/** REQ-8.4, REQ-8.6: uses the link once, if it hasn't expired, and marks the account verified. */
export async function verifyEmailToken(token: string): Promise<boolean> {
  if (!token) return false
  const rows = await appDb()`
    with t as (
      update app.auth_token set used_at = now()
      where token_hash = ${hashToken(token)} and purpose = 'verify'
        and used_at is null and expires_at > now()
      returning user_id
    )
    update app.users u set is_verified = true
    from t where u.user_id = t.user_id
    returning u.user_id`
  return rows.length > 0
}

/**
 * REQ-8.6: send a new verification link. Always "succeeds" from the caller's point of
 * view, so the response doesn't reveal which emails have accounts.
 */
export async function resendVerification(email: string): Promise<void> {
  const [user] = await appDb()`
    select user_id, email from app.users
    where lower(email) = ${normalizeEmail(email)} and not is_verified`
  if (user) await sendTokenEmail(user.user_id, user.email, 'verify')
}

// ---------------------------------------------------------------------------
// Login (REQ-9.1, 9.2, 8.7, 6.2)
// ---------------------------------------------------------------------------

export type LoginResult =
  | { ok: true; userId: string }
  | { ok: false; reason: 'invalid' | 'unverified' | 'disabled'; email?: string }

export async function checkLogin(identifier: string, password: string): Promise<LoginResult> {
  const id = identifier.trim()
  const [user] = id
    ? await appDb()`
        select user_id, email, password_hash, is_verified, is_disabled from app.users
        where lower(username) = lower(${id}) or lower(email) = lower(${id})
        limit 1`
    : []

  if (!user) {
    await burnPasswordCheck(password)
    return { ok: false, reason: 'invalid' }
  }
  if (!(await verifyPassword(user.password_hash, password))) return { ok: false, reason: 'invalid' }

  // Only after the right password do we say anything more specific.
  if (!user.is_verified) return { ok: false, reason: 'unverified', email: user.email }
  if (user.is_disabled) return { ok: false, reason: 'disabled' }
  return { ok: true, userId: user.user_id }
}

// ---------------------------------------------------------------------------
// Password reset (REQ-9.5)
// ---------------------------------------------------------------------------

/** Always "succeeds", so the response doesn't reveal which emails have accounts. */
export async function requestPasswordReset(email: string): Promise<void> {
  if (validateEmail(email)) return
  const [user] = await appDb()`
    select user_id, email from app.users where lower(email) = ${normalizeEmail(email)}`
  if (user) await sendTokenEmail(user.user_id, user.email, 'reset')
}

/**
 * Uses the reset link once, sets the new password, and ends every session for
 * that account, all in one statement so it can't half-happen.
 */
export async function resetPassword(
  token: string,
  password: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const problem = validatePassword(password)
  if (problem) return { ok: false, error: problem }

  const newHash = await hashPassword(password)
  const rows = await appDb()`
    with t as (
      update app.auth_token set used_at = now()
      where token_hash = ${hashToken(token)} and purpose = 'reset'
        and used_at is null and expires_at > now()
      returning user_id
    ),
    u as (
      update app.users set password_hash = ${newHash}
      where user_id in (select user_id from t)
      returning user_id
    ),
    s as (
      delete from app.session where user_id in (select user_id from u)
    )
    select user_id from u`

  if (!rows.length) {
    return {
      ok: false,
      error: 'This reset link doesn’t work. It may have expired (links last 1 hour) or already been used. Request a new link.',
    }
  }
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Daily cleanup (REQ-8.8), called by the cron route
// ---------------------------------------------------------------------------

export async function cleanupExpired(): Promise<{ users: number; sessions: number; tokens: number }> {
  const [users, sessions, tokens] = await appDb().transaction([
    appDb()`delete from app.users
            where not is_verified and created_at < now() - make_interval(days => ${UNVERIFIED_DAYS})
            returning 1`,
    appDb()`delete from app.session
            where expires_at < now() or last_seen_at < now() - interval '30 minutes'
            returning 1`,
    appDb()`delete from app.auth_token
            where (used_at is not null or expires_at < now()) and created_at < now() - interval '1 day'
            returning 1`,
  ])
  return { users: users.length, sessions: sessions.length, tokens: tokens.length }
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505'
}
