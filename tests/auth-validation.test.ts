/** @jest-environment node */
// REQ-8.1, REQ-8.5 and the login redirect rule.
import {
  normalizeEmail,
  safeNextPath,
  validateEmail,
  validatePassword,
  validateUsername,
} from '../src/lib/auth/validation'

describe('validatePassword (REQ-8.5: at least 8 characters)', () => {
  test.each([
    ['empty', '', false],
    ['just below minimum (7)', 'a'.repeat(7), false],
    ['at minimum (8)', 'a'.repeat(8), true],
    ['long passphrase (64)', 'correct horse battery staple '.repeat(2) + 'extra', true],
    ['at ceiling (256)', 'a'.repeat(256), true],
    ['above ceiling (257)', 'a'.repeat(257), false],
  ])('%s', (_label, password, valid) => {
    expect(validatePassword(password) === null).toBe(valid)
  })

  test('error message says what to do (NFR-24)', () => {
    expect(validatePassword('short')).toMatch(/at least 8 characters/)
  })
})

describe('validateUsername', () => {
  test.each([
    ['ab', false],
    ['abc', true],
    ['home_cook.42', true],
    ['has space', false],
    ['a'.repeat(30), true],
    ['a'.repeat(31), false],
    ['  padded  ', true],
  ])('%p -> valid: %p', (name, valid) => {
    expect(validateUsername(name) === null).toBe(valid)
  })
})

describe('validateEmail', () => {
  test.each([
    ['cook@example.com', true],
    ['first.last+tag@uni.edu', true],
    ['no-at-sign.com', false],
    ['missing@tld', false],
    ['', false],
    ['spaces in@example.com', false],
  ])('%p -> valid: %p', (email, valid) => {
    expect(validateEmail(email) === null).toBe(valid)
  })

  test('normalizeEmail trims and lowercases', () => {
    expect(normalizeEmail('  Cook@Example.COM ')).toBe('cook@example.com')
  })
})

describe('safeNextPath (no redirects off the site)', () => {
  test.each([
    ['/library', '/library'],
    ['/recipe/123?tab=steps', '/recipe/123?tab=steps'],
    ['https://evil.example', '/'],
    ['//evil.example', '/'],
    ['/\\evil.example', '/'],
    ['', '/'],
    [null, '/'],
  ])('%p -> %p', (input, expected) => {
    expect(safeNextPath(input)).toBe(expected)
  })
})
