// Shown for an unknown or removed recipe, and for anyone else's private recipe,
// so it never reveals that a private recipe exists (REQ-3.2, NFR-17).

import Link from 'next/link'

export default function RecipeNotFound() {
  return (
    <section className="narrow">
      <h1>Recipe not found</h1>
      <p>
        This recipe isn’t available. It may have been removed from the catalog, the link may be wrong, or it’s a
        private recipe that belongs to another account.
      </p>
      <p className="actions">
        <Link href="/catalog" className="button-link">Search recipes</Link>
        <Link href="/library">Go to my Library</Link>
      </p>
    </section>
  )
}
