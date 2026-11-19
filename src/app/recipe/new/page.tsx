// New private recipe: /recipe/new (SRS §4.3 · REQ-3.1–3.6, 3.9 · NFR-9, NFR-10).
// Only its owner can see it (REQ-3.2). Blocked when the Library is full (REQ-3.6).
// The dish photo (REQ-3.7) comes with the Recipe photos issue in M3.

import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { RecipeForm } from '@/components/RecipeForm'
import { getCurrentUser } from '@/lib/auth/session'
import { getLibraryUsage, libraryFullMessage, type LibraryUsage } from '@/lib/library'
import { emptyDraft } from '@/lib/recipes/form'
import { createRecipeAction } from './actions'

export const metadata: Metadata = { title: 'New private recipe' }

export default function NewRecipePage() {
  return (
    <section>
      <h1>New private recipe</h1>
      <Suspense fallback={<p>Loading…</p>}>
        <NewRecipeContent />
      </Suspense>
    </section>
  )
}

async function NewRecipeContent() {
  const user = await getCurrentUser() // reads the login cookie, so this is fresh on every visit
  if (!user) redirect(`/login?next=${encodeURIComponent('/recipe/new')}`)

  let usage: LibraryUsage | null = null
  try {
    usage = await getLibraryUsage(user.userId)
  } catch (err) {
    console.error('Checking the Library failed:', err) // the save checks the limit again anyway
  }

  if (usage?.full) {
    // REQ-3.6
    return (
      <div className="notice" role="status">
        <p>{libraryFullMessage(usage.cap)}</p>
        <p>
          <Link href="/library">Delete some recipes in your Library</Link> to make room for a new one.
        </p>
      </div>
    )
  }

  return (
    <>
      <p className="hint">
        Only you can see this recipe. Fields marked * are required.
        {usage?.nearlyFull && ` You’re using ${usage.used} of your ${usage.cap} recipes.`}
      </p>
      <RecipeForm
        action={createRecipeAction}
        initial={emptyDraft()}
        draftKey={`forkful:draft:new:${user.userId}`}
        cancelHref="/library"
        submitLabel="Save recipe"
      />
    </>
  )
}
