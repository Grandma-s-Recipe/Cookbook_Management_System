// Recipe Library service: the user's own saved copies and private recipes
// (SRS §4.2, §4.3, §4.10). Everything here goes through asUser(), so row-level
// security limits it to the logged-in user's rows (NFR-13, BR-9; decision 21).
//
// Save a copy, editing, the Library list, and delete are added by their own issues.

import { asUser, isUuid } from '@/lib/db'
import { toIngredientLine } from '@/lib/catalog'
import type { RecipeView } from '@/lib/recipes/view'

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
             source_site, source_url, source_hash, content_hash
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
  }
}
