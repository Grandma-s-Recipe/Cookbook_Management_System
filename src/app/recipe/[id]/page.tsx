// Recipe page: /recipe/<id> (REQ-1.5 · NFR-11 · BR-8).
//
// The id is either a catalog recipe (anyone can see it) or one of the logged-in
// user's own recipes (only they can see it; REQ-3.2, NFR-17). Anything else,
// including someone else's private recipe, shows the same "Recipe not found" page.

import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { RecipeDetail } from '@/components/RecipeDetail'
import { getCurrentUser } from '@/lib/auth/session'
import { getCatalogRecipe } from '@/lib/catalog'
import { getOwnRecipe } from '@/lib/library'
import type { RecipeView } from '@/lib/recipes/view'
import { SaveCopy } from './SaveCopy'

export const metadata: Metadata = { title: 'Recipe' }

type Params = Promise<{ id: string }>

export default function RecipePage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<p>Loading recipe…</p>}>
      <RecipeContent params={params} />
    </Suspense>
  )
}

async function RecipeContent({ params }: { params: Params }) {
  const { id } = await params // reading params makes this fresh on every visit

  let recipe: RecipeView | null
  let loggedIn: boolean
  try {
    const [fromCatalog, user] = await Promise.all([getCatalogRecipe(id), getCurrentUser()])
    loggedIn = user !== null
    recipe = fromCatalog ?? (user ? await getOwnRecipe(user.userId, id) : null)
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

  return (
    <RecipeDetail
      recipe={recipe}
      actions={
        recipe.kind === 'catalog' ? (
          <SaveCopy catalogId={recipe.id} loggedIn={loggedIn} />
        ) : (
          <Link href="/library">Back to my Library</Link>
        )
      }
    />
  )
}
