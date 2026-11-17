// Loads db/seed.json into the catalog (REQ-1.10).
//
//   npm run db:seed
//
// Connects as catalog_writer (DATABASE_URL_CATALOG_WRITE in .env.local).
// Safe to run again: recipes whose source_url is already in the catalog are skipped,
// so it only adds new ones. To change a recipe that is already loaded, edit it in the
// database (or delete it there) and run this again.

import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { neon } from '@neondatabase/serverless'
import { validateSeed, buildRawText, sourceUrl, sourceSite } from './lib/seed-validate.mjs'

const url = process.env.DATABASE_URL_CATALOG_WRITE
if (!url) {
  console.error('DATABASE_URL_CATALOG_WRITE is missing from .env.local.')
  console.error('Add the catalog_writer connection string and try again.')
  process.exit(1)
}

const data = JSON.parse(await readFile(new URL('../db/seed.json', import.meta.url), 'utf8'))

const problems = validateSeed(data)
if (problems.length) {
  console.error(`db/seed.json has ${problems.length} problem(s); nothing was loaded:`)
  for (const p of problems) console.error(`  - ${p}`)
  process.exit(1)
}

const sql = neon(url)
let added = 0
let skipped = 0

for (const r of data.recipes) {
  const src = sourceUrl(r)
  const existing = await sql`select 1 from catalog.recipe where source_url = ${src}`
  if (existing.length) {
    skipped++
    continue
  }

  const id = randomUUID()
  const ing = r.ingredients

  // One transaction per recipe: the recipe, its ingredients, and its steps all go in, or none do.
  await sql.transaction([
    sql`insert into catalog.recipe
          (catalog_id, title, description, cuisine, tags, servings, prep_minutes, cook_minutes,
           source_url, source_site)
        values
          (${id}, ${r.title}, ${r.description ?? null}, ${r.cuisine ?? null}, ${r.tags ?? []}::text[],
           ${r.servings ?? null}, ${r.prep_minutes ?? null}, ${r.cook_minutes ?? null},
           ${src}, ${sourceSite(r)})`,

    sql`insert into catalog.recipe_ingredient
          (catalog_id, position, quantity, quantity_max, unit, name, note, raw_text)
        select ${id}, t.*
        from unnest(
          ${ing.map((_, i) => i + 1)}::int[],
          ${ing.map((x) => x.quantity ?? null)}::numeric[],
          ${ing.map((x) => x.quantity_max ?? null)}::numeric[],
          ${ing.map((x) => x.unit ?? null)}::text[],
          ${ing.map((x) => x.name)}::text[],
          ${ing.map((x) => x.note ?? null)}::text[],
          ${ing.map((x) => x.raw_text ?? buildRawText(x))}::text[]
        ) as t`,

    sql`insert into catalog.recipe_step (catalog_id, position, text)
        select ${id}, t.*
        from unnest(
          ${r.steps.map((_, i) => i + 1)}::int[],
          ${r.steps}::text[]
        ) as t`,
  ])
  added++
  console.log(`  added: ${r.title}`)
}

const [{ count }] = await sql`select count(*)::int as count from catalog.recipe`
console.log(`Done. Added ${added}, skipped ${skipped} already loaded. The catalog now has ${count} recipes.`)
