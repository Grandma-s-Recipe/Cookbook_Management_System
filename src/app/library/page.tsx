import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = { title: 'Library' }

// Placeholder until M2 (§4.10).
export default function LibraryPage() {
  return (
    <section>
      <h1>Your Library</h1>
      <p>Your saved copies and private recipes will appear here. This page is coming in the next milestone.</p>
      <p><Link href="/catalog">Browse the catalog</Link> in the meantime.</p>
    </section>
  )
}
