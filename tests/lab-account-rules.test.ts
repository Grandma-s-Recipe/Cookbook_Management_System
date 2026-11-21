/** @jest-environment node */
// CS445 Testing Lab §3: unit tests for the account rules (sign up).
// Module under test: src/lib/auth/validation.ts and registerAccount() in src/lib/accounts.ts
// Requirements: REQ-8.5 (passwords at least 8 characters), REQ-8.3 (confirm age 13+).
// These tests never reach the database: invalid input is rejected before any query.

import { registerAccount } from '../src/lib/accounts'
import { PASSWORD_MAX, PASSWORD_MIN, validatePassword } from '../src/lib/auth/validation'

describe('validatePassword: password length boundaries (REQ-8.5, §2 Part A)', () => {
  // Boundary table from §2 Part A: just below and at the minimum, at and just above the maximum.
  test.each([
    { tc: 'TC-07', label: 'just below minimum', length: PASSWORD_MIN - 1, accepted: false },
    { tc: 'TC-08', label: 'at minimum', length: PASSWORD_MIN, accepted: true },
    { tc: 'Part A', label: 'at maximum', length: PASSWORD_MAX, accepted: true },
    { tc: 'Part A', label: 'just above maximum', length: PASSWORD_MAX + 1, accepted: false },
  ])('$tc: a password $label ($length characters) is accepted: $accepted', ({ length, accepted }) => {
    // Arrange
    const password = 'a'.repeat(length)

    // Act
    const error = validatePassword(password)

    // Assert
    if (accepted) {
      expect(error).toBeNull()
    } else {
      expect(error).toEqual(expect.stringContaining('Passwords'))
    }
  })

  test('TC-07: a too-short password gets a message that says the rule and what to do (NFR-24)', () => {
    // Arrange
    const password = 'abc1234' // 7 characters

    // Act
    const error = validatePassword(password)

    // Assert
    expect(error).toBe('That password is too short. Passwords need at least 8 characters. Choose a longer one.')
  })
})

describe('registerAccount: age confirmation (REQ-8.3)', () => {
  test('TC-09: sign-up without ticking "I am 13 or older" is refused, and no account is made', async () => {
    // Arrange: everything else on the form is valid
    const input = {
      username: 'labtester',
      email: 'labtester@example.com',
      password: 'longenough1',
      confirm: 'longenough1',
      ageConfirmed: false,
    }

    // Act
    const result = await registerAccount(input)

    // Assert: only the age box is reported, so it's the age rule that stopped it
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(Object.keys(result.errors)).toEqual(['age'])
      expect(result.errors.age).toContain('13 or older')
    }
  })

  test('sign-up with mismatched passwords is refused with a "don\'t match" message (negative)', async () => {
    // Arrange
    const input = {
      username: 'labtester',
      email: 'labtester@example.com',
      password: 'longenough1',
      confirm: 'longenough2',
      ageConfirmed: true,
    }

    // Act
    const result = await registerAccount(input)

    // Assert
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.confirm).toContain('don’t match')
  })
})
