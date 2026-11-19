/** @jest-environment node */
// Reading the catalog search from the address, and building links back to it (REQ-1.1, 1.3, 1.6).
import { catalogHref, hasFilters, isWebLink, parseCatalogQuery } from '../src/lib/catalog'

test('an empty address is "all recipes, best match, page 1"', () => {
  expect(parseCatalogQuery({})).toEqual({ q: '', cuisine: '', tags: [], sort: 'relevance', page: 1 })
})

test('search words and cuisine are trimmed and squeezed', () => {
  const query = parseCatalogQuery({ q: '  chicken   curry ', cuisine: ' Indian ' })
  expect(query.q).toBe('chicken curry')
  expect(query.cuisine).toBe('Indian')
})

test('very long input is cut short instead of failing', () => {
  expect(parseCatalogQuery({ q: 'a'.repeat(1000) }).q).toHaveLength(200)
})

test('tags: lower case, no repeats, no blanks, at most 10 (REQ-1.3)', () => {
  expect(parseCatalogQuery({ tag: 'Quick' }).tags).toEqual(['quick'])
  expect(parseCatalogQuery({ tag: ['Quick', 'quick', ' ', 'vegan'] }).tags).toEqual(['quick', 'vegan'])
  const many = Array.from({ length: 15 }, (_, i) => `tag${i}`)
  expect(parseCatalogQuery({ tag: many }).tags).toHaveLength(10)
})

test('only the three sort orders are accepted (REQ-1.6)', () => {
  expect(parseCatalogQuery({ sort: 'newest' }).sort).toBe('newest')
  expect(parseCatalogQuery({ sort: 'title' }).sort).toBe('title')
  expect(parseCatalogQuery({ sort: 'price' }).sort).toBe('relevance')
  expect(parseCatalogQuery({ sort: "title'; drop table x" }).sort).toBe('relevance')
})

test('page numbers are whole numbers from 1 to 1000', () => {
  expect(parseCatalogQuery({ page: '3' }).page).toBe(3)
  expect(parseCatalogQuery({ page: '0' }).page).toBe(1)
  expect(parseCatalogQuery({ page: '-4' }).page).toBe(1)
  expect(parseCatalogQuery({ page: 'abc' }).page).toBe(1)
  expect(parseCatalogQuery({ page: '99999' }).page).toBe(1000)
})

test('when a value is repeated in the address, the first one wins', () => {
  expect(parseCatalogQuery({ q: ['soup', 'stew'], cuisine: ['Thai', 'Greek'] })).toMatchObject({ q: 'soup', cuisine: 'Thai' })
})

test('links leave out default values', () => {
  expect(catalogHref(parseCatalogQuery({}))).toBe('/catalog')
  expect(catalogHref(parseCatalogQuery({ q: 'soup', sort: 'relevance', page: '1' }))).toBe('/catalog?q=soup')
})

test('a link reads back as the same search', () => {
  const query = parseCatalogQuery({ q: 'mac & cheese', cuisine: 'American', tag: ['comfort food', 'baking'], sort: 'newest', page: '2' })
  const href = catalogHref(query, { page: 2 })
  const params = new URLSearchParams(href.split('?')[1])
  expect(parseCatalogQuery({ q: params.get('q')!, cuisine: params.get('cuisine')!, tag: params.getAll('tag'), sort: params.get('sort')!, page: params.get('page')! })).toEqual(query)
})

test('changing a filter goes back to page 1; changing the page keeps the filters', () => {
  const query = parseCatalogQuery({ q: 'soup', tag: ['vegan', 'quick'], page: '3' })
  expect(catalogHref(query, { tags: ['vegan'] })).toBe('/catalog?q=soup&tag=vegan')
  expect(catalogHref(query, { page: 4 })).toBe('/catalog?q=soup&tag=vegan&tag=quick&page=4')
})

test('hasFilters is true only when something narrows the results', () => {
  expect(hasFilters(parseCatalogQuery({ sort: 'title', page: '2' }))).toBe(false)
  expect(hasFilters(parseCatalogQuery({ q: 'x' }))).toBe(true)
  expect(hasFilters(parseCatalogQuery({ cuisine: 'Thai' }))).toBe(true)
  expect(hasFilters(parseCatalogQuery({ tag: 'vegan' }))).toBe(true)
})

test('only real web addresses become source links (BR-8, decision 17)', () => {
  expect(isWebLink('https://example.com/recipe')).toBe(true)
  expect(isWebLink('forkful-team:banana-bread')).toBe(false)
  expect(isWebLink('javascript:alert(1)')).toBe(false)
})
