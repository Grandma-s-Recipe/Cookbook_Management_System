/** @jest-environment node */
// CS445 Testing Lab §3: unit tests for the recipe form rules (editing a saved copy).
// Module under test: parseRecipeForm() in src/lib/recipes/form.ts
// Requirements: REQ-2.2 (edit any field of a saved copy), REQ-3.3 (required fields).

import { FIELD, parseRecipeForm } from '../src/lib/recipes/form'

/** What the edit form sends for a complete, valid recipe. Tests change one field at a time. */
function validForm(): FormData {
  const form = new FormData()
  form.set(FIELD.title, 'My Greek Salad')
  form.set(FIELD.description, 'With extra feta.')
  form.set(FIELD.cuisine, 'Greek')
  form.set(FIELD.servings, '4')
  form.set(FIELD.prepMinutes, '15')
  form.set(FIELD.cookMinutes, '')
  form.set(FIELD.notes, 'Use ripe tomatoes.')
  form.set(FIELD.tags, 'salad, summer')
  form.append(FIELD.quantity, '1')
  form.append(FIELD.quantityMax, '')
  form.append(FIELD.unit, 'cup')
  form.append(FIELD.name, 'feta')
  form.append(FIELD.note, 'crumbled')
  form.append(FIELD.step, 'Chop and toss everything.')
  return form
}

describe('parseRecipeForm: saving an edited recipe (REQ-2.2)', () => {
  test('TC-05: an edit with every field changed is accepted, with each field read correctly', () => {
    // Arrange
    const form = validForm()

    // Act
    const { input, errors } = parseRecipeForm(form)

    // Assert
    expect(errors).toEqual({})
    expect(input).toMatchObject({
      title: 'My Greek Salad',
      cuisine: 'Greek',
      servings: 4,
      prepMinutes: 15,
      cookMinutes: null,
      notes: 'Use ripe tomatoes.',
      tags: ['salad', 'summer'],
      steps: ['Chop and toss everything.'],
    })
    expect(input.ingredients).toEqual([{ quantity: 1, quantityMax: null, unit: 'cup', name: 'feta', note: 'crumbled' }])
  })

  test('TC-06: clearing the title is refused with "Enter a title." (negative)', () => {
    // Arrange
    const form = validForm()
    form.set(FIELD.title, '   ')

    // Act
    const { errors } = parseRecipeForm(form)

    // Assert
    expect(errors).toEqual({ title: 'Enter a title.' })
  })

  // Each required part, removed one at a time (REQ-3.3): only that part is reported.
  test.each([
    { part: 'title', remove: (f: FormData) => f.set(FIELD.title, ''), errorKey: 'title' },
    { part: 'the only ingredient', remove: (f: FormData) => f.set(FIELD.name, ''), errorKey: 'ingredient-0' },
    { part: 'the only step', remove: (f: FormData) => f.set(FIELD.step, ''), errorKey: 'steps' },
  ])('removing $part is refused, and only that field is highlighted (negative)', ({ remove, errorKey }) => {
    // Arrange
    const form = validForm()
    remove(form)

    // Act
    const { errors } = parseRecipeForm(form)

    // Assert
    expect(Object.keys(errors)).toEqual([errorKey])
  })

  // Servings must be a whole number from 1 to 1000 (or empty): boundaries.
  test.each([
    { servings: '0', ok: false },
    { servings: '1', ok: true },
    { servings: '1000', ok: true },
    { servings: '1001', ok: false },
  ])('servings of $servings is accepted: $ok (boundary)', ({ servings, ok }) => {
    // Arrange
    const form = validForm()
    form.set(FIELD.servings, servings)

    // Act
    const { errors } = parseRecipeForm(form)

    // Assert
    expect('servings' in errors).toBe(!ok)
  })
})
