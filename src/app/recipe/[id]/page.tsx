// Recipe page: /recipe/<id> (REQ-1.5 · NFR-11 · BR-8; decision 23).
//
// The id is either a catalog recipe (anyone can see it) or one of the logged-in
// user's own recipes (only they can see it; REQ-3.2, NFR-17). Anything else,
// including someone else's private recipe, shows the same "Recipe not found" page.

import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { RecipeDetail, type OriginalStatus } from '@/components/RecipeDetail'
import { getCurrentUser } from '@/lib/auth/session'
import { getCatalogRecipe } from '@/lib/catalog'
import { getOwnRecipe, getSaveCopyStatus, type SaveCopyStatus } from '@/lib/library'
import { originalStatus } from '@/lib/recipes/hash'
import { toRecipeContent, type RecipeView } from '@/lib/recipes/view'
import { SaveCopy } from './SaveCopy'

export const metadata: Metadata = { title: 'Recipe' }

type Params = Promise<{ id: string }>
type SearchParams = Promise<Record<string, string | string[] | undefined>>

export default function RecipePage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  return (
    <Suspense fallback={<p>Loading recipe…</p>}>
      <RecipeContent params={params} searchParams={searchParams} />
    </Suspense>
  )
}

async function RecipeContent({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const [{ id }, query] = await Promise.all([params, searchParams]) // reading these makes this fresh on every visit

  let recipe: RecipeView | null
  let userId: string | null
  try {
    const [fromCatalog, user] = await Promise.all([getCatalogRecipe(id), getCurrentUser()])
    userId = user?.userId ?? null
    recipe = fromCatalog ?? (userId ? await getOwnRecipe(userId, id) : null)
  } catch (err) {
    console.error('Recipe page failed:', err)
    // NFR-24: problem, cause, action, and a retry.
    return (
      <div className="notice notice-error" role="alert">
        <p>This recipe couldn’t be loaded. The recipe database didn’t respond.</p>
        <p>
          <a href={`/recipe/${encodeURIComponent(id)}`}>Try again</a> in a moment, or{' '}
          <Link href="/catalog">go back to search</Link>.
        </p>
      </div>
    )
  }

  if (!recipe) notFound() // outside the try, so it isn't caught as an error

  if (recipe.kind === 'catalog') {
    let status: SaveCopyStatus | null | 'logged-out' = 'logged-out'
    if (userId) status = await getSaveCopyStatus(userId, recipe.id).catch(() => null)
    return <RecipeDetail recipe={recipe} actions={<SaveCopy catalogId={recipe.id} status={status} />} />
  }

  // The user's own recipe: saved copy or private.
  const original = recipe.copyOf ? await checkOriginal(recipe.copyOf) : null
  return (
    <>
      {query.saved === '1' && (
        <p className="notice notice-ok" role="status">
          Saved to your Library. This copy is yours: change anything you like with Edit recipe.
        </p>
      )}
      {query.updated === '1' && (
        <p className="notice notice-ok" role="status">Your changes were saved.</p>
      )}
      <RecipeDetail
        recipe={recipe}
        original={original}
        actions={
          <>
            <Link href={`/recipe/${recipe.id}/edit`} className="button-link">Edit recipe</Link>
            <Link href="/library">Back to my Library</Link>
          </>
        }
      />
    </>
  )
}

/**
 * REQ-2.6: has the catalog original changed or gone since it was copied?
 * forkful_app can't read the catalog, so read it with catalogDb() and compare here.
 * Null if the catalog can't be reached right now; the page still shows the copy.
 */
async function checkOriginal(copyOf: { catalogId: string; sourceHash: string }): Promise<OriginalStatus | null> {
  try {
    const now = await getCatalogRecipe(copyOf.catalogId)
    const status = originalStatus(copyOf, now && { ...toRecipeContent(now), status: 'active' })
    return { status, catalogId: copyOf.catalogId }
  } catch (err) {
    console.error('Checking the original recipe failed:', err)
    return null
  }
}
