// Recipe Library service: the user's own saved copies and private recipes
// (SRS §4.2, §4.3, §4.10). Everything here goes through asUser(), so row-level
// security limits it to the logged-in user's rows (NFR-13, BR-9; decision 21).
// Each save is one transaction, so it's all or nothing, and fast (NFR-4).
//

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

export type LibraryUsage = {
  used: number // the user's saved copies plus private recipes (BR-10)
  cap: number // recipe_cap from app.settings (decision 12)
  warningAt: number // recipe_warning_at from app.settings (REQ-10.6)
  full: boolean
  nearlyFull: boolean
}

/** used, cap, and warning_at for the user, in one row. */
function usageQuery(sql: Sql, userId: string) {
  return sql`
    select (select count(*)::int from app.recipe where owner_id = ${userId}) as used,
           (select (value #>> '{}')::int from app.settings where key = 'recipe_cap') as cap,
           (select (value #>> '{}')::int from app.settings where key = 'recipe_warning_at') as warning_at`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toUsage(row: Record<string, any>): LibraryUsage {
  const used = row.used as number
  const cap = (row.cap as number | null) ?? Number.POSITIVE_INFINITY // no setting: no limit, like the trigger
  const warningAt = (row.warning_at as number | null) ?? cap
  return { used, cap, warningAt, full: used >= cap, nearlyFull: used >= warningAt && used < cap }
}

/** How much of the Library is used (BR-10, REQ-10.6). */
export async function getLibraryUsage(userId: string): Promise<LibraryUsage> {
  const [[row]] = await asUser(userId, (sql) => [usageQuery(sql, userId)])
  return toUsage(row)
}

export type SaveCopyStatus = LibraryUsage & {
  copies: { recipeId: string; title: string; createdAt: string }[] // copies of this catalog recipe, newest first (REQ-2.5)
}

/** What the Save a Copy button needs to know: room left, and copies already saved. */
export async function getSaveCopyStatus(userId: string, catalogId: string): Promise<SaveCopyStatus> {
  const [usage, copies] = await asUser(userId, (sql) => [
    usageQuery(sql, userId),
    isUuid(catalogId)
      ? sql`
          select recipe_id, title, created_at from app.recipe
          where owner_id = ${userId} and source_catalog_id = ${catalogId}
          order by created_at desc`
      : sql`select null limit 0`,
  ])
  return {
    ...toUsage(usage[0]),
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

// --- New private recipe (REQ-3.1) ------------------------------------------

/**
 * Save a new private recipe from the form (REQ-3.1, REQ-3.2). Only its owner can
 * ever see it. Returns the new id. Throws the FKCAP error when the Library is full
 * (REQ-3.6; check with isLibraryFull()).
 */
export async function createPrivateRecipe(userId: string, input: RecipeInput): Promise<string> {
  const recipeId = randomUUID()
  const ingredients = input.ingredients.map((i) => ({ ...i, rawText: buildRawText(i) }))
  await asUser(userId, (sql) => [
    sql`
      insert into app.recipe (recipe_id, owner_id, kind, title, description, cuisine,
                              servings, prep_minutes, cook_minutes, notes)
      values (${recipeId}, ${userId}, 'private', ${input.title}, ${input.description}, ${input.cuisine},
              ${input.servings}, ${input.prepMinutes}, ${input.cookMinutes}, ${input.notes})`,
    insertIngredients(sql, userId, recipeId, ingredients),
    insertSteps(sql, userId, recipeId, input.steps),
    ...setTags(sql, userId, recipeId, input.tags),
  ])
  return recipeId
}

// --- The Library list (REQ-10.1–10.6) ------------------------------------------

export const LIBRARY_SORTS = ['modified', 'added', 'title'] as const // REQ-10.3
export type LibrarySort = (typeof LIBRARY_SORTS)[number]
export const LIBRARY_SORT_LABELS: Record<LibrarySort, string> = {
  modified: 'Last changed',
  added: 'Date added',
  title: 'Title (A–Z)',
}

export type LibraryQuery = { q: string; tag: string; sort: LibrarySort }

type Params = Record<string, string | string[] | undefined>
const firstParam = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ''

/** Read ?q=…&tag=…&sort=… from the Library address. Never throws. */
export function parseLibraryQuery(params: Params): LibraryQuery {
  const q = firstParam(params.q).replace(/\s+/g, ' ').trim().slice(0, 200)
  const tag = firstParam(params.tag).replace(/\s+/g, ' ').trim().slice(0, 40)
  const sortParam = firstParam(params.sort)
  const sort = (LIBRARY_SORTS as readonly string[]).includes(sortParam) ? (sortParam as LibrarySort) : 'modified'
  return { q, tag, sort }
}

/** The /library address for a search, with some parts changed. Defaults are left out. */
export function libraryHref(query: LibraryQuery, changes: Partial<LibraryQuery> = {}): string {
  const next = { ...query, ...changes }
  const params = new URLSearchParams()
  if (next.q) params.set('q', next.q)
  if (next.tag) params.set('tag', next.tag)
  if (next.sort !== 'modified') params.set('sort', next.sort)
  const text = params.toString()
  return text ? `/library?${text}` : '/library'
}

/** A LIKE pattern that matches the text anywhere, with % and _ taken literally. */
export function likePattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
}

export type LibraryItem = {
  recipeId: string
  kind: 'saved_copy' | 'private'
  title: string
  cuisine: string | null
  tags: string[]
  modified: boolean
  createdAt: string
  updatedAt: string
}

export type Library = LibraryUsage & {
  items: LibraryItem[] // the recipes matching the search, in the chosen order
  tags: { name: string; count: number }[] // the user's tags that are on at least one recipe
}

/**
 * The user's Library (REQ-10.1–10.3, 10.6): every saved copy and private recipe,
 * searched by title, ingredient, or tag, filtered by one tag, and sorted.
 * One request to the database (NFR-5).
 */
export async function getLibrary(userId: string, query: LibraryQuery): Promise<Library> {
  const q = query.q || null
  const pattern = q ? likePattern(q) : null
  const tag = query.tag || null
  const [usage, items, tags] = await asUser(userId, (sql) => [
    usageQuery(sql, userId),
    sql`
      select r.recipe_id, r.kind, r.title, r.cuisine, r.created_at, r.updated_at,
             (r.kind = 'saved_copy' and r.content_hash is distinct from r.source_hash) as modified,
             coalesce((select array_agg(t.name order by lower(t.name))
                       from app.recipe_tag rt join app.tag t using (tag_id, owner_id)
                       where rt.recipe_id = r.recipe_id and rt.owner_id = r.owner_id), '{}') as tags
      from app.recipe r
      where r.owner_id = ${userId}
        and (${pattern}::text is null
             or r.title ilike ${pattern}::text
             or exists (select 1 from app.recipe_ingredient i
                        where i.recipe_id = r.recipe_id and i.owner_id = r.owner_id
                          and (i.name ilike ${pattern}::text or i.raw_text ilike ${pattern}::text))
             or exists (select 1 from app.recipe_tag rt join app.tag t using (tag_id, owner_id)
                        where rt.recipe_id = r.recipe_id and rt.owner_id = r.owner_id
                          and t.name ilike ${pattern}::text))
        and (${tag}::text is null
             or exists (select 1 from app.recipe_tag rt join app.tag t using (tag_id, owner_id)
                        where rt.recipe_id = r.recipe_id and rt.owner_id = r.owner_id
                          and lower(t.name) = lower(${tag}::text)))
      order by
        case when ${query.sort} = 'title' then lower(r.title) end,
        case when ${query.sort} = 'added' then r.created_at end desc,
        case when ${query.sort} = 'modified' then r.updated_at end desc,
        lower(r.title), r.recipe_id`,
    sql`
      select t.name, count(*)::int as count
      from app.tag t join app.recipe_tag rt using (tag_id, owner_id)
      where t.owner_id = ${userId}
      group by t.name
      order by lower(t.name)`,
  ])
  return {
    ...toUsage(usage[0]),
    items: items.map((r) => ({
      recipeId: r.recipe_id,
      kind: r.kind,
      title: r.title,
      cuisine: r.cuisine,
      tags: r.tags ?? [],
      modified: r.modified,
      createdAt: new Date(r.created_at).toISOString(),
      updatedAt: new Date(r.updated_at).toISOString(),
    })),
    tags: tags.map((t) => ({ name: t.name, count: t.count })),
  }
}

// --- Delete (REQ-5.1–5.5) ------------------------------------------------------

const MAX_DELETE = 200

function cleanIds(ids: string[]): string[] {
  return [...new Set(ids.filter(isUuid).map((id) => id.toLowerCase()))].slice(0, MAX_DELETE)
}

/** Titles of the given recipes that are the user's, for the confirmation page (REQ-5.2). */
export async function getRecipesByIds(
  userId: string,
  ids: string[],
): Promise<{ recipeId: string; title: string; kind: 'saved_copy' | 'private' }[]> {
  const wanted = cleanIds(ids)
  if (!wanted.length) return []
  const [rows] = await asUser(userId, (sql) => [
    sql`
      select recipe_id, title, kind from app.recipe
      where owner_id = ${userId} and recipe_id = any(${wanted}::uuid[])
      order by lower(title)`,
  ])
  return rows.map((r) => ({ recipeId: r.recipe_id, title: r.title, kind: r.kind }))
}

/**
 * Permanently delete the given recipes, with their ingredients, steps, and tags
 * (REQ-5.1, 5.4, 5.5). Only the user's own are touched; other ids are ignored.
 * Catalog recipes are never affected (REQ-5.3). Returns how many were deleted.
 * (Deleting stored photos comes with the photos issue in M3.)
 */
export async function deleteRecipes(userId: string, ids: string[]): Promise<number> {
  const wanted = cleanIds(ids)
  if (!wanted.length) return 0
  const [deleted] = await asUser(userId, (sql) => [
    sql`
      delete from app.recipe
      where owner_id = ${userId} and recipe_id = any(${wanted}::uuid[])
      returning recipe_id`,
  ])
  return deleted.length
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
