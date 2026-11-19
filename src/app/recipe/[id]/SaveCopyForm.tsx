'use client'
// The Save a Copy button (REQ-2.1). If the user already has a copy, it says so and
// offers to open it or save another (REQ-2.5). On success the action opens the new copy.

import Link from 'next/link'
import { useActionState } from 'react'
import { saveCopyAction, type SaveCopyState } from './actions'

type Copy = { recipeId: string; title: string; createdAt: string }

// Fixed language and time zone, so the server and the browser print the same date.
function savedOn(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

export function SaveCopyForm({ catalogId, copies }: { catalogId: string; copies: Copy[] }) {
  const [state, formAction, pending] = useActionState<SaveCopyState, FormData>(saveCopyAction, {})

  if (state.full) {
    return (
      <p className="notice notice-error" role="alert">
        {state.error} <Link href="/library">Go to my Library</Link>
      </p>
    )
  }

  // Copies known when the page loaded, or found when the button was clicked.
  const existing = state.existing ?? copies
  const latest = existing[0]

  return (
    <>
      <form action={formAction}>
        <input type="hidden" name="catalogId" value={catalogId} />
        {latest && <input type="hidden" name="another" value="1" />}
        <button type="submit" disabled={pending}>
          {pending ? 'Saving…' : latest ? 'Save another copy' : 'Save a Copy'}
        </button>
      </form>

      {latest && (
        <p className="hint" role={state.existing ? 'status' : undefined}>
          You already have {existing.length === 1 ? 'a copy' : `${existing.length} copies`} of this recipe (saved{' '}
          {savedOn(latest.createdAt)}). <Link href={`/recipe/${latest.recipeId}`}>Open my copy</Link>, or save another.
        </p>
      )}

      {state.error && (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      )}
    </>
  )
}
