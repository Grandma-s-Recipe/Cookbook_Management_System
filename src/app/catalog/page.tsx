// Catalog search (SRS §4.1 · REQ-1.1–1.4, 1.6, 1.7). Works without an account.
// The search lives in the address (?q=…&cuisine=…&tag=…&sort=…&page=…), so the
// form is a plain GET form that works without JavaScript, and Back/Forward work.
// Thumbnails (REQ-1.9) come with the Recipe photos issue in M3.

import type { Metadata } from 'next'
import Form from 'next/form'
import Link from 'next/link'
import { Suspense } from 'react'
import {
  catalogHref,
  hasFilters,
  isWebLink,
  PAGE_SIZE,
  parseCatalogQuery,
  searchCatalog,
  SORT_LABELS,
  SORTS,
  type CatalogQuery,
  type CatalogResult,
  type CatalogSearch,
} from '@/lib/catalog'

export const metadata: Metadata = { title: 'Search recipes' }

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export default function CatalogPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <section>
      <h1>Search recipes</h1>
      <Suspense fallback={<p>Loading recipes…</p>}>
        <CatalogContent searchParams={searchParams} />
      </Suspense>
    </section>
  )
}

async function CatalogContent({ searchParams }: { searchParams: SearchParams }) {
  const query = parseCatalogQuery(await searchParams) // reading searchParams makes this fresh on every visit

  let search: CatalogSearch
  try {
    search = await searchCatalog(query)
  } catch (err) {
    console.error('Catalog search failed:', err)
    // NFR-24 / UC-1 A2: problem, cause, action, and a retry.
    return (
      <div className="notice notice-error" role="alert">
        <p>The catalog couldn’t be loaded. The recipe database didn’t respond.</p>
        <p>
          <a href={catalogHref(query, { page: query.page })}>Try again</a> in a moment.
        </p>
      </div>
    )
  }

  return (
    <>
      <SearchForm query={query} search={search} />
      <ActiveFilters query={query} />
      <Results query={query} search={search} />
    </>
  )
}

function SearchForm({ query, search }: { query: CatalogQuery; search: CatalogSearch }) {
  return (
    // key: start fresh when the search changes (for example after "Remove"), so the
    // boxes always match the address.
    <Form action="/catalog" className="search-form" role="search" key={catalogHref(query)}>
      <div className="search-row">
        <label htmlFor="q" className="visually-hidden">Search recipes</label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={query.q}
          placeholder="Search by title, cuisine, or description"
          maxLength={200}
        />
        <button type="submit">Search</button>
      </div>

      <div className="filter-row">
        <div className="field">
          <label htmlFor="cuisine">Cuisine</label>
          <select id="cuisine" name="cuisine" defaultValue={query.cuisine}>
            <option value="">All cuisines</option>
            {search.cuisines.map((c) => (
              <option key={c.value} value={c.value}>
                {c.value} ({c.count})
              </option>
            ))}
            {/* Keep a cuisine from the address selectable even if no recipe has it any more. */}
            {query.cuisine && !search.cuisines.some((c) => c.value === query.cuisine) && (
              <option value={query.cuisine}>{query.cuisine} (0)</option>
            )}
          </select>
        </div>

        <div className="field">
          <label htmlFor="sort">Sort by</label>
          <select id="sort" name="sort" defaultValue={query.sort}>
            {SORTS.map((s) => (
              <option key={s} value={s}>
                {SORT_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {search.tags.length > 0 && (
        <details className="tag-filter" open={query.tags.length > 0}>
          <summary>
            Tags{query.tags.length > 0 && ` (${query.tags.length} selected)`}
          </summary>
          <fieldset>
            <legend className="hint">Show recipes that have every tag you tick.</legend>
            <ul className="tag-options">
              {search.tags.map((t) => (
                <li key={t.value}>
                  <label className="checkbox">
                    <input type="checkbox" name="tag" value={t.value} defaultChecked={query.tags.includes(t.value)} />
                    {t.value} <span className="count">({t.count})</span>
                  </label>
                </li>
              ))}
            </ul>
            <button type="submit">Apply tags</button>
          </fieldset>
        </details>
      )}
    </Form>
  )
}

/** The search words and filters in use, each with a Remove link. */
function ActiveFilters({ query }: { query: CatalogQuery }) {
  if (!hasFilters(query)) return null
  return (
    <div className="active-filters">
      <span className="hint">Showing:</span>
      <ul>
        {query.q && (
          <li>
            “{query.q}”{' '}
            <Link href={catalogHref(query, { q: '' })} aria-label={`Remove search words ${query.q}`}>Remove</Link>
          </li>
        )}
        {query.cuisine && (
          <li>
            Cuisine: {query.cuisine}{' '}
            <Link href={catalogHref(query, { cuisine: '' })} aria-label={`Remove cuisine filter ${query.cuisine}`}>Remove</Link>
          </li>
        )}
        {query.tags.map((tag) => (
          <li key={tag}>
            Tag: {tag}{' '}
            <Link href={catalogHref(query, { tags: query.tags.filter((t) => t !== tag) })} aria-label={`Remove tag filter ${tag}`}>
              Remove
            </Link>
          </li>
        ))}
      </ul>
      <Link href="/catalog">Clear all</Link>
    </div>
  )
}

function Results({ query, search }: { query: CatalogQuery; search: CatalogSearch }) {
  const { results, total, pageCount } = search

  if (results.length === 0) {
    // Asked for a page past the end, e.g. from an old bookmark.
    if (query.page > 1) {
      return (
        <p className="notice" role="status">
          There are no results on page {query.page}.{' '}
          <Link href={catalogHref(query, { page: 1 })}>Go to the first page</Link>.
        </p>
      )
    }
    if (!hasFilters(query)) {
      return <p>The catalog is empty. An admin needs to load the starting recipes (npm run db:seed).</p>
    }
    return <NoResults query={query} />
  }

  const from = (query.page - 1) * PAGE_SIZE + 1
  const to = from + results.length - 1

  return (
    <>
      <p className="result-count" role="status">
        {total === 1 ? '1 recipe' : `Showing ${from}–${to} of ${total} recipes`}
        {query.q && query.sort === 'relevance' && ', best match first'}
      </p>
      <ul className="recipe-list">
        {results.map((r) => (
          <ResultCard key={r.catalogId} recipe={r} />
        ))}
      </ul>
      {pageCount > 1 && <Pagination query={query} pageCount={pageCount} />}
    </>
  )
}

/** REQ-1.7: say so, and suggest removing filters. */
function NoResults({ query }: { query: CatalogQuery }) {
  const filters = Boolean(query.cuisine || query.tags.length)
  return (
    <div className="no-results" role="status">
      <h2>No recipes match your search</h2>
      {filters ? (
        <>
          <p>Try removing a filter:</p>
          <ul>
            {query.cuisine && (
              <li>
                <Link href={catalogHref(query, { cuisine: '' })}>Search all cuisines instead of {query.cuisine}</Link>
              </li>
            )}
            {query.tags.map((tag) => (
              <li key={tag}>
                <Link href={catalogHref(query, { tags: query.tags.filter((t) => t !== tag) })}>
                  Remove the “{tag}” tag
                </Link>
              </li>
            ))}
            <li>
              <Link href={catalogHref({ ...query, cuisine: '', tags: [] })}>Remove all filters</Link>
              {query.q && ' and keep your search words'}
            </li>
          </ul>
        </>
      ) : (
        <p>
          Check the spelling, try fewer or different words, or <Link href="/catalog">browse all recipes</Link>.
        </p>
      )}
    </div>
  )
}

function ResultCard({ recipe: r }: { recipe: CatalogResult }) {
  return (
    <li className="recipe-card">
      <h2>
        <Link href={`/recipe/${r.catalogId}`}>{r.title}</Link>
      </h2>
      <p className="meta">
        {r.cuisine && <span>{r.cuisine} · </span>}
        {/* REQ-1.4, BR-8: always show the source; link it when it's a real web page. */}
        Source:{' '}
        {isWebLink(r.sourceUrl) ? (
          <a href={r.sourceUrl} rel="noopener noreferrer" target="_blank">
            {r.sourceSite}
            <span className="visually-hidden"> (opens in a new tab)</span>
          </a>
        ) : (
          r.sourceSite
        )}
      </p>
      {r.tags.length > 0 && (
        <ul className="tag-list" aria-label="Tags">
          {r.tags.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      )}
    </li>
  )
}

function Pagination({ query, pageCount }: { query: CatalogQuery; pageCount: number }) {
  const { page } = query
  return (
    <nav className="pagination" aria-label="Result pages">
      {page > 1 ? (
        <Link href={catalogHref(query, { page: page - 1 })} rel="prev">← Previous</Link>
      ) : (
        <span aria-hidden="true" />
      )}
      <span>
        Page {page} of {pageCount}
      </span>
      {page < pageCount ? (
        <Link href={catalogHref(query, { page: page + 1 })} rel="next">Next →</Link>
      ) : (
        <span aria-hidden="true" />
      )}
    </nav>
  )
}
