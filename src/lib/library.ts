// Recipe Library service: the user's own saved copies and private recipes
// (SRS §4.2, §4.3, §4.10). Everything here goes through asUser(), so row-level
// security limits it to the logged-in user's rows (NFR-13, BR-9; decision 21).
// Each save is one transaction, so it's all or nothing, and fast (NFR-4).
//
// The Library list, new private recipes, and delete are added by their own issues.

import { randomUUID } from 'node:crypto'
import { asUser, isUuid } from '@/lib/db'
import { toIngredientLine } from '@/lib/catalog'
import type { RecipeInput } from '@/lib/recipes/form'
import { recipeContentHash } from '@/lib/recipes/hash'
import { buildRawText } from '@/lib/recipes/ingredients'
import { toRecipeContent, type RecipeView } from '@/lib/recipes/view'

type Sql = Parameters<Parameters<typeof asUser>[1]>[0]

/**
 * One of the user's own recipes, for the recipe page (REQ-3.2). Null when the id
 * is malformed, doesn't exist, or belongs to someone else: the page shows the same
 * "not found" either way, so it never tells anyone that another user's recipe exists.
 */
export async function getOwnRecipe(userId: string, recipeId: string): Promise<RecipeView | null> {
  if (!isUuid(recipeId)) return null
  const [rows, ingredients, steps, tags] = await asUser(userId, (sql) => [
    sql`
      select recipe_id, kind, title, description, cuisine, servings, prep_minutes, cook_minutes, notes,
             source_catalog_id, source_site, source_url, source_hash, content_hash
      from app.recipe
      where recipe_id = ${recipeId} and owner_id = ${userId}`,
    sql`
      select position, quantity, quantity_max, unit, name, note, raw_text
      from app.recipe_ingredient
      where recipe_id = ${recipeId} and owner_id = ${userId}
      order by position`,
    sql`
      select text from app.recipe_step
      where recipe_id = ${recipeId} and owner_id = ${userId}
      order by position`,
    sql`
      select t.name
      from app.recipe_tag rt join app.tag t using (tag_id, owner_id)
      where rt.recipe_id = ${recipeId} and rt.owner_id = ${userId}
      order by lower(t.name)`,
  ])
  const r = rows[0]
  if (!r) return null
  const isCopy = r.kind === 'saved_copy'
  return {
    id: r.recipe_id,
    kind: r.kind,
    title: r.title,
    description: r.description,
    cuisine: r.cuisine,
    servings: r.servings,
    prepMinutes: r.prep_minutes,
    cookMinutes: r.cook_minutes,
    tags: tags.map((t) => t.name),
    notes: r.notes,
    source: isCopy ? { site: r.source_site, url: r.source_url } : null,
    ingredients: ingredients.map(toIngredientLine),
    steps: steps.map((s) => s.text),
    modified: isCopy && r.content_hash !== r.source_hash, // REQ-2.3
    copyOf: isCopy ? { catalogId: r.source_catalog_id, sourceHash: r.source_hash } : null,
  }
}

export type SaveCopyStatus = {
  used: number // the user's saved copies plus private recipes (BR-10)
  cap: number // recipe_cap from app.settings (decision 12)
  full: boolean
  copies: { recipeId: string; title: string; createdAt: string }[] // copies of this catalog recipe, newest first (REQ-2.5)
}

/** What the Save a Copy button needs to know: room left, and copies already saved. */
export async function getSaveCopyStatus(userId: string, catalogId: string): Promise<SaveCopyStatus> {
  const [usage, copies] = await asUser(userId, (sql) => [
    sql`
      select (select count(*)::int from app.recipe where owner_id = ${userId}) as used,
             (select (value #>> '{}')::int from app.settings where key = 'recipe_cap') as cap`,
    isUuid(catalogId)
      ? sql`
          select recipe_id, title, created_at from app.recipe
          where owner_id = ${userId} and source_catalog_id = ${catalogId}
          order by created_at desc`
      : sql`select null limit 0`,
  ])
  const used = usage[0].used as number
  const cap = (usage[0].cap as number | null) ?? Number.POSITIVE_INFINITY // no setting: no limit, like the trigger
  return {
    used,
    cap,
    full: used >= cap,
    copies: copies.map((c) => ({ recipeId: c.recipe_id, title: c.title, createdAt: new Date(c.created_at).toISOString() })),
  }
}

/** The Library-full message, with the limit from app.settings (REQ-2.7, REQ-3.6). */
export function libraryFullMessage(cap: number): string {
  return `Your Library is full (${cap} of ${cap} recipes).`
}

/**
 * Save a copy of a catalog recipe into the user's Library (REQ-2.1). The catalog
 * recipe is only read; forkful_app can't change the catalog at all (BR-1).
 * The catalog's tags become the user's own tags on the copy.
 * Returns the new recipe's id. Throws the FKCAP error when the Library is full
 * (check with isLibraryFull()).
 */
export async function saveCopy(userId: string, original: RecipeView): Promise<string> {
  if (original.kind !== 'catalog' || !original.source) throw new Error('saveCopy: only catalog recipes can be copied')
  const recipeId = randomUUID() // made here, so every query below can use it (see asUser())
  const hash = recipeContentHash(toRecipeContent(original)) // the copy starts identical: not "Modified"

  await asUser(userId, (sql) => [
    sql`
      insert into app.recipe (recipe_id, owner_id, kind, source_catalog_id, source_site, source_url,
                              source_hash, content_hash, title, description, cuisine,
                              servings, prep_minutes, cook_minutes)
      values (${recipeId}, ${userId}, 'saved_copy', ${original.id}, ${original.source!.site}, ${original.source!.url},
              ${hash}, ${hash}, ${original.title}, ${original.description}, ${original.cuisine},
              ${original.servings}, ${original.prepMinutes}, ${original.cookMinutes})`,
    insertIngredients(sql, userId, recipeId, original.ingredients),
    insertSteps(sql, userId, recipeId, original.steps),
    ...setTags(sql, userId, recipeId, original.tags),
  ])
  return recipeId
}

/**
 * Save the edit form for one of the user's recipes (REQ-2.2). Replaces every field,
 * ingredient, step, and tag. For a saved copy, also updates its hash, so "Modified"
 * shows only when it really differs from what was copied (REQ-2.3).
 * Returns false when the recipe doesn't exist or isn't the user's; nothing is changed then.
 * Two requests: the ownership check, then the save in one transaction.
 */
export async function updateOwnRecipe(userId: string, recipeId: string, input: RecipeInput): Promise<boolean> {
  if (!isUuid(recipeId)) return false
  const ingredients = input.ingredients.map((i, n) => ({ ...i, position: n + 1, rawText: buildRawText(i) }))
  const hash = recipeContentHash({ ...input, ingredients })

  // Check it's the user's first. (Without this, the inserts below would fail
  // with a confusing error for someone else's recipe; row-level security would
  // still stop any change.)
  const [own] = await asUser(userId, (sql) => [
    sql`select 1 from app.recipe where recipe_id = ${recipeId} and owner_id = ${userId}`,
  ])
  if (!own.length) return false

  await asUser(userId, (sql) => [
    sql`
      update app.recipe set
        title = ${input.title}, description = ${input.description}, cuisine = ${input.cuisine},
        servings = ${input.servings}, prep_minutes = ${input.prepMinutes}, cook_minutes = ${input.cookMinutes},
        notes = ${input.notes},
        content_hash = case when kind = 'saved_copy' then ${hash}::text end,
        updated_at = now()
      where recipe_id = ${recipeId} and owner_id = ${userId}`,
    sql`delete from app.recipe_ingredient where recipe_id = ${recipeId} and owner_id = ${userId}`,
    insertIngredients(sql, userId, recipeId, ingredients),
    sql`delete from app.recipe_step where recipe_id = ${recipeId} and owner_id = ${userId}`,
    insertSteps(sql, userId, recipeId, input.steps),
    sql`delete from app.recipe_tag where recipe_id = ${recipeId} and owner_id = ${userId}`,
    ...setTags(sql, userId, recipeId, input.tags),
  ])
  return true
}

// --- shared pieces -----------------------------------------------------------

type Line = {
  quantity: number | string | null
  quantityMax: number | string | null
  unit: string | null
  name: string | null
  note: string | null
  rawText: string
}

/** All ingredient rows in one statement, numbered from 1 in the order given. */
function insertIngredients(sql: Sql, userId: string, recipeId: string, lines: Line[]) {
  return sql`
    insert into app.recipe_ingredient
      (recipe_id, owner_id, position, quantity, quantity_max, unit, name, note, raw_text)
    select ${recipeId}, ${userId}, x.position, x.quantity, x.quantity_max, x.unit, x.name, x.note, x.raw_text
    from unnest(
      ${lines.map((_, n) => n + 1)}::int[],
      ${lines.map((l) => (l.quantity === null ? null : String(l.quantity)))}::numeric[],
      ${lines.map((l) => (l.quantityMax === null ? null : String(l.quantityMax)))}::numeric[],
      ${lines.map((l) => l.unit)}::text[],
      ${lines.map((l) => l.name)}::text[],
      ${lines.map((l) => l.note)}::text[],
      ${lines.map((l) => l.rawText)}::text[]
    ) as x(position, quantity, quantity_max, unit, name, note, raw_text)`
}

/** All step rows in one statement, numbered from 1. */
function insertSteps(sql: Sql, userId: string, recipeId: string, steps: string[]) {
  return sql`
    insert into app.recipe_step (recipe_id, owner_id, position, text)
    select ${recipeId}, ${userId}, x.position, x.text
    from unnest(${steps.map((_, n) => n + 1)}::int[], ${steps}::text[]) as x(position, text)`
}

/** Create any of the user's tags that don't exist yet, then put them on the recipe. */
function setTags(sql: Sql, userId: string, recipeId: string, tags: string[]) {
  return [
    sql`
      insert into app.tag (owner_id, name)
      select ${userId}, t from unnest(${tags}::text[]) as t
      on conflict (owner_id, lower(name)) do nothing`,
    sql`
      insert into app.recipe_tag (recipe_id, tag_id, owner_id)
      select ${recipeId}, tag_id, owner_id from app.tag
      where owner_id = ${userId} and lower(name) = any(${tags.map((t) => t.toLowerCase())}::text[])`,
  ]
}
