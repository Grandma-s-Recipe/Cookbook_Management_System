// Input rules for accounts (REQ-8.1 to 8.5). Pure functions: no database, easy to test.
// Error messages follow NFR-24: problem, cause, suggested action.

export const PASSWORD_MIN = 8 // REQ-8.5
// Not a requirement: a ceiling so nobody can make the server hash a huge string.
export const PASSWORD_MAX = 256

const USERNAME = /^[A-Za-z0-9_.-]{3,30}$/
// Deliberately simple: something@something.something. The verification email is the real check.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateUsername(value: string): string | null {
  const v = value.trim()
  if (!v) return 'Enter a username.'
  if (!USERNAME.test(v)) {
    return 'That username isn’t allowed. Usernames are 3–30 characters: letters, numbers, dots, dashes, or underscores. Try another.'
  }
  return null
}

export function validateEmail(value: string): string | null {
  const v = value.trim()
  if (!v) return 'Enter your email address.'
  if (v.length > 254 || !EMAIL.test(v)) {
    return 'That email address doesn’t look right. It should look like name@example.com. Check it and try again.'
  }
  return null
}

export function validatePassword(value: string): string | null {
  if (value.length < PASSWORD_MIN) {
    return `That password is too short. Passwords need at least ${PASSWORD_MIN} characters. Choose a longer one.`
  }
  if (value.length > PASSWORD_MAX) {
    return `That password is too long. Passwords can be up to ${PASSWORD_MAX} characters. Choose a shorter one.`
  }
  return null
}

/** Emails are stored as typed but compared lowercase (the database enforces this too). */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

/**
 * Where to send the user after logging in. Only same-site paths are allowed,
 * so a link like /login?next=https://evil.example can't redirect off the site.
 */
export function safeNextPath(value: unknown): string {
  if (typeof value !== 'string') return '/'
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/'
  return value
}
