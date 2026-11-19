// The "Save a Copy" area on a catalog recipe (REQ-1.5, REQ-2.1, 2.5, 2.7).
// Logged-out visitors are sent to log in first, and come back here afterwards.

import Link from 'next/link'
import { libraryFullMessage, type SaveCopyStatus } from '@/lib/library'
import { SaveCopyForm } from './SaveCopyForm'

export function SaveCopy({ catalogId, status }: { catalogId: string; status: SaveCopyStatus | null | 'logged-out' }) {
  if (status === 'logged-out') {
    const next = encodeURIComponent(`/recipe/${catalogId}`)
    return (
      <>
        <Link href={`/login?next=${next}`} className="button-link">Save a Copy</Link>
        <p className="hint">
          Log in to save a copy to your Library. New here? <Link href="/signup">Create a free account</Link>.
        </p>
      </>
    )
  }

  if (status?.full) {
    // REQ-2.7: blocked, with the limit from app.settings.
    return (
      <p className="notice" role="status">
        {libraryFullMessage(status.cap)} <Link href="/library">Delete some recipes in your Library</Link> to make room
        for new ones.
      </p>
    )
  }

  // status is null if the Library couldn't be checked; the button still works,
  // and the save itself checks everything again.
  return <SaveCopyForm catalogId={catalogId} copies={status?.copies ?? []} />
}
