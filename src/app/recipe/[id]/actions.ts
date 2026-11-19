'use server'
// Server actions for the recipe pages: Save a Copy (REQ-2.1, 2.4, 2.5, 2.7) and
// saving the edit form (REQ-2.2, REQ-3.3).

import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/session'
import { getCatalogRecipe } from '@/lib/catalog'
import { isLibraryFull } from '@/lib/db'
import { getSaveCopyStatus, libraryFullMessage, saveCopy, updateOwnRecipe } from '@/lib/library'
import { parseRecipeForm, type FormErrors } from '@/lib/recipes/form'

export type SaveCopyState = {
  error?: string
  full?: boolean
  existing?: { recipeId: string; title: string; createdAt: string }[] // REQ-2.5
}

const FULL_HINT = 'Delete some recipes in your Library to make room, then try again.'

export async function saveCopyAction(_prev: SaveCopyState, form: FormData): Promise<SaveCopyState> {
  const catalogId = String(form.get('catalogId') ?? '')
  const another = form.get('another') === '1' // the user chose "Save another copy"

  const user = await getCurrentUser()
  if (!user) redirect(`/login?next=${encodeURIComponent(`/recipe/${catalogId}`)}`)

  let newId: string
  try {
    // Read the catalog recipe again now, not from the page: it may have just been removed.
    const original = await getCatalogRecipe(catalogId)
    if (!original) {
      // REQ-2.4
      return { error: 'Recipe not found/unavailable. It may have just been removed from the catalog, so nothing was saved.' }
    }
    const status = await getSaveCopyStatus(user.userId, catalogId)
    if (status.full) return { full: true, error: `${libraryFullMessage(status.cap)} ${FULL_HINT}` } // REQ-2.7
    if (!another && status.copies.length) return { existing: status.copies } // REQ-2.5
    newId = await saveCopy(user.userId, original)
  } catch (err) {
    if (isLibraryFull(err)) return { full: true, error: `${(err as Error).message}. ${FULL_HINT}` } // two clicks at once
    console.error('Save a Copy failed:', err)
    return { error: 'Your copy wasn’t saved. The recipe database didn’t respond. Please try again in a moment.' }
  }
  redirect(`/recipe/${newId}?saved=1`) // outside the try: redirect() works by throwing
}

export type EditState = { message?: string; errors?: FormErrors }

export async function updateRecipeAction(_prev: EditState, form: FormData): Promise<EditState> {
  const recipeId = String(form.get('recipeId') ?? '')

  const user = await getCurrentUser()
  if (!user) {
    // Don't redirect: that would lose the changes still in the form.
    return {
      message:
        'Your changes weren’t saved because you were logged out after 30 minutes without activity. ' +
        'Log in again in a new tab, then come back here and click Save changes.',
    }
  }

  const { input, errors } = parseRecipeForm(form)
  if (Object.keys(errors).length) {
    return { message: 'Your changes weren’t saved yet. Fix the highlighted fields, then save again.', errors }
  }

  try {
    const saved = await updateOwnRecipe(user.userId, recipeId, input)
    if (!saved) return { message: 'This recipe couldn’t be found. It may have been deleted, so your changes weren’t saved.' }
  } catch (err) {
    console.error('Saving a recipe failed:', err)
    return { message: 'Your changes weren’t saved. The recipe database didn’t respond. Please try again in a moment.' }
  }
  redirect(`/recipe/${recipeId}?updated=1`)
}
