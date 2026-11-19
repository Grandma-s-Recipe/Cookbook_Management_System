/** @jest-environment node */
// Catalog search against a real database (REQ-1.1–1.3, 1.6, 1.7; typo matching).
//
// Uses the Neon "test" branch, connected as catalog_reader, the same role the
// site uses. Skipped when DATABASE_URL_TEST_CATALOG_READ isn't set (put it in
// .env.test.local; see README → Testing). Reads only, and needs the seed
// recipes on the test branch (npm run db:seed was run on main before branching).

import { PAGE_SIZE, parseCatalogQuery, searchCatalog, type CatalogQuery } from '../src/lib/catalog'
import { catalogDb } from '../src/lib/db'

const TEST_URL = process.env.DATABASE_URL_TEST_CATALOG_READ
const MAIN_URL = process.env.DATABASE_URL_CATALOG_READ

if (TEST_URL) {
  // Never run these against the real database.
  if (MAIN_URL && new URL(MAIN_URL).host === new URL(TEST_URL).host) {
    throw new Error('DATABASE_URL_TEST_CATALOG_READ points at the same host as DATABASE_URL_CATALOG_READ. Use the Neon test branch.')
  }
  // catalogDb() reads DATABASE_URL_CATALOG_READ the first time it connects.
  process.env.DATABASE_URL_CATALOG_READ = TEST_URL
}

const describeDb = TEST_URL ? describe : describe.skip

function search(params: Record<string, string | string[]>) {
  return searchCatalog(parseCatalogQuery(params))
}

describeDb('catalog search (needs DATABASE_URL_TEST_CATALOG_READ)', () => {
  let all: Awaited<ReturnType<typeof searchCatalog>>

  beforeAll(async () => {
    all = await search({})
    if (all.total === 0) throw new Error('The test branch catalog is empty. Run npm run db:seed on main, then re-create the test branch.')
  })

  test('runs as catalog_reader, the read-only role', async () => {
    const [me] = await catalogDb()`select current_user as name`
    expect(me.name).toBe('catalog_reader')
  })

  test('pages hold at most 20 recipes, and the count is right (REQ-1.1)', async () => {
    expect(all.results.length).toBe(Math.min(all.total, PAGE_SIZE))
    expect(all.pageCount).toBe(Math.ceil(all.total / PAGE_SIZE))
    if (all.total > PAGE_SIZE) {
      const page2 = await search({ page: '2' })
      const firstIds = new Set(all.results.map((r) => r.catalogId))
      expect(page2.results.some((r) => firstIds.has(r.catalogId))).toBe(false)
    }
  })

  test('every result has a title and a source site (REQ-1.4)', () => {
    for (const r of all.results) {
      expect(r.title.trim()).not.toBe('')
      expect(r.sourceSite.trim()).not.toBe('')
    }
  })

  test('filtering by cuisine returns only that cuisine, and all of it (REQ-1.3)', async () => {
    const option = all.cuisines[0]
    expect(option).toBeDefined()
    const filtered = await search({ cuisine: option.value })
    expect(filtered.total).toBe(option.count)
    for (const r of filtered.results) expect(r.cuisine).toBe(option.value)
  })

  test('filtering by a tag returns only recipes with that tag, and all of them (REQ-1.3)', async () => {
    const option = [...all.tags].sort((a, b) => b.count - a.count)[0]
    expect(option).toBeDefined()
    const filtered = await search({ tag: option.value })
    expect(filtered.total).toBe(option.count)
    for (const r of filtered.results) expect(r.tags).toContain(option.value)
  })

  test('two tags means recipes with both; tag and cuisine combine too (REQ-1.3)', async () => {
    const [a, b] = [...all.tags].sort((x, y) => y.count - x.count)
    const both = await search({ tag: [a.value, b.value] })
    for (const r of both.results) expect(r.tags).toEqual(expect.arrayContaining([a.value, b.value]))
    expect(both.total).toBeLessThanOrEqual(Math.min(a.count, b.count))

    const cuisine = all.cuisines[0].value
    const mixed = await search({ tag: a.value, cuisine })
    for (const r of mixed.results) {
      expect(r.cuisine).toBe(cuisine)
      expect(r.tags).toContain(a.value)
    }
  })

  test('title order is A to Z (REQ-1.6)', async () => {
    const sorted = await search({ sort: 'title' })
    const firstLetters = sorted.results.map((r) => r.title[0].toLowerCase())
    expect(firstLetters).toEqual([...firstLetters].sort())
  })

  test('the recipe whose title you type comes first (REQ-1.2)', async () => {
    const target = all.results[all.results.length - 1]
    const found = await search({ q: target.title })
    expect(found.results[0].catalogId).toBe(target.catalogId)
  })

  test('a typo in the title still finds the recipe', async () => {
    const target = all.results[0]
    const words = target.title.split(' ')
    const longest = words.reduce((x, y) => (y.length > x.length ? y : x))
    expect(longest.length).toBeGreaterThanOrEqual(4)
    const typo = longest.slice(0, 2) + longest.slice(3) // drop the third letter
    const query = target.title.replace(longest, typo)
    const found = await search({ q: query })
    expect(found.results.map((r) => r.catalogId)).toContain(target.catalogId)
  })

  test('nonsense words find nothing, without an error (REQ-1.7)', async () => {
    const none = await search({ q: 'zzqxv wkjhgf' })
    expect(none.total).toBe(0)
    expect(none.results).toEqual([])
  })

  test('words that are all ignored ("the and of") do not cause an error', async () => {
    await expect(search({ q: 'the and of' })).resolves.toBeDefined()
  })

  test('a page past the end is empty, not an error', async () => {
    const query: CatalogQuery = { ...parseCatalogQuery({}), page: 1000 }
    const past = await searchCatalog(query)
    expect(past.results).toEqual([])
  })

  test('answers well within the 4-second limit (NFR-1)', async () => {
    const start = Date.now()
    await search({ q: 'chicken soup', sort: 'relevance' })
    expect(Date.now() - start).toBeLessThan(4000)
  })
})
