// Confirm deleting recipes: /library/delete?id=…&id=… (REQ-5.1–5.5).
// Reached from the Library's checkboxes (several at once, REQ-5.4) or a recipe's
// Delete link (one). Nothing is deleted until the user confirms here (REQ-5.2).

import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { getCurrentUser } from '@/lib/auth/session'
import { getRecipesByIds } from '@/lib/library'
import { deleteRecipesAction } from './actions'

export const metadata: Metadata = { title: 'Delete recipes' }

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export default function DeletePage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <section className="narrow">
      <Suspense fallback={<p>Loading…</p>}>
        <DeleteContent searchParams={searchParams} />
      </Suspense>
    </section>
  )
}

async function DeleteContent({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const ids = params.id === undefined ? [] : Array.isArray(params.id) ? params.id : [params.id]
  const fromLibrary = params.from === 'library'

  const user = await getCurrentUser()
  if (!user) redirect(`/login?next=${encodeURIComponent('/library')}`)

  let recipes: Awaited<ReturnType<typeof getRecipesByIds>>
  try {
    recipes = await getRecipesByIds(user.userId, ids) // only the user's own; anything else is left out
  } catch (err) {
    console.error('Loading recipes to delete failed:', err)
    return (
      <div className="notice notice-error" role="alert">
        <p>The recipes couldn’t be loaded. The recipe database didn’t respond. Nothing was deleted.</p>
        <p>
          <Link href="/library">Go back to your Library</Link> and try again in a moment.
        </p>
      </div>
    )
  }

  if (!recipes.length) {
    return (
      <>
        <h1>Delete recipes</h1>
        <p>No recipes were chosen, so nothing was deleted. Tick the recipes you want to delete in your Library first.</p>
        <p>
          <Link href="/library">Go back to your Library</Link>
        </p>
      </>
    )
  }

  const one = recipes.length === 1
  const cancelHref = one && !fromLibrary ? `/recipe/${recipes[0].recipeId}` : '/library'
  const copies = recipes.filter((r) => r.kind === 'saved_copy').length

  return (
    <>
      <h1>{one ? 'Delete this recipe?' : `Delete these ${recipes.length} recipes?`}</h1>
      <ul>
        {recipes.map((r) => (
          <li key={r.recipeId}>
            <strong>{r.title}</strong> <span className="hint">({r.kind === 'saved_copy' ? 'saved copy' : 'private'})</span>
          </li>
        ))}
      </ul>
      <p className="notice">
        {one ? 'It' : 'They'} will be deleted permanently, with {one ? 'its' : 'their'} ingredients, steps, notes, and tags.
        This can’t be undone.
        {copies > 0 && ' The catalog recipes that copies were saved from stay in the catalog.'}
      </p>
      <form action={deleteRecipesAction} className="actions">
        {recipes.map((r) => (
          <input key={r.recipeId} type="hidden" name="id" value={r.recipeId} />
        ))}
        <button type="submit" className="danger">
          {one ? 'Delete permanently' : `Delete ${recipes.length} recipes permanently`}
        </button>
        <Link href={cancelHref}>Cancel</Link>
      </form>
    </>
  )
}
