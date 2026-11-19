// The recipe form: what the edit page sends, how it's checked, and how a recipe
// fills the form (REQ-2.2, REQ-3.3, REQ-3.4, REQ-3.9).
// No database here, so it can be tested on its own. The same rules will serve
// "New private recipe" and the OCR review screen (REQ-4.8).

import { formatQuantity, parseQuantity } from '@/lib/recipes/ingredients'
import type { RecipeView } from '@/lib/recipes/view'

export const LIMITS = {
  title: 200,
  description: 2000,
  cuisine: 60,
  notes: 5000,
  tag: 40,
  tags: 20,
  unit: 20,
  ingredientName: 200,
  ingredientNote: 200,
  step: 5000,
  ingredients: 100,
  steps: 100,
  servings: 1000,
  minutes: 10000,
}

/** A checked recipe, ready to save. */
export type RecipeInput = {
  title: string
  description: string | null
  cuisine: string | null
  servings: number | null
  prepMinutes: number | null
  cookMinutes: number | null
  notes: string | null
  tags: string[]
  ingredients: { quantity: number | null; quantityMax: number | null; unit: string | null; name: string; note: string | null }[]
  steps: string[]
}

/**
 * Problems to show next to the fields. Keys are RecipeDraft names (title, servings,
 * prepMinutes, …, ingredients, steps), plus "ingredient-<n>" and "step-<n>" for one
 * row (n counts from 0, in the order the rows were sent).
 */
export type FormErrors = Record<string, string>

/** What the form holds: everything as typed. */
export type RecipeDraft = {
  title: string
  description: string
  cuisine: string
  servings: string
  prepMinutes: string
  cookMinutes: string
  notes: string
  tags: string // comma-separated
  ingredients: { quantity: string; quantityMax: string; unit: string; name: string; note: string }[]
  steps: string[]
}

/** Form field names, shared by the form and the parser. */
export const FIELD = {
  title: 'title',
  description: 'description',
  cuisine: 'cuisine',
  servings: 'servings',
  prepMinutes: 'prep_minutes',
  cookMinutes: 'cook_minutes',
  notes: 'notes',
  tags: 'tags',
  quantity: 'ing_quantity',
  quantityMax: 'ing_quantity_max',
  unit: 'ing_unit',
  name: 'ing_name',
  note: 'ing_note',
  step: 'step',
} as const

/** Fill the form from a saved recipe. */
export function draftFromRecipe(r: RecipeView): RecipeDraft {
  return {
    title: r.title,
    description: r.description ?? '',
    cuisine: r.cuisine ?? '',
    servings: r.servings === null ? '' : String(r.servings),
    prepMinutes: r.prepMinutes === null ? '' : String(r.prepMinutes),
    cookMinutes: r.cookMinutes === null ? '' : String(r.cookMinutes),
    notes: r.notes ?? '',
    tags: r.tags.join(', '),
    ingredients: r.ingredients.map((i) =>
      i.name?.trim()
        ? {
            quantity: formatQuantity(i.quantity),
            quantityMax: formatQuantity(i.quantityMax),
            unit: i.unit ?? '',
            name: i.name,
            note: i.note ?? '',
          }
        : // A line that was never split (REQ-4.13): put the whole text in the name.
          { quantity: '', quantityMax: '', unit: '', name: i.rawText, note: '' },
    ),
    steps: [...r.steps],
  }
}

function text(form: FormData, name: string): string {
  const v = form.get(name)
  return typeof v === 'string' ? v.trim() : ''
}

function texts(form: FormData, name: string): string[] {
  return form.getAll(name).map((v) => (typeof v === 'string' ? v.trim() : ''))
}

/** A whole number in range, null for an empty box, or NaN when it isn't one. */
function wholeNumber(value: string, min: number, max: number): number | null {
  if (value === '') return null
  if (!/^\d+$/.test(value)) return Number.NaN
  const n = Number(value)
  return n < min || n > max ? Number.NaN : n
}

/** Read and check the submitted form. `errors` is empty when it can be saved. */
export function parseRecipeForm(form: FormData): { input: RecipeInput; errors: FormErrors } {
  const errors: FormErrors = {}

  const title = text(form, FIELD.title)
  if (!title) errors.title = 'Enter a title.'
  else if (title.length > LIMITS.title) errors.title = `Keep the title to ${LIMITS.title} characters or fewer.`

  const description = text(form, FIELD.description)
  if (description.length > LIMITS.description) errors.description = `Keep the description to ${LIMITS.description} characters or fewer.`

  const cuisine = text(form, FIELD.cuisine)
  if (cuisine.length > LIMITS.cuisine) errors.cuisine = `Keep the cuisine to ${LIMITS.cuisine} characters or fewer.`

  const notes = text(form, FIELD.notes)
  if (notes.length > LIMITS.notes) errors.notes = `Keep your notes to ${LIMITS.notes} characters or fewer.`

  const servings = wholeNumber(text(form, FIELD.servings), 1, LIMITS.servings)
  if (Number.isNaN(servings)) errors.servings = `Enter a whole number from 1 to ${LIMITS.servings}, or leave it empty.`

  const prepMinutes = wholeNumber(text(form, FIELD.prepMinutes), 0, LIMITS.minutes)
  if (Number.isNaN(prepMinutes)) errors.prepMinutes = 'Enter the prep time in whole minutes, or leave it empty.'

  const cookMinutes = wholeNumber(text(form, FIELD.cookMinutes), 0, LIMITS.minutes)
  if (Number.isNaN(cookMinutes)) errors.cookMinutes = 'Enter the cook time in whole minutes, or leave it empty.'

  // Tags: comma-separated, no repeats ("Dinner" and "dinner" are the same tag).
  const tags: string[] = []
  for (const raw of text(form, FIELD.tags).split(',')) {
    const tag = raw.replace(/\s+/g, ' ').trim()
    if (tag && !tags.some((t) => t.toLowerCase() === tag.toLowerCase())) tags.push(tag)
  }
  if (tags.some((t) => t.length > LIMITS.tag)) errors.tags = `Keep each tag to ${LIMITS.tag} characters or fewer.`
  else if (tags.length > LIMITS.tags) errors.tags = `Use ${LIMITS.tags} tags or fewer.`

  // Ingredients: the fields come in rows, in order. Completely empty rows are skipped.
  const quantities = texts(form, FIELD.quantity)
  const maxes = texts(form, FIELD.quantityMax)
  const units = texts(form, FIELD.unit)
  const names = texts(form, FIELD.name)
  const noteList = texts(form, FIELD.note)
  const ingredients: RecipeInput['ingredients'] = []
  names.forEach((name, n) => {
    const row = { quantity: quantities[n] ?? '', quantityMax: maxes[n] ?? '', unit: units[n] ?? '', note: noteList[n] ?? '' }
    if (!name && !row.quantity && !row.quantityMax && !row.unit && !row.note) return // empty row
    const key = `ingredient-${n}`
    const quantity = parseQuantity(row.quantity)
    const quantityMax = parseQuantity(row.quantityMax)
    if (!name) errors[key] = 'Enter what the ingredient is.'
    else if (name.length > LIMITS.ingredientName) errors[key] = `Keep the ingredient to ${LIMITS.ingredientName} characters or fewer.`
    else if (Number.isNaN(quantity)) errors[key] = 'Enter the amount as a number like 2, 1.5, or 1 1/2.'
    else if (Number.isNaN(quantityMax)) errors[key] = 'Enter the "to" amount as a number like 3 or 2 1/2.'
    else if (quantityMax !== null && quantity === null) errors[key] = 'Enter the first amount of the range too.'
    else if (quantityMax !== null && quantity !== null && quantityMax < quantity) errors[key] = 'The "to" amount must be larger than the first amount.'
    else if (row.unit.length > LIMITS.unit) errors[key] = 'Choose a unit from the list.'
    else if (row.note.length > LIMITS.ingredientNote) errors[key] = `Keep the note to ${LIMITS.ingredientNote} characters or fewer.`
    ingredients.push({ quantity, quantityMax, unit: row.unit || null, name, note: row.note || null })
  })
  if (!ingredients.length) errors.ingredients = 'Add at least one ingredient.'
  else if (ingredients.length > LIMITS.ingredients) errors.ingredients = `Use ${LIMITS.ingredients} ingredients or fewer.`

  // Steps: empty ones are skipped.
  const steps: string[] = []
  texts(form, FIELD.step).forEach((step, n) => {
    if (!step) return
    if (step.length > LIMITS.step) errors[`step-${n}`] = `Keep each step to ${LIMITS.step} characters or fewer.`
    steps.push(step)
  })
  if (!steps.length) errors.steps = 'Add at least one step.'
  else if (steps.length > LIMITS.steps) errors.steps = `Use ${LIMITS.steps} steps or fewer.`

  return {
    input: {
      title,
      description: description || null,
      cuisine: cuisine || null,
      servings: Number.isNaN(servings) ? null : servings,
      prepMinutes: Number.isNaN(prepMinutes) ? null : prepMinutes,
      cookMinutes: Number.isNaN(cookMinutes) ? null : cookMinutes,
      notes: notes || null,
      tags,
      ingredients,
      steps,
    },
    errors,
  }
}
