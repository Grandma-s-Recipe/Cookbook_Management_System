/** @jest-environment node */
// The recipe form rules (REQ-2.2, REQ-3.3, REQ-3.4, REQ-3.9).
import { draftFromRecipe, FIELD, parseRecipeForm, type RecipeDraft } from '../src/lib/recipes/form'
import type { RecipeView } from '../src/lib/recipes/view'

/** Build what the browser sends for a draft, with the same field names as the form. */
function toForm(d: RecipeDraft): FormData {
  const f = new FormData()
  f.set(FIELD.title, d.title)
  f.set(FIELD.description, d.description)
  f.set(FIELD.cuisine, d.cuisine)
  f.set(FIELD.servings, d.servings)
  f.set(FIELD.prepMinutes, d.prepMinutes)
  f.set(FIELD.cookMinutes, d.cookMinutes)
  f.set(FIELD.notes, d.notes)
  f.set(FIELD.tags, d.tags)
  for (const i of d.ingredients) {
    f.append(FIELD.quantity, i.quantity)
    f.append(FIELD.quantityMax, i.quantityMax)
    f.append(FIELD.unit, i.unit)
    f.append(FIELD.name, i.name)
    f.append(FIELD.note, i.note)
  }
  for (const s of d.steps) f.append(FIELD.step, s)
  return f
}

const good: RecipeDraft = {
  title: ' Tomato Soup ',
  description: 'Warm.',
  cuisine: 'American',
  servings: '4',
  prepMinutes: '10',
  cookMinutes: '25',
  notes: 'Add basil.',
  tags: 'soup, Quick, quick, , weeknight',
  ingredients: [
    { quantity: '1 1/2', quantityMax: '2', unit: 'lb', name: 'tomatoes', note: 'chopped' },
    { quantity: '', quantityMax: '', unit: '', name: '', note: '' }, // an empty row is skipped
    { quantity: '', quantityMax: '', unit: '', name: 'salt', note: 'to taste' },
  ],
  steps: ['Simmer.', '   ', 'Blend.'],
}

test('a complete form is accepted and tidied (REQ-2.2, REQ-3.4)', () => {
  const { input, errors } = parseRecipeForm(toForm(good))
  expect(errors).toEqual({})
  expect(input).toEqual({
    title: 'Tomato Soup',
    description: 'Warm.',
    cuisine: 'American',
    servings: 4,
    prepMinutes: 10,
    cookMinutes: 25,
    notes: 'Add basil.',
    tags: ['soup', 'Quick', 'weeknight'],
    ingredients: [
      { quantity: 1.5, quantityMax: 2, unit: 'lb', name: 'tomatoes', note: 'chopped' },
      { quantity: null, quantityMax: null, unit: null, name: 'salt', note: 'to taste' },
    ],
    steps: ['Simmer.', 'Blend.'],
  })
})

test('optional fields can be left empty', () => {
  const { input, errors } = parseRecipeForm(
    toForm({ ...good, description: '', cuisine: '', servings: '', prepMinutes: '', cookMinutes: '', notes: '', tags: '' }),
  )
  expect(errors).toEqual({})
  expect(input).toMatchObject({ description: null, cuisine: null, servings: null, prepMinutes: null, cookMinutes: null, notes: null, tags: [] })
})

test('title, an ingredient, and a step are required, each with its own message (REQ-3.3)', () => {
  const { errors } = parseRecipeForm(
    toForm({ ...good, title: '  ', ingredients: [{ quantity: '', quantityMax: '', unit: '', name: '', note: '' }], steps: [''] }),
  )
  expect(Object.keys(errors).sort()).toEqual(['ingredients', 'steps', 'title'])
})

test('numbers that make no sense are refused', () => {
  const { errors } = parseRecipeForm(toForm({ ...good, servings: '0', prepMinutes: '-5', cookMinutes: 'an hour' }))
  expect(Object.keys(errors).sort()).toEqual(['cookMinutes', 'prepMinutes', 'servings'])
})

test('ingredient rows are checked one by one, and the message names the row', () => {
  const row = (r: Partial<RecipeDraft['ingredients'][number]>) => ({ quantity: '', quantityMax: '', unit: '', name: 'x', note: '', ...r })
  const { errors } = parseRecipeForm(
    toForm({
      ...good,
      ingredients: [
        row({ quantity: 'some' }), // 0: amount can't be read
        row({ quantity: '3', quantityMax: '2' }), // 1: range backwards
        row({ quantityMax: '2' }), // 2: range with no start
        row({ name: '', quantity: '2' }), // 3: no name
        row({ quantity: '2' }), // 4: fine
      ],
    }),
  )
  expect(Object.keys(errors).sort()).toEqual(['ingredient-0', 'ingredient-1', 'ingredient-2', 'ingredient-3'])
})

test('too many tags, or a very long tag, are refused', () => {
  expect(parseRecipeForm(toForm({ ...good, tags: Array.from({ length: 21 }, (_, i) => `t${i}`).join(',') })).errors.tags).toBeDefined()
  expect(parseRecipeForm(toForm({ ...good, tags: 'x'.repeat(41) })).errors.tags).toBeDefined()
})

test('a recipe fills the form, and saving it unchanged gives the same recipe back', () => {
  const recipe: RecipeView = {
    id: '00000000-0000-4000-8000-000000000001',
    kind: 'saved_copy',
    title: 'Garlic Butter Pasta',
    description: null,
    cuisine: 'Italian',
    servings: 4,
    prepMinutes: 5,
    cookMinutes: null,
    tags: ['pasta', 'quick'],
    notes: null,
    source: { site: 'Forkful Team', url: 'forkful-team:garlic-butter-pasta' },
    ingredients: [
      { position: 1, quantity: '0.5', quantityMax: null, unit: 'cup', name: 'parmesan', note: 'grated', rawText: '1/2 cup parmesan, grated' },
      { position: 2, quantity: null, quantityMax: null, unit: null, name: null, note: null, rawText: 'A pinch of chili flakes' },
    ],
    steps: ['Boil.', 'Toss.'],
    modified: false,
    copyOf: null,
  }
  const draft = draftFromRecipe(recipe)
  expect(draft.ingredients[0]).toEqual({ quantity: '1/2', quantityMax: '', unit: 'cup', name: 'parmesan', note: 'grated' })
  expect(draft.ingredients[1].name).toBe('A pinch of chili flakes') // a never-split line goes in the name box
  expect(draft.tags).toBe('pasta, quick')

  const { input, errors } = parseRecipeForm(toForm(draft))
  expect(errors).toEqual({})
  expect(input).toMatchObject({
    title: recipe.title,
    cuisine: 'Italian',
    servings: 4,
    prepMinutes: 5,
    cookMinutes: null,
    tags: ['pasta', 'quick'],
    steps: recipe.steps,
  })
  expect(input.ingredients[0]).toEqual({ quantity: 0.5, quantityMax: null, unit: 'cup', name: 'parmesan', note: 'grated' })
})
