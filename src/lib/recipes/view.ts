// What a recipe page shows. Catalog recipes, saved copies, and private recipes
// all become a RecipeView, so they share one page layout (REQ-1.5).

export type RecipeKind = 'catalog' | 'saved_copy' | 'private'

export type IngredientLine = {
  position: number
  quantity: string | null // numeric columns come back from the database as strings
  quantityMax: string | null
  unit: string | null
  name: string | null
  note: string | null
  rawText: string // the whole line as written, e.g. "1.5-2 lb tomatoes, chopped"
}

export type RecipeView = {
  id: string // catalog_id for catalog recipes, recipe_id for the user's own
  kind: RecipeKind
  title: string
  description: string | null
  cuisine: string | null
  servings: number | null
  prepMinutes: number | null
  cookMinutes: number | null
  tags: string[]
  notes: string | null // the user's own recipes only
  source: { site: string; url: string } | null // catalog recipes and saved copies (BR-8)
  ingredients: IngredientLine[]
  steps: string[]
  modified: boolean // saved copies changed since saving (REQ-2.3)
}

/** "45 min", "1 hr", "1 hr 15 min". Null for no time. */
export function formatMinutes(minutes: number | null): string | null {
  if (minutes === null || !Number.isFinite(minutes) || minutes < 0) return null
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`
}

/** Prep plus cook time, when there is at least one of them. */
export function totalMinutes(r: Pick<RecipeView, 'prepMinutes' | 'cookMinutes'>): number | null {
  if (r.prepMinutes === null && r.cookMinutes === null) return null
  return (r.prepMinutes ?? 0) + (r.cookMinutes ?? 0)
}
