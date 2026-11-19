// Catalog Service: search, filter, sort, and page the public catalog
// (SRS §4.1 · REQ-1.1–1.4, 1.6, 1.7 · NFR-1, NFR-7).
//
// Reads only through catalogDb() (the read-only catalog_reader role), which has
// no access to the app schema, so private recipes and saved copies can never
// show up here (NFR-17, REQ-1.8).
//
// The page's address holds the whole search, so results can be bookmarked,
// shared, and opened in a new tab:
//   /catalog?q=chicken&cuisine=Indian&tag=quick&tag=one-pot&sort=newest&page=2

import { catalogDb, isUuid } from '@/lib/db'
import type { IngredientLine, RecipeView } from '@/lib/recipes/view'

export const PAGE_SIZE = 20 // REQ-1.1
export const SORTS = ['relevance', 'newest', 'title'] as const // REQ-1.6
export type Sort = (typeof SORTS)[number]

export const SORT_LABELS: Record<Sort, string> = {
  relevance: 'Best match',
  newest: 'Newest',
  title: 'Title (A–Z)',
}

// Limits on what we accept from the address bar.
const MAX_QUERY = 200
const MAX_CUISINE = 60
const MAX_TAG = 40
const MAX_TAGS = 10
const MAX_PAGE = 1000

export type CatalogQuery = {
  q: string // '' = no search words
  cuisine: string // '' = all cuisines
  tags: string[] // a recipe must have every one
  sort: Sort
  page: number // starts at 1
}

type Params = Record<string, string | string[] | undefined>

function all(value: string | string[] | undefined): string[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value]
}

function clean(value: string, max: number): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max)
}

/** Turn the page's ?query=values into a safe, valid search. Never throws. */
export function parseCatalogQuery(params: Params): CatalogQuery {
  const q = clean(all(params.q)[0] ?? '', MAX_QUERY)
  const cuisine = clean(all(params.cuisine)[0] ?? '', MAX_CUISINE)

  const tags: string[] = []
  for (const raw of all(params.tag)) {
    const tag = clean(raw, MAX_TAG).toLowerCase()
    if (tag && !tags.includes(tag) && tags.length < MAX_TAGS) tags.push(tag)
  }

  const sortParam = all(params.sort)[0] ?? ''
  const sort: Sort = (SORTS as readonly string[]).includes(sortParam) ? (sortParam as Sort) : 'relevance'

  const pageNumber = Number.parseInt(all(params.page)[0] ?? '', 10)
  const page = Number.isFinite(pageNumber) ? Math.min(Math.max(pageNumber, 1), MAX_PAGE) : 1

  return { q, cuisine, tags, sort, page }
}

/**
 * The /catalog address for a search, with some parts changed. Changing anything
 * but the page goes back to page 1. Default values are left out, to keep it short.
 */
export function catalogHref(query: CatalogQuery, changes: Partial<CatalogQuery> = {}): string {
  const next: CatalogQuery = { ...query, page: 1, ...changes }
  const params = new URLSearchParams()
  if (next.q) params.set('q', next.q)
  if (next.cuisine) params.set('cuisine', next.cuisine)
  for (const tag of next.tags) params.append('tag', tag)
  if (next.sort !== 'relevance') params.set('sort', next.sort)
  if (next.page > 1) params.set('page', String(next.page))
  const text = params.toString()
  return text ? `/catalog?${text}` : '/catalog'
}

/** True when any search words or filters are in use. */
export function hasFilters(query: CatalogQuery): boolean {
  return Boolean(query.q || query.cuisine || query.tags.length)
}

export type CatalogResult = {
  catalogId: string
  title: string
  cuisine: string | null
  tags: string[]
  sourceSite: string
  sourceUrl: string
}

export type FilterOption = { value: string; count: number }

export type CatalogSearch = {
  results: CatalogResult[]
  total: number // matching recipes on all pages (0 when the page is past the end)
  pageCount: number
  cuisines: FilterOption[]
  tags: FilterOption[] // the most used tags, plus any that are selected
}

const TAG_OPTIONS = 40
const TYPO_THRESHOLD = '0.5'

/**
 * Search the catalog (REQ-1.2). One request to the database, which runs the
 * results page, the cuisines, and the tags for the filters in one transaction.
 *
 * Matching: full-text search on the title, cuisine, and description, OR a title
 * that is close to the words typed, so typos still match ("chiken cury").
 * "Best match" ranks by both. With no search words, "Best match" falls back to
 * title order.
 */
export async function searchCatalog(query: CatalogQuery): Promise<CatalogSearch> {
  const sql = catalogDb()
  const q = query.q || null
  const cuisine = query.cuisine || null
  const offset = (query.page - 1) * PAGE_SIZE

  const [, rows, cuisineRows, tagRows] = await sql.transaction([
    // How close a title must be to count as a typo match (0 to 1; pg_trgm's default
    // is 0.6). 0.5 lets two typos through, like "chiken cury" for "Chicken Curry".
    sql`select set_config('pg_trgm.word_similarity_threshold', ${TYPO_THRESHOLD}, true)`,
    sql`
      with p as (select websearch_to_tsquery('english', coalesce(${q}::text, '')) as tsq),
      matches as (
        select r.catalog_id, r.title, r.cuisine, r.tags, r.source_site, r.source_url, r.parsed_at,
               case when ${q}::text is null then null
                    else ts_rank_cd(r.search_vector, p.tsq) + word_similarity(${q}::text, r.title) end as rank
        from catalog.recipe r cross join p
        where r.status = 'active'
          and (${cuisine}::text is null or r.cuisine = ${cuisine}::text)
          and (cardinality(${query.tags}::text[]) = 0 or r.tags @> ${query.tags}::text[])
          and (${q}::text is null or r.search_vector @@ p.tsq or ${q}::text <% r.title)
      )
      select catalog_id, title, cuisine, tags, source_site, source_url,
             count(*) over () as total
      from matches
      order by
        case when ${query.sort} = 'relevance' then rank end desc nulls last,
        case when ${query.sort} = 'newest' then parsed_at end desc nulls last,
        lower(title), catalog_id
      limit ${PAGE_SIZE} offset ${offset}`,
    sql`
      select cuisine as value, count(*)::int as count
      from catalog.recipe
      where status = 'active' and cuisine is not null and trim(cuisine) <> ''
      group by cuisine
      order by lower(cuisine)`,
    sql`
      select tag as value, count(*)::int as count
      from catalog.recipe, unnest(tags) as tag
      where status = 'active'
      group by tag
      order by (tag = any(${query.tags}::text[])) desc, count(*) desc, tag
      limit ${TAG_OPTIONS + query.tags.length}`,
  ])

  const total = rows.length ? Number(rows[0].total) : 0
  // Selected tags come first in the query, so they're always included; then show A–Z.
  const tags = [...(tagRows as FilterOption[])].sort((a, b) => a.value.localeCompare(b.value))

  return {
    results: rows.map((r) => ({
      catalogId: r.catalog_id,
      title: r.title,
      cuisine: r.cuisine,
      tags: r.tags ?? [],
      sourceSite: r.source_site,
      sourceUrl: r.source_url,
    })),
    total,
    pageCount: Math.ceil(total / PAGE_SIZE),
    cuisines: cuisineRows as FilterOption[],
    tags,
  }
}

/** True for a real web address; team-written recipes have "forkful-team:…" instead (decision 17). */
export function isWebLink(url: string): boolean {
  return /^https?:\/\//i.test(url)
}

/**
 * One active catalog recipe with its ingredients and steps, for the recipe page
 * (REQ-1.5). Null when the id is malformed, unknown, or the recipe was removed.
 */
export async function getCatalogRecipe(id: string): Promise<RecipeView | null> {
  if (!isUuid(id)) return null
  const sql = catalogDb()
  const [rows, ingredients, steps] = await sql.transaction([
    sql`
      select catalog_id, title, description, cuisine, tags, servings, prep_minutes, cook_minutes,
             source_site, source_url
      from catalog.recipe
      where catalog_id = ${id} and status = 'active'`,
    sql`
      select position, quantity, quantity_max, unit, name, note, raw_text
      from catalog.recipe_ingredient
      where catalog_id = ${id}
      order by position`,
    sql`select text from catalog.recipe_step where catalog_id = ${id} order by position`,
  ])
  const r = rows[0]
  if (!r) return null
  return {
    id: r.catalog_id,
    kind: 'catalog',
    title: r.title,
    description: r.description,
    cuisine: r.cuisine,
    servings: r.servings,
    prepMinutes: r.prep_minutes,
    cookMinutes: r.cook_minutes,
    tags: r.tags ?? [],
    notes: null,
    source: { site: r.source_site, url: r.source_url },
    ingredients: ingredients.map(toIngredientLine),
    steps: steps.map((s) => s.text),
    modified: false,
  }
}

/** A database ingredient row as an IngredientLine (used for catalog and user recipes). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toIngredientLine(row: Record<string, any>): IngredientLine {
  return {
    position: row.position,
    quantity: row.quantity,
    quantityMax: row.quantity_max,
    unit: row.unit,
    name: row.name,
    note: row.note,
    rawText: row.raw_text,
  }
}
