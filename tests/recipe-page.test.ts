/** @jest-environment node */
// What the recipe page can load (REQ-1.5, REQ-3.2, NFR-17).
//
// Catalog part: needs DATABASE_URL_TEST_CATALOG_READ (catalog_reader on the test branch).
// Own-recipe part: needs DATABASE_URL_TEST (forkful_app on the test branch).
// Each part is skipped when its variable isn't set. See README → Testing.

import { randomBytes, randomUUID } from 'node:crypto'
import { getCatalogRecipe, searchCatalog, parseCatalogQuery } from '../src/lib/catalog'
import { appDb, asUser } from '../src/lib/db'
import { getOwnRecipe } from '../src/lib/library'

const CATALOG_URL = process.env.DATABASE_URL_TEST_CATALOG_READ
const APP_URL = process.env.DATABASE_URL_TEST

function pointTestBranch(testUrl: string | undefined, realName: string) {
  if (!testUrl) return
  const real = process.env[realName]
  if (real && new URL(real).host === new URL(testUrl).host) {
    throw new Error(`The test connection string has the same host as ${realName}. Use the Neon test branch.`)
  }
  process.env[realName] = testUrl // read by catalogDb() / appDb() when they first connect
}
pointTestBranch(CATALOG_URL, 'DATABASE_URL_CATALOG_READ')
pointTestBranch(APP_URL, 'DATABASE_URL_APP')

;(CATALOG_URL ? describe : describe.skip)('catalog recipes (needs DATABASE_URL_TEST_CATALOG_READ)', () => {
  test('a catalog recipe loads with its source, ingredients, and steps in order (REQ-1.5, BR-8)', async () => {
    const [first] = (await searchCatalog(parseCatalogQuery({}))).results
    expect(first).toBeDefined()
    const recipe = await getCatalogRecipe(first.catalogId)
    expect(recipe).not.toBeNull()
    expect(recipe!.kind).toBe('catalog')
    expect(recipe!.title).toBe(first.title)
    expect(recipe!.source).toEqual({ site: first.sourceSite, url: first.sourceUrl })
    expect(recipe!.ingredients.length).toBeGreaterThan(0)
    expect(recipe!.steps.length).toBeGreaterThan(0)
    const positions = recipe!.ingredients.map((i) => i.position)
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
    for (const i of recipe!.ingredients) expect(i.rawText.trim()).not.toBe('')
  })

  test('an unknown or malformed id is "not found", not an error', async () => {
    await expect(getCatalogRecipe(randomUUID())).resolves.toBeNull()
    await expect(getCatalogRecipe('not-a-real-id')).resolves.toBeNull()
    await expect(getCatalogRecipe("1' or '1'='1")).resolves.toBeNull()
  })
})

;(APP_URL ? describe : describe.skip)("the user's own recipes (needs DATABASE_URL_TEST)", () => {
  // A different prefix from recipe-rls.test.ts, which runs at the same time and
  // deletes its own rlstest_ users.
  const PREFIX = 'pagetest_'
  let owner: string
  let other: string
  const recipeId = randomUUID()

  async function makeUser(label: string): Promise<string> {
    const suffix = randomBytes(4).toString('hex')
    const [row] = await appDb()`
      insert into app.users (username, email, password_hash, is_verified, age_confirmed_at)
      values (${PREFIX + label + '_' + suffix}, ${`${PREFIX}${label}-${suffix}@example.test`}, 'not-a-real-hash', true, now())
      returning user_id`
    return row.user_id
  }

  beforeAll(async () => {
    await appDb()`delete from app.users where left(username, ${PREFIX.length}) = ${PREFIX}`
    owner = await makeUser('owner')
    other = await makeUser('other')
    const tagId = randomUUID()
    await asUser(owner, (sql) => [
      sql`insert into app.recipe (recipe_id, owner_id, kind, title, notes)
          values (${recipeId}, ${owner}, 'private', 'Grandma''s Stew', 'Use the big pot.')`,
      sql`insert into app.recipe_ingredient (recipe_id, owner_id, position, quantity, unit, name, raw_text)
          values (${recipeId}, ${owner}, 2, 1, 'cup', 'peas', '1 cup peas'),
                 (${recipeId}, ${owner}, 1, 2, 'lb', 'beef', '2 lb beef')`,
      sql`insert into app.recipe_step (recipe_id, owner_id, position, text)
          values (${recipeId}, ${owner}, 1, 'Brown the beef.'), (${recipeId}, ${owner}, 2, 'Add the peas.')`,
      sql`insert into app.tag (tag_id, owner_id, name) values (${tagId}, ${owner}, 'Family')`,
      sql`insert into app.recipe_tag (recipe_id, tag_id, owner_id) values (${recipeId}, ${tagId}, ${owner})`,
    ])
  })

  afterAll(async () => {
    await appDb()`delete from app.users where left(username, ${PREFIX.length}) = ${PREFIX}`
  })

  test('the owner sees their private recipe in full, in order', async () => {
    const recipe = await getOwnRecipe(owner, recipeId)
    expect(recipe).toMatchObject({
      kind: 'private',
      title: "Grandma's Stew",
      notes: 'Use the big pot.',
      source: null,
      tags: ['Family'],
      steps: ['Brown the beef.', 'Add the peas.'],
      modified: false,
    })
    expect(recipe!.ingredients.map((i) => i.rawText)).toEqual(['2 lb beef', '1 cup peas'])
  })

  test("another user gets 'not found' for it (REQ-3.2, NFR-17)", async () => {
    await expect(getOwnRecipe(other, recipeId)).resolves.toBeNull()
  })

  test('a malformed id is "not found", not an error', async () => {
    await expect(getOwnRecipe(owner, 'nope')).resolves.toBeNull()
  })

  ;(CATALOG_URL ? test : test.skip)('a private recipe is never found as a catalog recipe (NFR-17)', async () => {
    await expect(getCatalogRecipe(recipeId)).resolves.toBeNull()
  })
})
