/** @jest-environment node */
// The Library, new private recipes, and delete
// (REQ-3.1–3.3, 3.6, REQ-5.1–5.5, REQ-10.1–10.6, NFR-5, BR-9).
//
// Uses the Neon "test" branch as forkful_app; skipped when DATABASE_URL_TEST
// isn't set (see README → Testing). Creates users named libtest_… and deletes
// them at the end.

import { randomBytes, randomUUID } from 'node:crypto'
import { appDb, asUser, isLibraryFull } from '../src/lib/db'
import {
  createPrivateRecipe,
  deleteRecipes,
  getLibrary,
  getLibraryUsage,
  getOwnRecipe,
  getRecipesByIds,
  parseLibraryQuery,
  saveCopy,
  updateOwnRecipe,
} from '../src/lib/library'
import type { RecipeInput } from '../src/lib/recipes/form'
import type { RecipeView } from '../src/lib/recipes/view'

const TEST_URL = process.env.DATABASE_URL_TEST
if (TEST_URL) {
  const real = process.env.DATABASE_URL_APP
  if (real && new URL(real).host === new URL(TEST_URL).host) {
    throw new Error('DATABASE_URL_TEST has the same host as DATABASE_URL_APP. Use the Neon test branch.')
  }
  process.env.DATABASE_URL_APP = TEST_URL // read by appDb() when it first connects
}

const PREFIX = 'libtest_'

async function makeUser(label: string): Promise<string> {
  const suffix = randomBytes(4).toString('hex')
  const [row] = await appDb()`
    insert into app.users (username, email, password_hash, is_verified, age_confirmed_at)
    values (${PREFIX + label + '_' + suffix}, ${`${PREFIX}${label}-${suffix}@example.test`}, 'not-a-real-hash', true, now())
    returning user_id`
  return row.user_id
}

function privateRecipe(over: Partial<RecipeInput> = {}): RecipeInput {
  return {
    title: "Grandma's Apple Pie",
    description: 'The one from the blue card.',
    cuisine: 'American',
    servings: 8,
    prepMinutes: 30,
    cookMinutes: 50,
    notes: 'Use Honeycrisp.',
    tags: ['Dessert', 'family'],
    ingredients: [
      { quantity: 6, quantityMax: null, unit: null, name: 'apples', note: 'sliced' },
      { quantity: 0.75, quantityMax: null, unit: 'cup', name: 'sugar', note: null },
      { quantity: null, quantityMax: null, unit: null, name: 'cinnamon', note: 'a good shake' },
    ],
    steps: ['Make the crust.', 'Fill and bake.'],
    ...over,
  }
}

function catalogRecipe(title: string): RecipeView {
  return {
    id: randomUUID(),
    kind: 'catalog',
    title,
    description: null,
    cuisine: 'Italian',
    servings: 4,
    prepMinutes: 5,
    cookMinutes: 15,
    tags: ['pasta', 'quick'],
    notes: null,
    source: { site: 'Forkful Team', url: 'forkful-team:test' },
    ingredients: [{ position: 1, quantity: '1', quantityMax: null, unit: 'lb', name: 'spaghetti', note: null, rawText: '1 lb spaghetti' }],
    steps: ['Boil.'],
    modified: false,
    copyOf: null,
  }
}

const all = parseLibraryQuery({})

;(TEST_URL ? describe : describe.skip)('Library, private recipes, and delete (needs DATABASE_URL_TEST)', () => {
  let cook: string
  let stranger: string
  let pieId: string
  let copyId: string

  beforeAll(async () => {
    await appDb()`delete from app.users where left(username, ${PREFIX.length}) = ${PREFIX}`
    cook = await makeUser('cook')
    stranger = await makeUser('stranger')
    pieId = await createPrivateRecipe(cook, privateRecipe())
    copyId = await saveCopy(cook, catalogRecipe('Garlic Butter Pasta'))
  })

  afterAll(async () => {
    await appDb()`delete from app.users where left(username, ${PREFIX.length}) = ${PREFIX}`
  })

  test('a new private recipe is saved with every field, visible only to its owner (REQ-3.1, 3.2)', async () => {
    const pie = await getOwnRecipe(cook, pieId)
    expect(pie).toMatchObject({
      kind: 'private',
      title: "Grandma's Apple Pie",
      description: 'The one from the blue card.',
      servings: 8,
      notes: 'Use Honeycrisp.',
      tags: ['Dessert', 'family'],
      steps: ['Make the crust.', 'Fill and bake.'],
      source: null,
      modified: false,
    })
    expect(pie!.ingredients.map((i) => i.rawText)).toEqual(['6 apples, sliced', '3/4 cup sugar', 'cinnamon, a good shake'])
    await expect(getOwnRecipe(stranger, pieId)).resolves.toBeNull()
  })

  test('the Library lists every saved copy and private recipe, labeled (REQ-10.1)', async () => {
    const library = await getLibrary(cook, all)
    const byId = Object.fromEntries(library.items.map((i) => [i.recipeId, i]))
    expect(byId[pieId]).toMatchObject({ kind: 'private', modified: false })
    expect(byId[copyId]).toMatchObject({ kind: 'saved_copy', modified: false })
    expect(library.items).toHaveLength(2)
    expect(library.used).toBe(2)
  })

  test("nobody sees anyone else's Library (BR-9)", async () => {
    const theirs = await getLibrary(stranger, all)
    expect(theirs.items).toEqual([])
    expect(theirs.used).toBe(0)
  })

  test('search finds recipes by title, ingredient, or tag, in any case (REQ-10.2)', async () => {
    const ids = async (q: string) => (await getLibrary(cook, parseLibraryQuery({ q }))).items.map((i) => i.recipeId)
    expect(await ids('apple pie')).toEqual([pieId]) // title
    expect(await ids('SPAGHETTI')).toEqual([copyId]) // ingredient
    expect(await ids('famil')).toEqual([pieId]) // tag
    expect(await ids('100%')).toEqual([]) // % is a plain character
  })

  test('filtering by one tag (REQ-10.4)', async () => {
    const library = await getLibrary(cook, parseLibraryQuery({ tag: 'QUICK' }))
    expect(library.items.map((i) => i.recipeId)).toEqual([copyId])
    expect(library.tags.map((t) => t.name).sort()).toEqual(['Dessert', 'family', 'pasta', 'quick'].sort())
  })

  test('sorting by title, date added, and last changed (REQ-10.3)', async () => {
    // The pie was added first, but changed last.
    await updateOwnRecipe(cook, pieId, privateRecipe())
    const order = async (sort: string) => (await getLibrary(cook, parseLibraryQuery({ sort }))).items.map((i) => i.recipeId)
    expect(await order('title')).toEqual([copyId, pieId]) // "Garlic Butter Pasta" before "Grandma's Apple Pie"
    expect(await order('added')).toEqual([copyId, pieId]) // newest first
    expect(await order('modified')).toEqual([pieId, copyId]) // most recently changed first
  })

  test('the count and the warning come from app.settings (REQ-10.6)', async () => {
    const usage = await getLibraryUsage(cook)
    expect(usage).toMatchObject({ used: 2, full: false })
    expect(usage.cap).toBeGreaterThan(2)
    expect(usage.warningAt).toBeLessThanOrEqual(usage.cap)
  })

  test('a missing title, ingredient, or step is refused by the database too (REQ-3.3)', async () => {
    await expect(createPrivateRecipe(cook, privateRecipe({ title: '  ' }))).rejects.toMatchObject({ code: '23514' })
  })

  test('the confirmation page only lists your own recipes (REQ-5.2)', async () => {
    const mine = await getRecipesByIds(cook, [pieId, copyId, 'junk'])
    expect(mine.map((r) => r.recipeId).sort()).toEqual([pieId, copyId].sort())
    await expect(getRecipesByIds(stranger, [pieId, copyId])).resolves.toEqual([])
  })

  test("nobody can delete someone else's recipe (REQ-5.1, BR-9)", async () => {
    await expect(deleteRecipes(stranger, [pieId, copyId])).resolves.toBe(0)
    expect(await getOwnRecipe(cook, pieId)).not.toBeNull()
  })

  test('deleting several at once removes them for good, with everything in them (REQ-5.4, 5.5)', async () => {
    const a = await createPrivateRecipe(cook, privateRecipe({ title: 'Delete me A' }))
    const b = await saveCopy(cook, catalogRecipe('Delete me B'))
    await expect(deleteRecipes(cook, [a, b, a, 'junk'])).resolves.toBe(2)
    await expect(getOwnRecipe(cook, a)).resolves.toBeNull()
    await expect(getOwnRecipe(cook, b)).resolves.toBeNull()
    const [left] = await asUser(cook, (sql) => [
      sql`select (select count(*)::int from app.recipe_ingredient where recipe_id = any(${[a, b]}::uuid[])) as ingredients,
                 (select count(*)::int from app.recipe_step where recipe_id = any(${[a, b]}::uuid[])) as steps,
                 (select count(*)::int from app.recipe_tag where recipe_id = any(${[a, b]}::uuid[])) as tags`,
    ])
    expect(left[0]).toEqual({ ingredients: 0, steps: 0, tags: 0 })
    expect((await getLibrary(cook, all)).used).toBe(2) // the other two are still there
  })

  test('a Library of 100 recipes loads in under 2 seconds (NFR-5)', async () => {
    const big = await makeUser('big')
    // 100 recipes with 8 ingredients, 5 steps, and 2 tags each, inserted in one go.
    await asUser(big, (sql) => [
      sql`insert into app.recipe (owner_id, kind, title, cuisine)
          select ${big}, 'private', 'Recipe ' || g, 'Test' from generate_series(1, 100) g`,
      sql`insert into app.recipe_ingredient (recipe_id, owner_id, position, quantity, unit, name, raw_text)
          select r.recipe_id, r.owner_id, p, p, 'cup', 'ingredient ' || p, p || ' cup ingredient ' || p
          from app.recipe r, generate_series(1, 8) p where r.owner_id = ${big}`,
      sql`insert into app.recipe_step (recipe_id, owner_id, position, text)
          select r.recipe_id, r.owner_id, p, 'Step ' || p from app.recipe r, generate_series(1, 5) p where r.owner_id = ${big}`,
      sql`insert into app.tag (owner_id, name) values (${big}, 'weeknight'), (${big}, 'family')`,
      sql`insert into app.recipe_tag (recipe_id, tag_id, owner_id)
          select r.recipe_id, t.tag_id, r.owner_id from app.recipe r join app.tag t using (owner_id) where r.owner_id = ${big}`,
    ])
    const start = Date.now()
    const library = await getLibrary(big, all)
    const ms = Date.now() - start
    expect(library.items).toHaveLength(100)
    expect(library.items[0].tags).toEqual(['family', 'weeknight'])
    expect(ms).toBeLessThan(2000)

    // ...and a search of all 100, by ingredient
    const searchStart = Date.now()
    await getLibrary(big, parseLibraryQuery({ q: 'ingredient 7' }))
    expect(Date.now() - searchStart).toBeLessThan(2000)
  })

  test('a full Library blocks a new private recipe (REQ-3.6)', async () => {
    const full = await makeUser('full')
    await createPrivateRecipe(full, privateRecipe())
    try {
      await appDb()`update app.settings set value = '1' where key = 'recipe_cap'`
      expect(await getLibraryUsage(full)).toMatchObject({ used: 1, cap: 1, full: true })
      const err = await createPrivateRecipe(full, privateRecipe({ title: 'One too many' })).catch((e: unknown) => e)
      expect(isLibraryFull(err)).toBe(true)
    } finally {
      await appDb()`update app.settings set value = '100' where key = 'recipe_cap'`
    }
  })
})
