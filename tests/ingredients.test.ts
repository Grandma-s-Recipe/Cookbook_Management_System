/** @jest-environment node */
// Ingredient amounts and lines (REQ-3.9, REQ-4.13).
import { buildRawText, formatQuantity, ingredientText, parseQuantity, UNITS } from '../src/lib/recipes/ingredients'

test('amounts are shown as kitchen fractions where they fit', () => {
  expect(formatQuantity(2)).toBe('2')
  expect(formatQuantity(0.5)).toBe('1/2')
  expect(formatQuantity('0.3333')).toBe('1/3') // the database sends numbers as strings
  expect(formatQuantity(1.25)).toBe('1 1/4')
  expect(formatQuantity(2.75)).toBe('2 3/4')
  expect(formatQuantity(0.125)).toBe('1/8')
  expect(formatQuantity(1.4)).toBe('1.4')
  expect(formatQuantity(null)).toBe('')
  expect(formatQuantity('')).toBe('')
})

test('typed amounts are read as numbers', () => {
  expect(parseQuantity('2')).toBe(2)
  expect(parseQuantity(' 1.5 ')).toBe(1.5)
  expect(parseQuantity('.5')).toBe(0.5)
  expect(parseQuantity('1/2')).toBe(0.5)
  expect(parseQuantity('1 1/2')).toBe(1.5)
  expect(parseQuantity('1½')).toBe(1.5)
  expect(parseQuantity('¾')).toBe(0.75)
  expect(parseQuantity('')).toBeNull()
})

test('amounts that cannot be read are NaN, not a guess', () => {
  for (const bad of ['a few', '1/0', '-2', '2-3', '1..5', '1 / 2 / 3', '1e3']) {
    expect(parseQuantity(bad)).toBeNaN()
  }
})

test('reading back a shown amount gives the same amount', () => {
  for (const q of [0.25, 0.5, 0.75, 1, 1.5, 2.25, 3, 12]) {
    expect(parseQuantity(formatQuantity(q))).toBeCloseTo(q, 2)
  }
})

test('lines are written the same way as the seed script writes them', () => {
  expect(buildRawText({ quantity: 1, unit: 'lb', name: 'spaghetti' })).toBe('1 lb spaghetti')
  expect(buildRawText({ quantity: 5, unit: 'clove', name: 'garlic', note: 'minced' })).toBe('5 clove garlic, minced')
  expect(buildRawText({ quantity: 1.5, quantityMax: 2, unit: 'cup', name: 'flour' })).toBe('1 1/2-2 cup flour')
  expect(buildRawText({ quantity: null, unit: null, name: 'salt and pepper', note: 'to taste' })).toBe('salt and pepper, to taste')
  expect(buildRawText({ quantity: '0.5', unit: '', name: ' red onion ', note: '' })).toBe('1/2 red onion')
})

test('a line that was never split keeps its original text', () => {
  expect(ingredientText({ quantity: null, name: null, rawText: ' A handful of herbs ' })).toBe('A handful of herbs')
  expect(ingredientText({ quantity: 2, unit: 'tbsp', name: 'butter', rawText: '2 Tbsp. butter' })).toBe('2 tbsp butter')
})

test('the unit list has no repeats and includes the common ones (REQ-3.9)', () => {
  expect(new Set(UNITS).size).toBe(UNITS.length)
  expect(UNITS).toEqual(expect.arrayContaining(['tsp', 'tbsp', 'cup', 'oz', 'lb', 'g', 'kg', 'ml', 'l']))
})
