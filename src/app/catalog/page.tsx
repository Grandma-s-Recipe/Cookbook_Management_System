// Catalog list (M1 version): titles and source sites, read with the read-only role.
// Search, filters, sorting, paging, and thumbnails come in M2 (REQ-1.1 to 1.9).

import type { Metadata } from 'next'
import { Suspense } from 'react'
import { connection } from 'next/server'
import { catalogDb } from '@/lib/db'

export const metadata: Metadata = { title: 'Catalog' }

export default function CatalogPage() {
  return (
    <section>
      <h1>Catalog</h1>
      <Suspense fallback={<p>Loading recipes…</p>}>
        <CatalogList />
      </Suspense>
    </section>
  )
}

async function CatalogList() {
  await connection() // read fresh on every visit

  let recipes: Record<string, string>[]
  try {
    recipes = (await catalogDb()`
      select catalog_id, title, cuisine, source_site, source_url
      from catalog.recipe
      where status = 'active'
      order by title
      limit 20`) as Record<string, string>[]
  } catch (err) {
    console.error('Catalog query failed:', err)
    // NFR-24 / UC-1 A2: problem, cause, action, and a retry.
    return (
      <div className="notice notice-error" role="alert">
        <p>The catalog couldn’t be loaded. The recipe database didn’t respond.</p>
        <p><a href="/catalog">Try again</a> in a moment.</p>
      </div>
    )
  }

  if (!recipes.length) {
    return <p>The catalog is empty. An admin needs to load the starting recipes (npm run db:seed).</p>
  }

  return (
    <ul className="recipe-list">
      {recipes.map((r) => (
        <li key={r.catalog_id} className="recipe-card">
          <h2>{r.title}</h2>
          <p className="meta">
            {r.cuisine && <span>{r.cuisine} · </span>}
            {/* BR-8: always show the source; link it when it's a real web page. */}
            Source:{' '}
            {/^https?:\/\//.test(r.source_url) ? (
              <a href={r.source_url} rel="noopener noreferrer" target="_blank">{r.source_site}</a>
            ) : (
              r.source_site
            )}
          </p>
        </li>
      ))}
    </ul>
  )
}
