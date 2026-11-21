/** @jest-environment node */
// Save a copy and edit it (REQ-2.1–2.3, 2.5–2.7, BR-1, BR-10, NFR-4).
//
// Uses the Neon "test" branch as forkful_app; skipped when DATABASE_URL_TEST
// isn't set (see README → Testing). The "catalog recipe" here is built in the
// test, so no catalog connection is needed. Creates users named copytest_…
// and deletes them at the end.

import { randomBytes, randomUUID } from 'node:crypto'
import { appDb, isLibraryFull } from '../src/lib/db'
import { getOwnRecipe, getSaveCopyStatus, saveCopy, updateOwnRecipe } from '../src/lib/library'
import type { RecipeInput } from '../src/lib/recipes/form'
import { originalStatus } from '../src/lib/recipes/hash'
import { toRecipeContent, type RecipeView } from '../src/lib/recipes/view'

const TEST_URL = process.env.DATABASE_URL_TEST
if (TEST_URL) {
  const real = process.env.DATABASE_URL_APP
  if (real && new URL(real).host === new URL(TEST_URL).host) {
    throw new Error('DATABASE_URL_TEST has the same host as DATABASE_URL_APP. Use the Neon test branch.')
  }
  process.env.DATABASE_URL_APP = TEST_URL // read by appDb() when it first connects
}

const PREFIX = 'copytest_'
const FIVE_SECONDS = 5000 // NFR-4

async function makeUser(label: string): Promise<string> {
  const suffix = randomBytes(4).toString('hex')
  const [row] = await appDb()`
    insert into app.users (username, email, password_hash, is_verified, age_confirmed_at)
    values (${PREFIX + label + '_' + suffix}, ${`${PREFIX}${label}-${suffix}@example.test`}, 'not-a-real-hash', true, now())
    returning user_id`
  return row.user_id
}

function catalogRecipe(): RecipeView {
  return {
    id: randomUUID(),
    kind: 'catalog',
    title: 'Tomato Basil Soup',
    description: 'A bright, quick soup.',
    cuisine: 'American',
    servings: 4,
    prepMinutes: 10,
    cookMinutes: 25,
    tags: ['soup', 'vegetarian'],
    notes: null,
    source: { site: 'Forkful Team', url: 'forkful-team:tomato-basil-soup' },
    ingredients: [
      { position: 1, quantity: '2', quantityMax: null, unit: 'tbsp', name: 'olive oil', note: null, rawText: '2 tbsp olive oil' },
      { position: 2, quantity: '1.5', quantityMax: '2', unit: 'lb', name: 'tomatoes', note: 'chopped', rawText: '1 1/2-2 lb tomatoes, chopped' },
      { position: 3, quantity: null, quantityMax: null, unit: null, name: null, note: null, rawText: 'Fresh basil, to serve' },
    ],
    steps: ['Warm the oil.', 'Add the tomatoes and simmer.', 'Blend and serve with basil.'],
    modified: false,
    copyOf: null,
  }
}

/** The edit form's result for a recipe, unchanged. */
function asInput(r: RecipeView): RecipeInput {
  return {
    title: r.title,
    description: r.description,
    cuisine: r.cuisine,
    servings: r.servings,
    prepMinutes: r.prepMinutes,
    cookMinutes: r.cookMinutes,
    notes: r.notes,
    tags: r.tags,
    ingredients: r.ingredients.map((i) =>
      i.name
        ? { quantity: i.quantity === null ? null : Number(i.quantity), quantityMax: i.quantityMax === null ? null : Number(i.quantityMax), unit: i.unit, name: i.name, note: i.note }
        : { quantity: null, quantityMax: null, unit: null, name: i.rawText, note: null }, // as the form does
    ),
    steps: r.steps,
  }
}

;(TEST_URL ? describe : describe.skip)('save a copy and edit it (needs DATABASE_URL_TEST)', () => {
  let cook: string
  let stranger: string

  beforeAll(async () => {
    await appDb()`delete from app.users where left(username, ${PREFIX.length}) = ${PREFIX}`
    cook = await makeUser('cook')
    stranger = await makeUser('stranger')
  })

  afterAll(async () => {
    await appDb()`delete from app.users where left(username, ${PREFIX.length}) = ${PREFIX}`
  })

  test('Save a Copy makes the user their own full copy, within 5 seconds (REQ-2.1, NFR-4)', async () => {
    const original = catalogRecipe()
    const before = structuredClone(original)

    const start = Date.now()
    const id = await saveCopy(cook, original)
    expect(Date.now() - start).toBeLessThan(FIVE_SECONDS)

    const copy = await getOwnRecipe(cook, id)
    expect(copy).toMatchObject({
      kind: 'saved_copy',
      title: original.title,
      description: original.description,
      cuisine: original.cuisine,
      servings: 4,
      prepMinutes: 10,
      cookMinutes: 25,
      tags: ['soup', 'vegetarian'],
      steps: original.steps,
      source: original.source, // BR-8
      modified: false,
      copyOf: { catalogId: original.id },
    })
    expect(copy!.ingredients.map((i) => i.rawText)).toEqual(original.ingredients.map((i) => i.rawText))
    expect(original).toEqual(before) // the catalog side is only read
  })

  test('the site role cannot change the catalog at all (BR-1)', async () => {
    const [p] = await appDb()`
      select has_schema_privilege(current_user, 'catalog', 'USAGE') as can_use_catalog`
    expect(p.can_use_catalog).toBe(false)
  })

  test('a second Save a Copy knows about the first (REQ-2.5); others never see it', async () => {
    const original = catalogRecipe()
    const first = await saveCopy(cook, original)
    const status = await getSaveCopyStatus(cook, original.id)
    expect(status.copies.map((c) => c.recipeId)).toEqual([first])

    const second = await saveCopy(cook, original) // "Save another copy"
    expect((await getSaveCopyStatus(cook, original.id)).copies.map((c) => c.recipeId).sort()).toEqual([first, second].sort())

    expect((await getSaveCopyStatus(stranger, original.id)).copies).toEqual([])
    await expect(getOwnRecipe(stranger, first)).resolves.toBeNull()
  })

  test('every field of a copy can be edited, within 5 seconds, and it shows Modified (REQ-2.2, 2.3, NFR-4)', async () => {
    const id = await saveCopy(cook, catalogRecipe())
    const copy = (await getOwnRecipe(cook, id))!
    const edited: RecipeInput = {
      title: 'My Tomato Soup',
      description: 'Smoother, with cream.',
      cuisine: 'Italian',
      servings: 6,
      prepMinutes: 15,
      cookMinutes: 30,
      notes: 'Double the basil.\nUse San Marzano tomatoes.',
      tags: ['Soup', 'family'],
      ingredients: [
        { quantity: 2, quantityMax: 3, unit: 'lb', name: 'tomatoes', note: null }, // moved up and changed
        { quantity: 0.5, quantityMax: null, unit: 'cup', name: 'cream', note: 'heavy' }, // new
        { quantity: 2, quantityMax: null, unit: 'tbsp', name: 'olive oil', note: null },
      ],
      steps: ['Simmer the tomatoes.', 'Stir in the cream.'],
    }

    const start = Date.now()
    await expect(updateOwnRecipe(cook, id, edited)).resolves.toBe(true)
    expect(Date.now() - start).toBeLessThan(FIVE_SECONDS)

    const after = (await getOwnRecipe(cook, id))!
    expect(after).toMatchObject({
      title: 'My Tomato Soup',
      description: 'Smoother, with cream.',
      cuisine: 'Italian',
      servings: 6,
      prepMinutes: 15,
      cookMinutes: 30,
      notes: 'Double the basil.\nUse San Marzano tomatoes.',
      tags: ['family', 'soup'], // "Soup" is the tag this user already has as "soup" (one tag, either case)
      steps: edited.steps,
      kind: 'saved_copy',
      source: copy.source, // still says where it came from
      modified: true, // REQ-2.3
    })
    expect(after.ingredients.map((i) => i.rawText)).toEqual(['2-3 lb tomatoes', '1/2 cup cream, heavy', '2 tbsp olive oil'])
  })

  test('saving a copy without real changes does not mark it Modified', async () => {
    const id = await saveCopy(cook, catalogRecipe())
    const copy = (await getOwnRecipe(cook, id))!
    await updateOwnRecipe(cook, id, asInput(copy))
    expect((await getOwnRecipe(cook, id))!.modified).toBe(false)
  })

  test('changing a copy back to the original clears Modified', async () => {
    const id = await saveCopy(cook, catalogRecipe())
    const copy = (await getOwnRecipe(cook, id))!
    await updateOwnRecipe(cook, id, { ...asInput(copy), title: 'Changed' })
    expect((await getOwnRecipe(cook, id))!.modified).toBe(true)
    await updateOwnRecipe(cook, id, asInput(copy))
    expect((await getOwnRecipe(cook, id))!.modified).toBe(false)
  })

  test("nobody can edit someone else's recipe; nothing changes", async () => {
    const id = await saveCopy(cook, catalogRecipe())
    const copy = (await getOwnRecipe(cook, id))!
    await expect(updateOwnRecipe(stranger, id, { ...asInput(copy), title: 'Taken over' })).resolves.toBe(false)
    expect((await getOwnRecipe(cook, id))!.title).toBe(copy.title)
    await expect(updateOwnRecipe(cook, 'not-an-id', asInput(copy))).resolves.toBe(false)
  })

  test('the copy notices when the original changes or goes (REQ-2.6)', async () => {
    const original = catalogRecipe()
    const id = await saveCopy(cook, original)
    const copy = (await getOwnRecipe(cook, id))!
    const content = toRecipeContent(original)
    expect(originalStatus(copy.copyOf!, { ...content, status: 'active' })).toBe('same')
    expect(originalStatus(copy.copyOf!, { ...content, cookMinutes: 40, status: 'active' })).toBe('updated')
    expect(originalStatus(copy.copyOf!, null)).toBe('unavailable')
  })

  test('only catalog recipes can be copied', async () => {
    const id = await saveCopy(cook, catalogRecipe())
    const copy = (await getOwnRecipe(cook, id))!
    await expect(saveCopy(cook, copy)).rejects.toThrow('only catalog recipes')
  })

  test('at the limit from app.settings, Save a Copy is blocked (REQ-2.7, BR-10)', async () => {
    const full = await makeUser('full')
    const original = catalogRecipe()
    await saveCopy(full, original) // 1 recipe
    try {
      await appDb()`update app.settings set value = '1' where key = 'recipe_cap'`
      const status = await getSaveCopyStatus(full, original.id)
      expect(status).toMatchObject({ used: 1, cap: 1, full: true })

      const err = await saveCopy(full, original).catch((e: unknown) => e)
      expect(isLibraryFull(err)).toBe(true)
      expect((await getSaveCopyStatus(full, original.id)).used).toBe(1) // nothing was saved
    } finally {
      await appDb()`update app.settings set value = '100' where key = 'recipe_cap'`
    }
  })
})
