/** @jest-environment node */
// Reading the Library search from the address (REQ-10.2, 10.3).
import { libraryHref, likePattern, parseLibraryQuery } from '../src/lib/library'

test('an empty address is "everything, last changed first"', () => {
  expect(parseLibraryQuery({})).toEqual({ q: '', tag: '', sort: 'modified' })
})

test('the three sort orders are accepted, anything else is ignored (REQ-10.3)', () => {
  expect(parseLibraryQuery({ sort: 'title' }).sort).toBe('title')
  expect(parseLibraryQuery({ sort: 'added' }).sort).toBe('added')
  expect(parseLibraryQuery({ sort: 'modified' }).sort).toBe('modified')
  expect(parseLibraryQuery({ sort: 'rating' }).sort).toBe('modified')
})

test('search words and tag are trimmed, squeezed, and cut short', () => {
  expect(parseLibraryQuery({ q: '  apple   pie ', tag: ' Family ' })).toMatchObject({ q: 'apple pie', tag: 'Family' })
  expect(parseLibraryQuery({ q: 'x'.repeat(500) }).q).toHaveLength(200)
})

test('links leave out defaults', () => {
  expect(libraryHref(parseLibraryQuery({}))).toBe('/library')
  expect(libraryHref(parseLibraryQuery({ q: 'pie', sort: 'title' }))).toBe('/library?q=pie&sort=title')
  expect(libraryHref(parseLibraryQuery({ q: 'pie', tag: 'Family' }), { q: '' })).toBe('/library?tag=Family')
})

test('% and _ in search words are matched literally', () => {
  expect(likePattern('pie')).toBe('%pie%')
  expect(likePattern('100%')).toBe('%100\\%%')
  expect(likePattern('my_recipe')).toBe('%my\\_recipe%')
  expect(likePattern('back\\slash')).toBe('%back\\\\slash%')
})
