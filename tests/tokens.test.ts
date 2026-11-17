/** @jest-environment node */
// Tokens for sessions and email links: random, and only an HMAC is stored.
import { generateToken, hashToken, sameHash } from '../src/lib/auth/tokens'

const ORIGINAL = process.env.SESSION_SECRET

beforeEach(() => {
  process.env.SESSION_SECRET = 'test-secret-that-is-at-least-32-characters-long'
})
afterAll(() => {
  process.env.SESSION_SECRET = ORIGINAL
})

test('tokens are long and never repeat', () => {
  const tokens = new Set(Array.from({ length: 1000 }, generateToken))
  expect(tokens.size).toBe(1000)
  for (const t of tokens) expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/)
})

test('the stored hash is not the token, and is the same every time', () => {
  const token = generateToken()
  const h = hashToken(token)
  expect(h).not.toContain(token)
  expect(h).toMatch(/^[0-9a-f]{64}$/)
  expect(hashToken(token)).toBe(h)
})

test('a different SESSION_SECRET gives a different hash', () => {
  const token = generateToken()
  const h1 = hashToken(token)
  process.env.SESSION_SECRET = 'another-secret-that-is-also-32-characters-long'
  expect(hashToken(token)).not.toBe(h1)
})

test('a missing or short SESSION_SECRET is refused', () => {
  delete process.env.SESSION_SECRET
  expect(() => hashToken('x')).toThrow(/SESSION_SECRET/)
  process.env.SESSION_SECRET = 'short'
  expect(() => hashToken('x')).toThrow(/SESSION_SECRET/)
})

test('sameHash compares safely', () => {
  expect(sameHash('abc', 'abc')).toBe(true)
  expect(sameHash('abc', 'abd')).toBe(false)
  expect(sameHash('abc', 'abcd')).toBe(false)
})
