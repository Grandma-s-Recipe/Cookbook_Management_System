// My Library (SRS §4.10 · REQ-10.1–10.6 · NFR-5), plus choosing recipes to delete (REQ-5.4).
// Only for logged-in users; others are sent to log in.
// Thumbnails (REQ-10.7) come with the Recipe photos issue in M3.

import type { Metadata } from 'next'
import Form from 'next/form'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { getCurrentUser } from '@/lib/auth/session'
import {
  getLibrary,
  LIBRARY_SORT_LABELS,
  LIBRARY_SORTS,
  libraryFullMessage,
  libraryHref,
  parseLibraryQuery,
  type Library,
  type LibraryItem,
  type LibraryQuery,
} from '@/lib/library'

export const metadata: Metadata = { title: 'My Library' }

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export default function LibraryPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <section>
      <h1>My Library</h1>
      <Suspense fallback={<p>Loading your recipes…</p>}>
        <LibraryContent searchParams={searchParams} />
      </Suspense>
    </section>
  )
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago' })
}

async function LibraryContent({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const user = await getCurrentUser()
  if (!user) redirect(`/login?next=${encodeURIComponent('/library')}`)

  const query = parseLibraryQuery(params)
  const deleted = Number.parseInt(String(params.deleted ?? ''), 10)

  let library: Library
  try {
    library = await getLibrary(user.userId, query)
  } catch (err) {
    console.error('Library failed:', err)
    // NFR-24: problem, cause, action, and a retry.
    return (
      <div className="notice notice-error" role="alert">
        <p>Your Library couldn’t be loaded. The recipe database didn’t respond.</p>
        <p>
          <a href={libraryHref(query)}>Try again</a> in a moment.
        </p>
      </div>
    )
  }

  const searching = Boolean(query.q || query.tag)

  return (
    <>
      {params.deleteFailed === '1' && (
        <p className="notice notice-error" role="alert">
          Nothing was deleted. The recipe database didn’t respond. Please try again in a moment.
        </p>
      )}
      {deleted > 0 && (
        <p className="notice notice-ok" role="status">
          {deleted === 1 ? '1 recipe was' : `${deleted} recipes were`} deleted.
        </p>
      )}

      <Usage library={library} />

      {library.used === 0 ? (
        <EmptyLibrary full={library.full} />
      ) : (
        <>
          <SearchForm query={query} library={library} />
          {library.items.length === 0 ? (
            <div className="no-results" role="status">
              <h2>No recipes in your Library match</h2>
              <p>
                Try other words, or <Link href={libraryHref({ q: '', tag: '', sort: query.sort })}>show all your recipes</Link>.
              </p>
            </div>
          ) : (
            <RecipeList items={library.items} searching={searching} total={library.used} />
          )}
        </>
      )}
    </>
  )
}

/** REQ-10.6: how many of the 100 recipes are used, with a warning near the limit. */
function Usage({ library }: { library: Library }) {
  const { used, cap, full, nearlyFull } = library
  const limit = Number.isFinite(cap) ? ` of ${cap}` : ''
  return (
    <div className="library-bar">
      {full ? (
        <p className="notice" role="status">
          {libraryFullMessage(cap)} Delete recipes you don’t need to make room for new ones.
        </p>
      ) : nearlyFull ? (
        <p className="notice" role="status">
          You’re using {used}{limit} recipes, close to the limit. Delete recipes you don’t need to keep room for new ones.
        </p>
      ) : (
        <p className="hint">
          You’re using {used}{limit} recipes.
        </p>
      )}
      <p className="actions">
        {!full && <Link href="/recipe/new" className="button-link">New private recipe</Link>}
        <Link href="/catalog">Browse the catalog</Link>
      </p>
    </div>
  )
}

/** REQ-10.5 */
function EmptyLibrary({ full }: { full: boolean }) {
  return (
    <div className="no-results">
      <h2>Your Library is empty</h2>
      <p>
        Find a recipe in the <Link href="/catalog">catalog</Link> and click Save a Copy, or type in one of your own with{' '}
        {full ? 'New private recipe' : <Link href="/recipe/new">New private recipe</Link>}. Everything in your Library is
        visible only to you.
      </p>
    </div>
  )
}

function SearchForm({ query, library }: { query: LibraryQuery; library: Library }) {
  return (
    <Form action="/library" className="search-form" role="search" key={libraryHref(query)}>
      <div className="search-row">
        <label htmlFor="library-q" className="visually-hidden">Search my Library</label>
        <input id="library-q" name="q" type="search" defaultValue={query.q} placeholder="Search by title, ingredient, or tag" maxLength={200} />
        <button type="submit">Search</button>
      </div>
      <div className="filter-row">
        {library.tags.length > 0 && (
          <div className="field">
            <label htmlFor="library-tag">Tag</label>
            <select id="library-tag" name="tag" defaultValue={query.tag}>
              <option value="">All tags</option>
              {library.tags.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name} ({t.count})
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="field">
          <label htmlFor="library-sort">Sort by</label>
          <select id="library-sort" name="sort" defaultValue={query.sort}>
            {LIBRARY_SORTS.map((s) => (
              <option key={s} value={s}>
                {LIBRARY_SORT_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      </div>
      {(query.q || query.tag) && (
        <p className="hint">
          <Link href={libraryHref({ q: '', tag: '', sort: query.sort })}>Clear search</Link>
        </p>
      )}
    </Form>
  )
}

/**
 * REQ-10.1, plus checkboxes to delete several at once (REQ-5.4). The Delete button
 * goes to a confirmation page first (REQ-5.2), so this works without JavaScript.
 */
function RecipeList({ items, searching, total }: { items: LibraryItem[]; searching: boolean; total: number }) {
  return (
    <form action="/library/delete" method="get" className="library-list">
      <p className="result-count" role="status">
        {searching ? `${items.length} of your ${total} recipes match` : items.length === 1 ? '1 recipe' : `${items.length} recipes`}
      </p>
      <input type="hidden" name="from" value="library" />
      <ul className="library-items">
        {items.map((r) => (
          <li key={r.recipeId} className="library-item">
            <input type="checkbox" name="id" value={r.recipeId} id={`select-${r.recipeId}`} />
            <label htmlFor={`select-${r.recipeId}`} className="visually-hidden">
              Select {r.title}
            </label>
            <div>
              <h2>
                <Link href={`/recipe/${r.recipeId}`}>{r.title}</Link>
              </h2>
              <p className="recipe-labels">
                <span className="label">{r.kind === 'saved_copy' ? 'Saved copy' : 'Private'}</span>
                {r.modified && <span className="label label-modified">Modified</span>}
                {r.cuisine && <span className="hint">{r.cuisine}</span>}
                <span className="hint">Changed {shortDate(r.updatedAt)}</span>
              </p>
              {r.tags.length > 0 && (
                <ul className="tag-list" aria-label="Tags">
                  {r.tags.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        ))}
      </ul>
      <button type="submit" className="secondary">Delete selected…</button>
      <p className="hint">Tick the recipes to delete. You’ll be asked to confirm first.</p>
    </form>
  )
}
