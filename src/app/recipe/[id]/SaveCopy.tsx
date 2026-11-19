// The "Save a Copy" area on a catalog recipe (REQ-1.5).
// Logged-out visitors are sent to log in first, and come back here afterwards.
// The button itself starts working with the "Save a copy and edit it" issue (#3, REQ-2.1).

import Link from 'next/link'

export function SaveCopy({ catalogId, loggedIn }: { catalogId: string; loggedIn: boolean }) {
  if (!loggedIn) {
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

  return (
    <>
      <button type="button" disabled aria-describedby="save-copy-soon">Save a Copy</button>
      <p className="hint" id="save-copy-soon">Saving copies is coming in the next update.</p>
    </>
  )
}
