/** @jest-environment node */
// Small helpers for the recipe page (REQ-1.5).
import { isUuid } from '../src/lib/db'
import { formatMinutes, totalMinutes } from '../src/lib/recipes/view'

test('times read naturally', () => {
  expect(formatMinutes(0)).toBe('0 min')
  expect(formatMinutes(45)).toBe('45 min')
  expect(formatMinutes(60)).toBe('1 hr')
  expect(formatMinutes(75)).toBe('1 hr 15 min')
  expect(formatMinutes(150)).toBe('2 hr 30 min')
})

test('no time, or a bad one, shows nothing', () => {
  expect(formatMinutes(null)).toBeNull()
  expect(formatMinutes(-5)).toBeNull()
  expect(formatMinutes(Number.NaN)).toBeNull()
})

test('total time adds prep and cook, and is empty when both are missing', () => {
  expect(totalMinutes({ prepMinutes: 10, cookMinutes: 25 })).toBe(35)
  expect(totalMinutes({ prepMinutes: 15, cookMinutes: null })).toBe(15)
  expect(totalMinutes({ prepMinutes: null, cookMinutes: null })).toBeNull()
})

test('only well-formed ids reach the database', () => {
  expect(isUuid('172e0e04-bd82-420d-bec1-026364169613')).toBe(true)
  expect(isUuid('172E0E04-BD82-420D-BEC1-026364169613')).toBe(true)
  expect(isUuid('banana-bread')).toBe(false)
  expect(isUuid("172e0e04-bd82-420d-bec1-026364169613' or 1=1")).toBe(false)
  expect(isUuid('')).toBe(false)
})
