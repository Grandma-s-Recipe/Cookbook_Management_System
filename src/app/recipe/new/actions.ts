'use server'
// Save a new private recipe (REQ-3.1, REQ-3.3, REQ-3.6).

import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { isLibraryFull } from '@/lib/db'
import { createPrivateRecipe } from '@/lib/library'
import { parseRecipeForm, type RecipeFormState } from '@/lib/recipes/form'

export async function createRecipeAction(_prev: RecipeFormState, form: FormData): Promise<RecipeFormState> {
  const user = await getCurrentUser()
  if (!user) {
    // Don't redirect: that would lose what's in the form (it's also kept in this browser, NFR-9).
    return {
      message:
        'Your recipe wasn’t saved because you were logged out after 30 minutes without activity. ' +
        'Log in again in a new tab, then come back here and click Save recipe.',
    }
  }

  const { input, errors } = parseRecipeForm(form)
  if (Object.keys(errors).length) {
    return { message: 'Your recipe wasn’t saved yet. Fill in or fix the highlighted fields, then save again.', errors }
  }

  let recipeId: string
  try {
    recipeId = await createPrivateRecipe(user.userId, input)
  } catch (err) {
    if (isLibraryFull(err)) {
      // REQ-3.6
      return { message: `${(err as Error).message}. Delete some recipes in your Library to make room, then save again.` }
    }
    console.error('Saving a new recipe failed:', err)
    return { message: 'Your recipe wasn’t saved. The recipe database didn’t respond. Please try again in a moment.' }
  }
  redirect(`/recipe/${recipeId}?created=1`)
}
