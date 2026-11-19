// Edit one of your own recipes: /recipe/<id>/edit (REQ-2.2).
// Catalog recipes can't be edited (BR-1): save a copy first. Someone else's
// recipe, or an unknown id, shows "Recipe not found".

import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Suspense } from 'react'
import { RecipeForm } from '@/components/RecipeForm'
import { getCurrentUser } from '@/lib/auth/session'
import { getOwnRecipe } from '@/lib/library'
import { draftFromRecipe } from '@/lib/recipes/form'
import type { RecipeView } from '@/lib/recipes/view'
import { updateRecipeAction } from '../actions'

export const metadata: Metadata = { title: 'Edit recipe' }

type Params = Promise<{ id: string }>

export default function EditRecipePage({ params }: { params: Params }) {
  return (
    <section>
      <h1>Edit recipe</h1>
      <Suspense fallback={<p>Loading recipe…</p>}>
        <EditContent params={params} />
      </Suspense>
    </section>
  )
}

async function EditContent({ params }: { params: Params }) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user) redirect(`/login?next=${encodeURIComponent(`/recipe/${id}/edit`)}`)

  let recipe: RecipeView | null
  try {
    recipe = await getOwnRecipe(user.userId, id)
  } catch (err) {
    console.error('Loading a recipe to edit failed:', err)
    return (
      <div className="notice notice-error" role="alert">
        <p>This recipe couldn’t be loaded for editing. The recipe database didn’t respond.</p>
        <p>
          <a href={`/recipe/${encodeURIComponent(id)}/edit`}>Try again</a> in a moment, or{' '}
          <Link href="/library">go back to your Library</Link>.
        </p>
      </div>
    )
  }
  if (!recipe) notFound()

  return (
    <>
      <p className="hint">
        {recipe.kind === 'saved_copy'
          ? 'This is your copy. Changing it never changes the catalog recipe.'
          : 'This is your private recipe. Only you can see it.'}{' '}
        Fields marked * are required.
      </p>
      <RecipeForm
        action={updateRecipeAction}
        recipeId={recipe.id}
        initial={draftFromRecipe(recipe)}
        draftKey={`forkful:draft:edit:${recipe.id}`}
        cancelHref={`/recipe/${recipe.id}`}
        submitLabel="Save changes"
      />
    </>
  )
}
