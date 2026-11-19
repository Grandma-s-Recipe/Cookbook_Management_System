/** @jest-environment node */
// Recipe content hashes: "Modified" and "Original updated" (REQ-2.3, REQ-2.6).
import { isModified, originalStatus, recipeContentHash, type RecipeContent } from '../src/lib/recipes/hash'

const soup: RecipeContent = {
  title: 'Tomato Soup',
  description: 'Quick and warm.',
  cuisine: 'American',
  servings: 4,
  prepMinutes: 10,
  cookMinutes: 25,
  ingredients: [
    { quantity: 2, unit: 'tbsp', name: 'olive oil', rawText: '2 tbsp olive oil' },
    { quantity: 1.5, quantityMax: 2, unit: 'lb', name: 'tomatoes', note: 'chopped', rawText: '1.5–2 lb tomatoes, chopped' },
  ],
  steps: ['Warm the oil.', 'Add the tomatoes and simmer.'],
}

test('the same recipe always gives the same hash', () => {
  expect(recipeContentHash(soup)).toBe(recipeContentHash(structuredClone(soup)))
  expect(recipeContentHash(soup)).toMatch(/^v1:[0-9a-f]{64}$/)
})

test('numbers from the database (strings) hash the same as numbers from a form', () => {
  const fromDb: RecipeContent = {
    ...soup,
    servings: '4',
    ingredients: [
      { ...soup.ingredients[0], quantity: '2.000' },
      { ...soup.ingredients[1], quantity: '1.50', quantityMax: '2' },
    ],
  }
  expect(recipeContentHash(fromDb)).toBe(recipeContentHash(soup))
})

test('extra spaces and empty strings do not count as changes', () => {
  const messy: RecipeContent = { ...soup, title: '  Tomato Soup ', description: 'Quick and warm. ', steps: [' Warm the oil.', 'Add the tomatoes and simmer.'] }
  expect(recipeContentHash(messy)).toBe(recipeContentHash(soup))
  expect(recipeContentHash({ ...soup, cuisine: '' })).toBe(recipeContentHash({ ...soup, cuisine: null }))
})

test('any real change gives a different hash', () => {
  const base = recipeContentHash(soup)
  expect(recipeContentHash({ ...soup, title: 'Tomato Bisque' })).not.toBe(base)
  expect(recipeContentHash({ ...soup, servings: 6 })).not.toBe(base)
  expect(recipeContentHash({ ...soup, steps: [...soup.steps, 'Serve.'] })).not.toBe(base)
  expect(recipeContentHash({ ...soup, steps: [...soup.steps].reverse() })).not.toBe(base) // order matters
  expect(
    recipeContentHash({ ...soup, ingredients: [soup.ingredients[0], { ...soup.ingredients[1], unit: 'kg' }] }),
  ).not.toBe(base)
})

test('a value cannot move between fields without changing the hash', () => {
  expect(recipeContentHash({ ...soup, description: null, cuisine: 'Quick and warm.' })).not.toBe(
    recipeContentHash({ ...soup, description: 'Quick and warm.', cuisine: null }),
  )
})

test('Modified compares the copy with what was copied', () => {
  const h = recipeContentHash(soup)
  expect(isModified({ sourceHash: h, contentHash: h })).toBe(false)
  expect(isModified({ sourceHash: h, contentHash: recipeContentHash({ ...soup, title: 'Mine' }) })).toBe(true)
})

test('Original updated / no longer available (REQ-2.6)', () => {
  const copy = { sourceHash: recipeContentHash(soup) }
  expect(originalStatus(copy, { ...soup, status: 'active' })).toBe('same')
  expect(originalStatus(copy, { ...soup, cookMinutes: 30, status: 'active' })).toBe('updated')
  expect(originalStatus(copy, { ...soup, status: 'removed' })).toBe('unavailable')
  expect(originalStatus(copy, null)).toBe('unavailable')
})
