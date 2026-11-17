// Password hashing with Argon2id (NFR-14). Passwords are never stored or logged in plain text.
// Settings follow the OWASP Password Storage Cheat Sheet minimum for Argon2id.

import { hash, verify } from '@node-rs/argon2'

const OPTIONS = {
  algorithm: 2, // Argon2id
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS)
}

export async function verifyPassword(storedHash: string, password: string): Promise<boolean> {
  try {
    return await verify(storedHash, password)
  } catch {
    return false // malformed hash: treat as a failed login, never crash
  }
}

// Used when no account matches, so a failed login takes the same time either way
// and response times don't reveal which usernames exist.
let dummyHash: Promise<string> | undefined
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword('forkful-dummy-password')
  await verifyPassword(await dummyHash, password)
}
