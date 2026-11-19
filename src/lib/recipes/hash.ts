// Recipe content hashes, for "Modified" and "Original updated" (REQ-2.3, REQ-2.6; decision 4).
//
// When a user saves a copy, the app hashes the catalog recipe and stores it as
// the copy's source_hash. Each time the copy is saved, the app hashes the copy
// and stores it as content_hash. Then:
//   - "Modified":           content_hash != source_hash
//   - "Original updated":   hash of the catalog recipe NOW != source_hash
//   - "Original no longer available": the catalog recipe is gone or not active
//
// forkful_app can't read the catalog, so the app reads the catalog side with
// catalogDb() and compares in code with originalStatus() below.
//
// Only the recipe's content counts: title, description, cuisine, servings, times,
// ingredients and steps. The user's tags, notes and photo don't make a copy "Modified".

import { createHash } from 'node:crypto'

type Num = number | string | null | undefined // the database driver returns numeric columns as strings
type Text = string | null | undefined

export type RecipeContent = {
  title: string
  description?: Text
  cuisine?: Text
  servings?: Num
  prepMinutes?: Num
  cookMinutes?: Num
  /** In position order. */
  ingredients: {
    quantity?: Num
    quantityMax?: Num
    unit?: Text
    name?: Text
    note?: Text
    rawText: string
  }[]
  /** Step texts, in position order. */
  steps: string[]
}

// Bump this if the fields or the rules below ever change.
const VERSION = 'v1'

function text(value: Text): string | null {
  const t = (value ?? '').trim()
  return t === '' ? null : t
}

function num(value: Num): string | null {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? String(n) : String(value).trim() // "1.50" and 1.5 hash the same
}

/** A stable hash of a recipe's content, like "v1:3f2a…". */
export function recipeContentHash(r: RecipeContent): string {
  // Arrays, not objects, so the order of the fields can never change the hash.
  const canonical = [
    text(r.title),
    text(r.description),
    text(r.cuisine),
    num(r.servings),
    num(r.prepMinutes),
    num(r.cookMinutes),
    r.ingredients.map((i) => [num(i.quantity), num(i.quantityMax), text(i.unit), text(i.name), text(i.note), text(i.rawText)]),
    r.steps.map(text),
  ]
  return `${VERSION}:${createHash('sha256').update(JSON.stringify(canonical)).digest('hex')}`
}

/** True when the user has changed their copy since saving it (REQ-2.3). */
export function isModified(copy: { sourceHash: string; contentHash: string }): boolean {
  return copy.contentHash !== copy.sourceHash
}

/**
 * How the catalog original compares with what was copied (REQ-2.6).
 * Pass the catalog recipe as it is now (read with catalogDb()), or null if it's gone.
 */
export function originalStatus(
  copy: { sourceHash: string },
  originalNow: (RecipeContent & { status: string }) | null,
): 'same' | 'updated' | 'unavailable' {
  if (!originalNow || originalNow.status !== 'active') return 'unavailable'
  return recipeContentHash(originalNow) === copy.sourceHash ? 'same' : 'updated'
}
